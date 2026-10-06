import { expect, test } from "vitest";

import { resolveDeployTarget } from "../deploy-target";
import {
  buildGithubDeployEntries,
  formatManualChecklist,
  type GithubEntry,
} from "../github-deploy";

const deploy = resolveDeployTarget("acme", "vps.example.com");

const FAKE_PRIVATE_KEY =
  "-----BEGIN OPENSSH PRIVATE KEY-----\nFAKE\n-----END OPENSSH PRIVATE KEY-----\n";

test("buildGithubDeployEntries includes the SSH secrets and DEPLOY_PATH; app url only when given", () => {
  const withUrl = buildGithubDeployEntries(
    deploy,
    "PRIVKEY",
    "https://acme.example.com",
  );
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

  const noUrl = buildGithubDeployEntries(deploy, "PRIVKEY");
  expect(noUrl.some((entry) => entry.name === "NEXT_PUBLIC_APP_URL")).toBe(
    false,
  );
});

test("formatManualChecklist: a multi-line value gets its own label line; single-line values render inline", () => {
  const entries: GithubEntry[] = [
    { kind: "secret", name: "DEPLOY_SSH_KEY", value: FAKE_PRIVATE_KEY },
    { kind: "secret", name: "DEPLOY_SSH_HOST", value: "vps.example.com" },
    { kind: "variable", name: "DEPLOY_PATH", value: "/srv/www/acme" },
  ];

  expect(formatManualChecklist(entries)).toBe(
    [
      "secret DEPLOY_SSH_KEY:",
      "-----BEGIN OPENSSH PRIVATE KEY-----",
      "FAKE",
      "-----END OPENSSH PRIVATE KEY-----",
      "",
      "secret DEPLOY_SSH_HOST: vps.example.com",
      "variable DEPLOY_PATH: /srv/www/acme",
    ].join("\n"),
  );
});
