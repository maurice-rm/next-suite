# Server requirements

This page answers one question: what does a server need before
`next-suite provision` runs through? Provision checks these prerequisites and
creates none of them — your nginx setup stays yours. Set them up once per host,
then provision as many projects onto it as you like.

The order below is deliberate: harden first, then open ports, then add services.

## Overview

You need a fresh Ubuntu 24.04 server, or any distribution close enough that
`apt`, `nginx`, `certbot`, and Docker's official repository behave the same way.
Provision connects as **root over SSH with a key**, because every remote step
runs the bare command — `useradd`, `cat > /etc/nginx/…`, `certbot` — and a
non-root user with passwordless sudo fails midway through a run. That is why
root login by key stays enabled below while password login is turned off.

Keep a second SSH session open whenever you change SSH or the firewall, and test
the change in that second session before you close the first one. Your provider's
web console is the last resort.

## Base hardening

### SSH

Configure SSH through a drop-in file. A drop-in under `/etc/ssh/sshd_config.d/`
survives package updates; edits to the main file do not.

```bash
cat > /etc/ssh/sshd_config.d/10-hardening.conf <<'EOF'
PasswordAuthentication no
KbdInteractiveAuthentication no
PermitRootLogin prohibit-password
EOF

sshd -t && systemctl reload ssh
```

`sshd -t` validates the syntax **before** the reload. Without it, a broken
configuration can take the service down at its next start, and you find out when
you can no longer log in.

`prohibit-password` is the setting provision needs: root may still authenticate
with a key, but never with a password.

### The deploy group

Provision hands GitHub Actions a private key that is a login on this host. By
default that login may open SSH tunnels, so anyone who can run a workflow — or
any compromised third-party action — reaches every port bound to `127.0.0.1`:
other projects, their databases, any admin interface. The deploy user is also
added to the `docker` group, which on any host is equivalent to root.

One group plus one sshd rule takes the tunneling away without affecting the
deploy itself:

```bash
groupadd -f deploy
cat > /etc/ssh/sshd_config.d/10-deploy.conf <<'EOF'
Match Group deploy
    DisableForwarding yes
EOF
sshd -t && systemctl reload ssh
```

Two assumptions carry this, and both are easy to break:

- **The group must exist before the first `provision` run.** Provision adds the
  project user to `deploy` only if the group is already there, and skips it
  silently otherwise. For users provisioned earlier,
  `usermod -aG deploy <project>` catches up.
- **The `Match` block must live in its own file.** A `Match` section applies
  until the next `Match` or the end of its file. In a shared file, everything
  written after it silently inherits the restrictions; in its own drop-in, it
  cannot leak onto other logins.

`DisableForwarding` covers TCP, agent, tunnel **and** Unix-socket forwarding in
one directive. Setting the three individually is the common recipe and leaves
`AllowStreamLocalForwarding` at its default of `yes`, so the deploy key can still
forward a Unix socket — a database socket, or the Docker socket itself.

Verify both directions:

```bash
sshd -T -C user=<project> | grep disableforwarding     # yes
sshd -T -C user=root | grep disableforwarding          # no
```

Do not verify this with `allowtcpforwarding`. `DisableForwarding` overrides the
individual options at runtime but leaves them reading `yes` in `sshd -T`, so that
grep suggests forwarding is open when it is not. Measured: a `-L` forward as the
project user is refused while the same forward as root succeeds.

### Firewall

The rule is the same everywhere: **22, 80, and 443 inbound, nothing else.** Run
two layers if your provider offers a network-level firewall in front of the
machine, because the two catch different things.

| Layer                     | Catches                                                  | Does not catch                     |
| ------------------------- | -------------------------------------------------------- | ---------------------------------- |
| Network firewall (pre-VM) | Everything inbound, **including published Docker ports** | Nothing, as long as it is attached |
| `ufw` (on the host)       | Host services that accidentally listen on `0.0.0.0`      | **Docker's published ports**       |

```bash
apt install -y ufw
ufw allow 22/tcp  comment 'SSH'
ufw allow 80/tcp  comment 'HTTP'
ufw allow 443/tcp comment 'HTTPS'
ufw enable
ufw status verbose
```

`ufw` does not protect Docker's published ports. Docker writes its forwarding
rules into the `DOCKER-USER` iptables chain, which is evaluated **before** ufw's
chain. A container declaring `ports: ["7001:80"]` stays reachable from the
internet even though ufw allows only 22, 80, and 443. The network layer catches
that; the real fix is the binding: `ports: ["127.0.0.1:7001:80"]`. Provision
enforces this for the projects it manages, but a hand-written compose file is
your responsibility.

