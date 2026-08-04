import { expect, test } from "vitest";

import {
  certbotArgs,
  deployTargets,
  domainConflictScript,
  ghDeployConfig,
  nginxWriteScript,
  serverSetupScript,
} from "../commands";
import { renderNginxBlock } from "../nginx";

const d = deployTargets("acme", "vps.example.com");

test("deployTargets derives a plain user and the /srv/www path", () => {
  expect(d).toMatchObject({ user: "acme", path: "/srv/www/acme" });
});

test("serverSetupScript is idempotent, guards foreign homes, and installs the key", () => {
  const s = serverSetupScript(d, "ssh-ed25519 AAAA... deploy");
  expect(s).toContain("chmod 3775 /srv/www");
  expect(s).toContain("useradd -m -d /srv/www/acme");
  expect(s).toContain("refusing");
  expect(s).toContain("/srv/www/acme/.ssh");
  expect(s).toContain("usermod -aG docker acme");
  expect(s).toContain("usermod -aG deploy acme");
  expect(s).toContain("authorized_keys");
  expect(s).toContain("ssh-ed25519 AAAA... deploy");
  expect(s).not.toContain("/home/");
  expect(s).not.toContain("deploy-");
});

test("a quote in the public key cannot break out of the root script", () => {
  const s = serverSetupScript(d, "ssh-ed25519 AAAA'; echo PWNED > /tmp/x; '");

  expect(s).toContain("'ssh-ed25519 AAAA'\\''; echo PWNED > /tmp/x; '\\'''");
  expect(s).not.toMatch(/^\s*echo PWNED/m);
});

test("nginxWriteScript validates before committing, with a rollback on failure", () => {
  const s = nginxWriteScript("acme", "server { listen 80; }");
  expect(s).toContain("/etc/nginx/conf.d/acme.conf");
  expect(s).toContain(".bak");
  expect(s).toContain("if nginx -t; then");
  expect(s).toContain('mv "$conf.bak" "$conf"');
  expect(s).toContain("exit 1");

  const success = s.slice(s.indexOf("if nginx -t; then"), s.indexOf("else"));
  expect(success).toContain('fail2ban-client reload "$j"');
  expect(success).toContain("nginx-limit-req nginx-botsearch");
  expect(s).toMatch(/reload|nginx -s reload/);
});

test("certbotArgs are non-interactive with the email, using the webroot method", () => {
  expect(certbotArgs("acme.example.com", "me@x.io")).toEqual([
    "certonly",
    "--webroot",
    "-w",
    "/var/www/certbot",
    "-d",
    "acme.example.com",
    "--non-interactive",
    "--agree-tos",
    "-m",
    "me@x.io",
  ]);
});

test("ghDeployConfig includes the SSH secrets and DEPLOY_PATH; app url only when needed", () => {
  const withUrl = ghDeployConfig(d, "acme.example.com", "PRIVKEY", true);
  expect(withUrl).toContainEqual({
    kind: "secret",
    name: "DEPLOY_SSH_KEY",
    value: "PRIVKEY",
  });
  expect(withUrl).toContainEqual({
    kind: "secret",
    name: "DEPLOY_SSH_HOST",
    value: "vps.example.com",
  });
  expect(withUrl).toContainEqual({
    kind: "secret",
    name: "DEPLOY_SSH_USER",
    value: "acme",
  });
  expect(withUrl).toContainEqual({
    kind: "variable",
    name: "DEPLOY_PATH",
    value: "/srv/www/acme",
  });
  expect(withUrl).toContainEqual({
    kind: "variable",
    name: "NEXT_PUBLIC_APP_URL",
    value: "https://acme.example.com",
  });

  const noUrl = ghDeployConfig(d, "acme.example.com", "PRIVKEY", false);
  expect(noUrl.some((c) => c.name === "NEXT_PUBLIC_APP_URL")).toBe(false);
});

test("nginxWriteScript keeps one generation instead of deleting the backup", () => {
  const s = nginxWriteScript("acme", "server { listen 80; }");
  expect(s).toContain('mv "$conf.bak" "$conf.prev"');
  expect(s).not.toContain('rm -f "$conf.bak"');
});

test("domainConflictScript escapes dots so a domain cannot match a wildcard", () => {
  const s = domainConflictScript("acme.example.com");
  expect(s).toContain("acme\\.example\\.com");
  expect(s).toContain("/etc/nginx/conf.d/*.conf");
  expect(s).toContain("|| true");
});

test("per-project logs are locked down to 0640, not nginx's 0644 default", () => {
  const s = nginxWriteScript(
    "acme",
    renderNginxBlock("acme.example.com", 8100),
  );
  expect(s).toContain("/var/log/nginx/[^ ;]+\\.log");
  expect(s).toContain("install -m 640 -o www-data -g adm /dev/null");
  expect(s).toContain("chown www-data:adm");
  expect(s).toContain("getent group adm");
});
