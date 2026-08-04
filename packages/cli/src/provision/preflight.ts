import { defaultRunner, type Runner, type SshTarget } from "./ssh";

export interface Check {
  name: string;
  script: string;
  fail: string;
}

export const remoteChecks = (): Check[] => [
  {
    name: "root",
    script: '[ "$(id -u)" = 0 ]',
    fail: "The admin user must be root — provision writes to /etc and /srv directly, without sudo.",
  },
  {
    name: "nginx",
    script: "command -v nginx >/dev/null",
    fail: "nginx is not installed on the server.",
  },
  {
    name: "certbot",
    script: "command -v certbot >/dev/null",
    fail: "certbot is not installed on the server.",
  },
  {
    name: "docker",
    script:
      "docker compose version >/dev/null 2>&1 && docker info >/dev/null 2>&1",
    fail: 'Docker with the Compose plugin is missing, or its daemon is not running. The deploy runs `docker compose` on the server, so provision would succeed and the first deploy would fail. See "Docker" in docs/server-requirements.md.',
  },
  {
    name: "webroot",
    script: "[ -d /var/www/certbot ]",
    fail: "/var/www/certbot is missing. Create it: sudo mkdir -p /var/www/certbot",
  },
  {
    name: "dhparams",
    script: "[ -f /etc/letsencrypt/ssl-dhparams.pem ]",
    fail: "ssl-dhparams.pem missing — it ships with certbot's nginx plugin. To generate one instead: sudo openssl dhparam -out /etc/letsencrypt/ssl-dhparams.pem 2048",
  },
  {
    name: "options-ssl",
    script: "[ -f /etc/letsencrypt/options-ssl-nginx.conf ]",
    fail: "options-ssl-nginx.conf missing (ships with certbot).",
  },
  {
    name: "renewal-hook",
    script:
      "find /etc/letsencrypt/renewal-hooks/deploy -maxdepth 1 -type f -executable ! -name '*~' | grep -q .",
    fail: 'No executable deploy hook in /etc/letsencrypt/renewal-hooks/deploy. certbot would renew the certificate but nginx would keep serving the expiring one — visible only ~60 days later as an expired-cert outage. See "The certbot deploy hook" in docs/server-requirements.md.',
  },
  {
    name: "tls-catch-all",
    script:
      "nginx -T >/dev/null 2>&1 || { echo 'nginx -T failed' >&2; exit 1; }; nginx -T 2>/dev/null | grep -qE 'listen[^;]*\\b443\\b[^;]*default_server'",
    fail: 'No :443 default server on the host, or `nginx -T` does not load at all — run it on the server to see which — every site would inherit the stock ssl_protocols (TLS 1.0/1.1) and an unknown SNI would be served the first project\'s certificate. See "The :443 catch-all default server" in docs/server-requirements.md.',
  },
];

export const runPreflight = async (
  t: SshTarget,
  run: Runner = defaultRunner,
): Promise<void> => {
  const reach = await run("ssh", [`${t.user}@${t.host}`, "true"]);
  if (reach.exitCode !== 0) {
    throw new Error(`Cannot reach ${t.user}@${t.host}: ${reach.stderr}`);
  }

  const failures: string[] = [];
  for (const check of remoteChecks()) {
    const result = await run("ssh", [`${t.user}@${t.host}`, check.script]);
    if (result.exitCode !== 0) failures.push(check.fail);
  }

  if (failures.length > 0) {
    throw new Error(
      `Preflight failed:\n${failures.map((f) => `  - ${f}`).join("\n")}`,
    );
  }
};