Check what is actually exposed:

```bash
ss -ltn | awk '$4 !~ /^127\.|^\[::1\]/'
```

Anything in that list other than 22, 80, and 443 does not belong there.

### fail2ban

```bash
apt install -y fail2ban

cat > /etc/fail2ban/jail.local <<'EOF'
[DEFAULT]
backend = systemd
bantime = 1h
findtime = 10m
maxretry = 5

[sshd]
enabled = true
EOF

systemctl enable --now fail2ban
fail2ban-client status sshd
```

`backend = systemd` is the part that matters. Ubuntu 24.04 logs to the systemd
journal, and with the default `backend = auto` fail2ban may find no log file at
all: the jail then runs silently and you only notice because it never bans
anyone.

Provision assumes the `nginx-limit-req` and `nginx-botsearch` jails may exist —
after it writes a site config it reloads both, because their `*error.log` glob is
resolved only when a jail starts and would otherwise never watch the new file.
Neither jail is required; the reload is best-effort.

### Unattended upgrades

```bash
apt install -y unattended-upgrades
systemctl enable --now unattended-upgrades
unattended-upgrade --dry-run --debug 2>&1 | tail -5
```

Leave automatic reboots off, which is the default — on a host with running
services that is the safer choice. The trade-off is that you apply kernel updates
yourself; `ls /var/run/reboot-required` tells you whether one is pending.

## Docker

Use Docker's official repository rather than the distribution packages. Only
there do you get current versions and the Compose plugin, and preflight requires
both `docker compose version` and a responding daemon.

```bash
apt install -y ca-certificates curl
install -m 0755 -d /etc/apt/keyrings
curl -fsSL https://download.docker.com/linux/ubuntu/gpg -o /etc/apt/keyrings/docker.asc
chmod a+r /etc/apt/keyrings/docker.asc

echo "deb [arch=$(dpkg --print-architecture) signed-by=/etc/apt/keyrings/docker.asc] \
https://download.docker.com/linux/ubuntu $(. /etc/os-release && echo "$VERSION_CODENAME") stable" \
  > /etc/apt/sources.list.d/docker.list

apt update
apt install -y docker-ce docker-ce-cli containerd.io docker-buildx-plugin docker-compose-plugin

docker --version && docker compose version
```

Do not run `usermod -aG docker` by hand. Provision adds each project user to the
group itself, and only to a group that already exists.

Preflight checks the daemon as well as the plugin, deliberately: only
`docker info` needs a running daemon, and the plugin check alone would pass on a
host where the daemon is down. Provision would then succeed and the first deploy
would fail.

## nginx and certbot

### Packages and the ACME webroot

```bash
apt install -y nginx certbot python3-certbot-nginx rsync
mkdir -p /var/www/certbot
systemctl enable --now nginx
```

`rsync` is there for the deploy, not for nginx: the generated CD workflow ships
`docker-compose.prod.yml`, `nginx/` and `scripts/` with it, and rsync has to
exist on both ends. Preflight does not check it, because provision itself never
needs it — without it, provision succeeds and the first deploy fails.

`python3-certbot-nginx` is needed even though provision never runs certbot's
nginx installer — it is where the TLS helper files below come from.
`/var/www/certbot` is the webroot for `certbot certonly --webroot`.

### The two TLS helper files

This is the usual stumbling block on a fresh server. The generated site config
includes `options-ssl-nginx.conf` and `ssl-dhparams.pem`. Both ship inside the
certbot packages, but they are only copied into `/etc/letsencrypt` when certbot's
own **nginx installer** runs — and provision uses `certonly --webroot`, which
never invokes it. On a new host they therefore never appear on their own, and
preflight blocks. Put them there once:

```bash
install -m 644 "$(python3 -c 'import os,certbot;print(os.path.dirname(certbot.__file__))')/ssl-dhparams.pem" \
  /etc/letsencrypt/ssl-dhparams.pem
install -m 644 "$(python3 -c 'import os,certbot_nginx;print(os.path.dirname(certbot_nginx.__file__))')/_internal/tls_configs/options-ssl-nginx.conf" \
  /etc/letsencrypt/options-ssl-nginx.conf
```

Deriving the paths through `python3 -c` rather than hardcoding
`/usr/lib/python3/dist-packages/…` keeps this working across distributions and
certbot versions. If certbot came from snap or pip instead, the same import trick
still finds it.

Generating the parameters yourself is only the fallback:

```bash
openssl dhparam -out /etc/letsencrypt/ssl-dhparams.pem 2048    # takes a minute or two
```

