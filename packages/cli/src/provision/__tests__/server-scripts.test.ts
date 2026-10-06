import { expect, test } from "vitest";

import { resolveDeployTarget } from "../deploy-target";
import { renderNginxBlock } from "../nginx";
import {
  buildCertbotArgs,
  buildDomainConflictScript,
  buildNginxWriteScript,
  buildServerSetupScript,
} from "../server-scripts";

const deploy = resolveDeployTarget("acme", "vps.example.com");

test("buildServerSetupScript is idempotent, guards foreign homes, and installs the key", () => {
  const script = buildServerSetupScript(deploy, "ssh-ed25519 AAAA... deploy");
  expect(script).toContain("chmod 3775 /srv/www");
  expect(script).toContain("useradd -m -d /srv/www/acme");
  expect(script).toContain("refusing");
  expect(script).toContain("/srv/www/acme/.ssh");
  expect(script).toContain("usermod -aG docker acme");
  expect(script).toContain("usermod -aG deploy acme");
  expect(script).toContain("authorized_keys");
  expect(script).toContain("ssh-ed25519 AAAA... deploy");
  expect(script).not.toContain("/home/");
  expect(script).not.toContain("deploy-");
});

test("a quote in the public key cannot break out of the root script", () => {
  const script = buildServerSetupScript(
    deploy,
    "ssh-ed25519 AAAA'; echo PWNED > /tmp/x; '",
  );

  expect(script).toContain(
    "'ssh-ed25519 AAAA'\\''; echo PWNED > /tmp/x; '\\'''",
  );
  expect(script).not.toMatch(/^\s*echo PWNED/m);
});

test("buildNginxWriteScript validates before committing, with a rollback on failure", () => {
  const script = buildNginxWriteScript("acme", "server { listen 80; }");
  expect(script).toContain("/etc/nginx/conf.d/acme.conf");
  expect(script).toContain(".bak");
  expect(script).toContain("if nginx -t; then");
  expect(script).toContain('mv "$conf.bak" "$conf"');
  expect(script).toContain("exit 1");

  const success = script.slice(
    script.indexOf("if nginx -t; then"),
    script.indexOf("else"),
  );
  expect(success).toContain('fail2ban-client reload "$j"');
  expect(success).toContain("nginx-limit-req nginx-botsearch");
  expect(script).toMatch(/reload|nginx -s reload/);
});

test("buildCertbotArgs are non-interactive with the email, using the webroot method", () => {
  expect(buildCertbotArgs("acme.example.com", "me@x.io")).toEqual([
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

test("buildNginxWriteScript keeps one generation instead of deleting the backup", () => {
  const script = buildNginxWriteScript("acme", "server { listen 80; }");
  expect(script).toContain('mv "$conf.bak" "$conf.prev"');
  expect(script).not.toContain('rm -f "$conf.bak"');
});

test("buildDomainConflictScript escapes dots so a domain cannot match a wildcard", () => {
  const script = buildDomainConflictScript("acme.example.com");
  expect(script).toContain("acme\\.example\\.com");
  expect(script).toContain("/etc/nginx/conf.d/*.conf");
  expect(script).toContain("|| true");
});

test("per-project logs are locked down to 0640, not nginx's 0644 default", () => {
  const script = buildNginxWriteScript(
    "acme",
    renderNginxBlock("acme.example.com", 8100),
  );
  expect(script).toContain("/var/log/nginx/[^ ;]+\\.log");
  expect(script).toContain("install -m 640 -o www-data -g adm /dev/null");
  expect(script).toContain("chown www-data:adm");
  expect(script).toContain("getent group adm");
});
