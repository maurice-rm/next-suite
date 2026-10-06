import type { GithubActionsStep } from "@/core/types";
import {
  GITHUB_ACTIONS_CD_STEPS,
  GITHUB_ACTIONS_CI_STEPS,
  NGINX_MODES,
} from "@/options";
import {
  defineConfirm,
  defineSelect,
  navigableGroupMultiselect,
  type NavigableOption,
} from "@/ui";

export const confirmProduction = defineConfirm(
  "Set up production deployment (Docker + nginx)?",
);

export const selectNginxMode = defineSelect("Who terminates TLS?", [
  ...NGINX_MODES,
]);

export const confirmGithubActions = defineConfirm("Set up GitHub Actions?");

const DEFAULT_STEPS: GithubActionsStep[] = ["lint", "typecheck", "build"];

const CI_GROUP = { CI: [...GITHUB_ACTIONS_CI_STEPS] };

const definePipelineStepsSelect =
  (groups: Record<string, NavigableOption<GithubActionsStep>[]>) =>
  (
    canGoBack: boolean,
    initialValues: GithubActionsStep[] = DEFAULT_STEPS,
  ): Promise<GithubActionsStep[] | symbol> =>
    navigableGroupMultiselect<GithubActionsStep>({
      message: "Pipeline steps",
      options: groups,
      initialValues,
      canGoBack,
    });

/** The CI step picker for a project without a production deployment. */
export const selectCiSteps = definePipelineStepsSelect(CI_GROUP);

/** The CI/CD step picker; the CD group needs a production deployment. */
export const selectCiCdSteps = definePipelineStepsSelect({
  ...CI_GROUP,
  CD: [...GITHUB_ACTIONS_CD_STEPS],
});