Use 2048 bits, which is what certbot itself writes. More buys nothing here: TLS
1.3 does not use `ssl_dhparam` at all, and at 2048 bits your own parameters are
no stronger than the standard group.

Missing files here are not a soft failure. A non-glob `include` of a file that
does not exist aborts nginx's config load, so this is a prerequisite rather than
a nicety.

### The `:443` catch-all default server

First, free the slot. Ubuntu ships a site that already claims `default_server`
on port 80; leaving it in place makes the next step fail with
`duplicate default server`.

```bash
rm -f /etc/nginx/sites-enabled/default
```

Then add the catch-all as `/etc/nginx/conf.d/00-default.conf`:

```nginx
server {
    listen      80 default_server;
    listen      [::]:80 default_server;
    server_name _;
    return 404;
}

server {
    listen 443 ssl default_server;
    listen [::]:443 ssl default_server;

    ssl_protocols TLSv1.2 TLSv1.3;
    ssl_reject_handshake on;
    return 444;
}
```

```bash
nginx -t && systemctl reload nginx
```

This is not optional, and preflight enforces it. Three separate reasons:

- **`ssl_protocols` is not selectable per SNI.** Without a `:443` default
  server, the alphabetically first project block becomes the default, and
  nginx's stock `TLSv1 TLSv1.1 …` then applies to every site on the box.
- **An unknown SNI would otherwise be answered with the first project's
  certificate.** `ssl_reject_handshake on` aborts the handshake instead, so no
  certificate is ever shown for a domain this host does not serve.
- **`return 444` is needed on top of the rejected handshake.** A client that
  presents a _valid_ SNI and then sends a foreign `Host:` header re-selects the
  virtual server after the handshake and lands in this same block. With no
  `return` there, nginx falls back to its compiled-in root — measured: `200 OK`
  with the distribution's default welcome page.

The `:80` half answers `404` rather than redirecting. A redirect for an unknown
host would only lead into the `:443` catch-all.

### The certbot deploy hook

certbot renews the certificate files, but a running nginx keeps the old ones in
memory until it is reloaded. Without a hook the renewal silently changes nothing,
and the failure surfaces about 60 days later as an expired certificate. The hook
also signals a project's own nginx container, which holds its own copy of the
files.

```bash
mkdir -p /etc/letsencrypt/renewal-hooks/deploy
cat > /etc/letsencrypt/renewal-hooks/deploy/reload-nginx.sh <<'EOF'
#!/bin/sh
set -e
systemctl is-active --quiet nginx && systemctl reload nginx
cids=$(docker ps -q --filter label=com.docker.compose.service=nginx)
if [ -n "$cids" ]; then
  echo "$cids" | xargs docker kill -s HUP
fi
EOF
chmod 755 /etc/letsencrypt/renewal-hooks/deploy/reload-nginx.sh
```

The `755` matters: certbot runs only hooks that are executable and skips the rest
without a word. Preflight mirrors that rule, and additionally ignores editor
backups ending in `~`.

The container IDs are assigned to a variable rather than piped directly. A
pipeline reports `xargs`' exit status, which would hide a failing `docker ps` and
let the hook claim success.

## Verification

Run the same checks provision runs, plus the hardening ones:

```bash
sshd -T | grep -E '^(passwordauthentication|permitrootlogin)'   # no / prohibit-password
ufw status verbose                                              # active: 22/80/443
fail2ban-client status sshd                                     # jail running
systemctl is-active unattended-upgrades nginx docker            # three times active
nginx -t
certbot renew --dry-run --run-deploy-hooks
```

The certbot dry run exercises the whole renewal path including the hook. It is a
no-op on a host without certificates, so it is worth repeating after the first
provision.

Each section above clears specific preflight checks:

| Preflight check | Cleared by                                      |
| --------------- | ----------------------------------------------- |
| `root`          | SSH hardening — root login by key stays enabled |
| `docker`        | Docker                                          |
| `nginx`         | Packages and the ACME webroot                   |
| `certbot`       | Packages and the ACME webroot                   |
| `webroot`       | Packages and the ACME webroot                   |
| `dhparams`      | The two TLS helper files                        |
| `options-ssl`   | The two TLS helper files                        |
| `tls-catch-all` | The `:443` catch-all default server             |
| `renewal-hook`  | The certbot deploy hook                         |

All nine green means `provision` runs through. From here on the CLI takes over —
see [Provisioning](provisioning.md), and
[Troubleshooting](troubleshooting.md) when a check stays red.

---

[Documentation index](README.md)
