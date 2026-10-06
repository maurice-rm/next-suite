import { getDeployKeyComment } from "./deploy-keypair";
import type { DeployTarget } from "./deploy-target";
import { getNginxConfPath } from "./server-paths";
import { quoteShellWord } from "./shell-quote";

export const buildServerSetupScript = (
  deploy: DeployTarget,
  publicKey: string,
): string => `set -eu
install -d /srv/www
getent passwd www-data >/dev/null && chown www-data:www-data /srv/www || true
chmod 3775 /srv/www
if id -u ${deploy.user} >/dev/null 2>&1; then
  [ "$(getent passwd ${deploy.user} | cut -d: -f6)" = "${deploy.path}" ] || { echo "User '${deploy.user}' already exists with a different home — refusing to touch it." >&2; exit 1; }
else
  useradd -m -d ${deploy.path} -s /bin/bash ${deploy.user}
fi
mkdir -p ${deploy.path}
chown ${deploy.user}:${deploy.user} ${deploy.path}
chmod 3755 ${deploy.path}
getent group docker >/dev/null && usermod -aG docker ${deploy.user} || true
getent group deploy >/dev/null && usermod -aG deploy ${deploy.user} || true
install -d -m 700 -o ${deploy.user} -g ${deploy.user} ${deploy.path}/.ssh
touch ${deploy.path}/.ssh/authorized_keys
awk -v comment=${quoteShellWord(getDeployKeyComment(deploy.name))} '$NF != comment' ${deploy.path}/.ssh/authorized_keys > ${deploy.path}/.ssh/authorized_keys.next
echo ${quoteShellWord(publicKey)} >> ${deploy.path}/.ssh/authorized_keys.next
mv ${deploy.path}/.ssh/authorized_keys.next ${deploy.path}/.ssh/authorized_keys
chmod 600 ${deploy.path}/.ssh/authorized_keys
chown ${deploy.user}:${deploy.user} ${deploy.path}/.ssh/authorized_keys
`;

/** Validates before committing: a failed `nginx -t` reverts the file instead of leaving a broken conf.d entry. */
export const buildNginxWriteScript = (
  name: string,
  block: string,
): string => `set -eu
conf=${getNginxConfPath(name)}
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

export const NGINX_RELOAD_SCRIPT =
  'nginx -t && (systemctl reload nginx 2>/dev/null || nginx -s reload); rc=$?; for j in nginx-limit-req nginx-botsearch; do fail2ban-client reload "$j" >/dev/null 2>&1 || true; done; exit $rc';

/**
 * conf.d files already serving `domain`. `nginx -t` only warns on a duplicate
 * `server_name` and still exits 0, so the write guard cannot catch this.
 */
export const buildDomainConflictScript = (domain: string): string =>
  `grep -lE 'server_name[^;]*[[:space:]]${domain.replace(/\./g, "\\.")}[[:space:];]' /etc/nginx/conf.d/*.conf 2>/dev/null || true`;

export const buildCertbotArgs = (domain: string, email: string): string[] => [
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
