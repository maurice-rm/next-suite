import type { ProjectManifest } from "@/generator/manifest";

import {
  certbotArgs,
  deployTargets,
  ghDeployConfig,
  nginxWriteScript,
  serverSetupScript,
} from "./commands";
import type { GlobalConfig } from "./config";
import { deriveServerEnv, needsAppUrl } from "./env";
import { renderNginxBlock } from "./nginx";
import { remoteChecks } from "./preflight";

export interface PlanInput {
  manifest: ProjectManifest;
  config: GlobalConfig;
  domain: string;
  port: number;
  envExample: string;
}

const REDACTED_KEY = "<deploy-public-key>";
const REDACTED_SECRET = "<redacted>";

/** Side-effect-free preview; never prints a real secret or key (redaction markers only). */
export const buildDryRunPlan = ({
  manifest,
  config,
  domain,
  port,
  envExample,
}: PlanInput): string[] => {
  const deploy = deployTargets(manifest.name, config.host);
  const gh = ghDeployConfig(
    deploy,
    domain,
    REDACTED_SECRET,
    needsAppUrl(manifest),
  );
  const derivedEnv = deriveServerEnv(
    envExample,
    { name: manifest.name, port, domain },
    () => "<generated>",
  );

  return [
    `Server:  ${config.adminUser}@${config.host}`,
    `Create:  user ${deploy.user}, dir ${deploy.path} (docker group)`,
    `Port:    ${port} (APP_PORT in the server .env)`,
    "",
    ".env:",
    ...derivedEnv.trimEnd().split("\n"),
    "",
    "Server setup (run as admin):",
    serverSetupScript(deploy, REDACTED_KEY),
    "nginx write:",
    nginxWriteScript(manifest.name, renderNginxBlock(domain, port)),
    "TLS:",
    ["certbot", ...certbotArgs(domain, config.certbotEmail)].join(" "),
    "",
    `Prerequisites (verified in preflight): ${remoteChecks()
      .map((c) => c.name)
      .join(", ")}`,
    "",
    "GitHub Actions config (names only):",
    ...gh.map((e) => `${e.kind} ${e.name}`),
  ];
};
