import type { ProjectManifest } from "@/generator/manifest";

import type { GlobalConfig } from "./config";
import type { DeployTarget } from "./deploy-target";
import type { Runner, SshTarget } from "./ssh";
import type { StepLog } from "./step-log";

export interface ProvisionRequest {
  manifest: ProjectManifest;
  config: GlobalConfig;
  domain: string;
  envExample: string;
  isStaging: boolean;
  shouldSkipGithub: boolean;
  /** `owner/repo` the GitHub secrets go to; omitted lets `gh` resolve it. */
  repo?: string;
}

export interface ProvisionContext {
  request: ProvisionRequest;
  target: SshTarget;
  deploy: DeployTarget;
  run: Runner;
  stepLog: StepLog;
}
