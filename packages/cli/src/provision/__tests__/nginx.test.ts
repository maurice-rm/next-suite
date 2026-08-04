import { expect, test } from "vitest";

import {
  extractServerName,
  extractServerNames,
  renderAcmeBootstrap,
  renderNginxBlock,
} from "../nginx";

test("renders the production reverse-proxy block for the domain and port", () => {
  const block = renderNginxBlock("app.example.com", 8100);
  expect(block).toContain("listen      443 ssl http2;");
  expect(block).toContain(
    "ssl_certificate     /etc/letsencrypt/live/app.example.com/fullchain.pem;",
  );
  expect(block).toContain("Strict-Transport-Security");
  expect(block).toContain("client_max_body_size 25m;");
  expect(block).toContain("map $http_upgrade $conn_upgrade_8100 {");
  expect(block).toContain(
    "limit_req_zone $binary_remote_addr zone=perip_8100:10m",
  );
  expect(block).toContain("proxy_set_header Connection $conn_upgrade_8100;");
  expect(block).toContain("upstream app_8100 {");
  expect(block).toContain("server 127.0.0.1:8100;");
  expect(block).toContain("keepalive 16;");
  expect(block).toContain("proxy_pass http://app_8100;");
  expect(block).toContain("return 301 https://$host$request_uri;");
  expect(block.endsWith("}\n")).toBe(true);
});

test("rate-limits the app but exempts immutable static assets", () => {
  const block = renderNginxBlock("app.example.com", 8100);
  const staticLoc = block.slice(block.indexOf("location /_next/static/"));
  const appLoc = block.slice(
    block.indexOf("    location / {\n        limit_req"),
  );

  expect(appLoc).toContain("limit_req zone=perip_8100 burst=60 nodelay;");
  expect(staticLoc.slice(0, staticLoc.indexOf("}"))).not.toContain("limit_req");
});

test("HSTS never carries includeSubDomains, whatever the domain looks like", () => {
  for (const domain of [
    "example.com",
    "app.example.com",
    "example.co.uk",
    "bbc.co.uk",
    "shop.example.com.au",
  ]) {
    const header = renderNginxBlock(domain, 8100)
      .split("\n")
      .find((l) => l.trimStart().startsWith("add_header Strict-Transport"));
    expect(header).toBe(
      '    add_header Strict-Transport-Security "max-age=63072000" always;',
    );
  }
});

test("ships the edge-safe extra headers, but no CSP", () => {
  const block = renderNginxBlock("app.example.com", 8100);
  for (const h of [
    "Permissions-Policy",
    "Cross-Origin-Opener-Policy",
    "Cross-Origin-Resource-Policy",
    "X-Permitted-Cross-Domain-Policies",
  ]) {
    expect(block).toContain(`add_header ${h}`);
  }
  expect(block).not.toContain("Content-Security-Policy");
});

test("no location sets its own add_header, which would drop the inherited four", () => {
  const block = renderNginxBlock("app.example.com", 8100);
  const afterFirstLocation = block
    .slice(block.indexOf("location /_next/static/"))
    .split("\n")
    .filter((l) => !l.trimStart().startsWith("#"))
    .join("\n");

  expect(afterFirstLocation).not.toContain("add_header");
});

test("assets get their own rate-limit budget and are buffered; the app is not", () => {
  const block = renderNginxBlock("app.example.com", 8100);
  expect(block).toContain("zone=assets_8100:10m rate=100r/s");

  const imageLoc = block.slice(block.indexOf("location /_next/image"));
  expect(imageLoc.slice(0, imageLoc.indexOf("}"))).toContain(
    "limit_req zone=assets_8100 burst=100 nodelay;",
  );

  const staticLoc = block.slice(block.indexOf("location /_next/static/"));
  expect(staticLoc.slice(0, staticLoc.indexOf("}"))).toContain(
    "proxy_buffering on;",
  );
  const appLoc = block.slice(
    block.indexOf("    location / {\n        limit_req"),
  );
  expect(appLoc.slice(0, appLoc.indexOf("}"))).not.toContain("proxy_buffering");
  expect(block).toContain("    proxy_buffering off;");
});

test("server_tokens is off on every block, not just the TLS one", () => {
  const block = renderNginxBlock("app.example.com", 8100);
  const redirect = block.slice(0, block.indexOf("listen      443"));
  expect(redirect).toContain("server_tokens off;");
  expect(renderAcmeBootstrap("app.example.com")).toContain(
    "server_tokens off;",
  );
});

test("extractServerName ignores comments and refuses multi-name blocks", () => {
  expect(
    extractServerName(
      "#server_name commented.com;\nserver { server_name real.com; }",
    ),
  ).toBe("real.com");
  expect(
    extractServerName("server { server_name app.example.com; # note\n}"),
  ).toBe("app.example.com");
  expect(
    extractServerName("server { server_name a.com b.com; }"),
  ).toBeUndefined();
  expect(extractServerName("server { server_name _; }")).toBeUndefined();
  expect(extractServerName("")).toBeUndefined();
});

test("renders the acme-only bootstrap block used before a cert exists", () => {
  const block = renderAcmeBootstrap("app.example.com");
  expect(block).toContain("location /.well-known/acme-challenge/ {");
  expect(block).toContain("return 404;");
  expect(block).not.toContain("ssl_certificate");
  expect(block.endsWith("}\n")).toBe(true);
});

test("extractServerNames reports every name; extractServerName stays single-only", () => {
  const multi = "server { server_name acme.example.com www.acme.example.com; }";
  expect(extractServerNames(multi)).toEqual([
    "acme.example.com",
    "www.acme.example.com",
  ]);
  expect(extractServerName(multi)).toBeUndefined();
  expect(extractServerNames("server { server_name _; }")).toEqual([]);
});
