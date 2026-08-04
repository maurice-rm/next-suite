import type { GithubActionsStep } from "@/core/types";
import {
  GITHUB_ACTIONS_CD_STEPS,
  GITHUB_ACTIONS_CI_STEPS,
  NGINX_MODES,
} from "@/options";
import { defineConfirm, defineSelect, navigableGroupMultiselect } from "@/ui";

export const confirmProduction = defineConfirm(
  "Set up production deployment (Docker + nginx)?",
);

export const selectNginxMode = defineSelect("Who terminates TLS?", [
  ...NGINX_MODES,
]);

export const confirmGithubActions = defineConfirm("Set up GitHub Actions?");

const DEFAULT_STEPS: GithubActionsStep[] = ["lint", "typecheck", "build"];

/** The grouped CI/CD step picker; the CD group is offered only with a deployment. */
export const selectGithubActionsSteps = (
  canGoBack: boolean,
  withDeploy: boolean,
  initialValues: GithubActionsStep[] = DEFAULT_STEPS,
): Promise<GithubActionsStep[] | symbol> =>
  navigableGroupMultiselect<GithubActionsStep>({
    message: "Pipeline steps",
    options: {
      CI: [...GITHUB_ACTIONS_CI_STEPS],
      ...(withDeploy ? { CD: [...GITHUB_ACTIONS_CD_STEPS] } : {}),
    },
    initialValues,
    canGoBack,
  });
