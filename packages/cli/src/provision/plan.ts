import type { ProjectManifest } from "@/generator/manifest";

import type { GlobalConfig } from "./config";
import { resolveDeployTarget } from "./deploy-target";
import { deriveServerEnv, resolveAppUrl } from "./env";
import { buildGithubDeployEntries } from "./github-deploy";
import { renderNginxBlock } from "./nginx";
import { remoteChecks } from "./preflight";
import {
  buildCertbotArgs,
  buildNginxWriteScript,
  buildServerSetupScript,
} from "./server-scripts";

export interface PlanInput {
  manifest: ProjectManifest;
  config: GlobalConfig;
  domain: string;
  port: number;
  envExample: string;
}

const REDACTED_KEY = "<deploy-public-key>";
const REDACTED_SECRET = "<redacted>";
const GENERATED_SECRET = "<generated>";

/** Side-effect-free preview; never prints a real secret or key (redaction markers only). */
export const buildDryRunPlan = ({
  manifest,
  config,
  domain,
  port,
  envExample,
}: PlanInput): string[] => {
  const deploy = resolveDeployTarget(manifest.name, config.host);
  const githubEntries = buildGithubDeployEntries(
    deploy,
    REDACTED_SECRET,
    resolveAppUrl(manifest, domain),
  );
  const derivedEnv = deriveServerEnv(
    envExample,
    { name: manifest.name, port, domain },
    () => GENERATED_SECRET,
  );

  return [
    `Server:  ${config.adminUser}@${config.host}`,
    `Create:  user ${deploy.user}, dir ${deploy.path} (docker group)`,
    `Port:    ${String(port)} (APP_PORT in the server .env)`,
    "",
    ".env:",
    ...derivedEnv.trimEnd().split("\n"),
    "",
    "Server setup (run as admin):",
    buildServerSetupScript(deploy, REDACTED_KEY),
    "nginx write:",
    buildNginxWriteScript(manifest.name, renderNginxBlock(domain, port)),
    "TLS:",
    ["certbot", ...buildCertbotArgs(domain, config.certbotEmail)].join(" "),
    "",
    `Prerequisites (verified in preflight): ${remoteChecks()
      .map((check) => check.name)
      .join(", ")}`,
    "",
    "GitHub Actions config (names only):",
    ...githubEntries.map((entry) => `${entry.kind} ${entry.name}`),
  ];
};
