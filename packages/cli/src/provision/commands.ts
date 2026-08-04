/** Wraps a shell word in single quotes so it can't break out onto a second command. */
export const shQuote = (s: string): string => `'${s.replace(/'/g, "'\\''")}'`;

/**
 * Pins every `gh` call to one repository — otherwise `gh` picks the target from
 * the remotes, which in a fork is not necessarily `origin`.
 */
export const ghRepoArgs = (repo?: string): string[] =>
  repo === undefined ? [] : ["--repo", repo];

export interface Deploy {
  name: string;
  user: string;
  path: string;
  host: string;
}

export interface GhEntry {
  kind: "secret" | "variable";
  name: string;
  value: string;
}

export const deployTargets = (name: string, host: string): Deploy => ({
  name,
  user: name,
  path: `/srv/www/${name}`,
  host,
});

export const serverSetupScript = (
  d: Deploy,
  publicKey: string,
): string => `set -eu
install -d /srv/www
getent passwd www-data >/dev/null && chown www-data:www-data /srv/www || true
chmod 3775 /srv/www
if id -u ${d.user} >/dev/null 2>&1; then
  [ "$(getent passwd ${d.user} | cut -d: -f6)" = "${d.path}" ] || { echo "User '${d.user}' already exists with a different home — refusing to touch it." >&2; exit 1; }
else
  useradd -m -d ${d.path} -s /bin/bash ${d.user}
fi
mkdir -p ${d.path}
chown ${d.user}:${d.user} ${d.path}
chmod 3755 ${d.path}
getent group docker >/dev/null && usermod -aG docker ${d.user} || true
getent group deploy >/dev/null && usermod -aG deploy ${d.user} || true
install -d -m 700 -o ${d.user} -g ${d.user} ${d.path}/.ssh
touch ${d.path}/.ssh/authorized_keys
grep -qxF ${shQuote(publicKey)} ${d.path}/.ssh/authorized_keys || echo ${shQuote(publicKey)} >> ${d.path}/.ssh/authorized_keys
chmod 600 ${d.path}/.ssh/authorized_keys
chown ${d.user}:${d.user} ${d.path}/.ssh/authorized_keys
`;

/** Validates before committing: a failed `nginx -t` reverts the file instead of leaving a broken conf.d entry. */
export const nginxWriteScript = (
  name: string,
  block: string,
): string => `set -eu
conf=/etc/nginx/conf.d/${name}.conf
[ -f "$conf" ] && cp "$conf" "$conf.bak" || true
cat > "$conf" <<'NGINX_EOF'
${block}NGINX_EOF
if nginx -t; then
  [ -f "$conf.bak" ] && mv "$conf.bak" "$conf.prev" || true
  if getent group adm >/dev/null && getent passwd www-data >/dev/null; then
    grep -oE '/var/log/nginx/[^ ;]+\\.log' "$conf" | sort -u | while read -r logfile; do
      [ -e "$logfile" ] || install -m 640 -o www-data -g adm /dev/null "$logfile"
      chmod 640 "$logfile" && chown www-data:adm "$logfile"
    done
  fi
  systemctl reload nginx 2>/dev/null || nginx -s reload
  for j in nginx-limit-req nginx-botsearch; do
    fail2ban-client reload "$j" >/dev/null 2>&1 || true
  done
else
  if [ -f "$conf.bak" ]; then mv "$conf.bak" "$conf"; else rm -f "$conf"; fi
  echo "nginx -t failed; reverted $conf" >&2
  exit 1
fi
`;

/**
 * conf.d files already serving `domain`. `nginx -t` only warns on a duplicate
 * `server_name` and still exits 0, so the write guard cannot catch this.
 */
export const domainConflictScript = (domain: string): string =>
  `grep -lE 'server_name[^;]*[[:space:]]${domain.replace(/\./g, "\\.")}[[:space:];]' /etc/nginx/conf.d/*.conf 2>/dev/null || true`;

export const certbotArgs = (domain: string, email: string): string[] => [
  "certonly",
  "--webroot",
  "-w",
  "/var/www/certbot",
  "-d",
  domain,
  "--non-interactive",
  "--agree-tos",
  "-m",
  email,
];

export const ghDeployConfig = (
  d: Deploy,
  domain: string,
  privateKey: string,
  needsAppUrl: boolean,
): GhEntry[] => {
  const entries: GhEntry[] = [
    { kind: "secret", name: "DEPLOY_SSH_KEY", value: privateKey },
    { kind: "secret", name: "DEPLOY_SSH_HOST", value: d.host },
    { kind: "secret", name: "DEPLOY_SSH_USER", value: d.user },
    { kind: "variable", name: "DEPLOY_PATH", value: d.path },
  ];
  if (needsAppUrl) {
    entries.push({
      kind: "variable",
      name: "NEXT_PUBLIC_APP_URL",
      value: `https://${domain}`,
    });
  }
  return entries;
};
