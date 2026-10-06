import { hasConflictingFiles } from "@/core/fs-checks";
import { detectPackageManager } from "@/core/pm-detector";
import { resolveTarget } from "@/core/target";
import type { ProjectConfig } from "@/core/types";
import { validateProjectInput } from "@/core/validation";
import { navigableConfirm, navigableText } from "@/ui";
import { cancelAndExit, required, runWizard, type WizardStep } from "@/wizard";

import { selectApiType } from "./api";
import { selectAuth } from "./auth";
import { buildProjectConfig, type WizardAnswers } from "./build-config";
import { selectComponentLibrary } from "./component-library";
import { selectConflictAction } from "./conflict";
import { selectDatabase, selectOrm } from "./database";
import {
  confirmGithubActions,
  confirmProduction,
  selectCiCdSteps,
  selectCiSteps,
  selectNginxMode,
} from "./deployment";
import { selectEmailProvider } from "./email";
import { confirmGit } from "./git";
import { confirmOpenApi, confirmScalar } from "./openapi";
import { confirmInstall, selectPackageManager } from "./package-manager";
import { confirmPointer, inputPreset, selectBase } from "./shadcn";
import { confirmTailwind } from "./tailwind";

type Step = WizardStep<WizardAnswers>;
type Answers = Partial<WizardAnswers>;

const usesShadcn = (answers: Answers): boolean =>
  answers.componentLibrary === "shadcn";

const hasDatabase = (answers: Answers): boolean =>
  answers.database !== undefined && answers.database !== "none";

const buildProjectSteps = (initialName: string | undefined): Step[] => [
  {
    key: "input",
    section: "Project",
    run: (answers) =>
      navigableText({
        message: 'Enter your project name or path ("." = current directory)',
        placeholder: "my-app",
        initialValue: answers.input ?? initialName,
        validate: (value) => validateProjectInput(value ?? ""),
      }),
  },
  {
    key: "action",
    run: async (answers, canGoBack) => {
      const target = resolveTarget(required(answers.input, "project input"));
      if (!(await hasConflictingFiles(target.targetDir))) return undefined;

      const choice = await selectConflictAction(canGoBack, target);
      if (choice === "cancel") cancelAndExit();
      return choice;
    },
  },
  {
    key: "packageManager",
    run: (answers, canGoBack) =>
      selectPackageManager(
        canGoBack,
        detectPackageManager(),
        answers.packageManager,
      ),
  },
  {
    key: "quickStart",
    run: (answers, canGoBack) =>
      navigableConfirm({
        message: "Quick start with recommended defaults (Tailwind, no extras)?",
        initialValue: answers.quickStart ?? false,
        canGoBack,
      }),
  },
];

const UI_STEPS: Step[] = [
  {
    key: "componentLibrary",
    section: "UI",
    run: (answers, canGoBack) =>
      selectComponentLibrary(canGoBack, answers.componentLibrary),
  },
  {
    key: "base",
    run: (answers, canGoBack) =>
      usesShadcn(answers) ? selectBase(canGoBack, answers.base) : undefined,
  },
  {
    key: "pointer",
    run: (answers, canGoBack) =>
      usesShadcn(answers)
        ? confirmPointer(canGoBack, answers.pointer)
        : undefined,
  },
  {
    key: "preset",
    run: (answers, canGoBack) =>
      usesShadcn(answers) ? inputPreset(canGoBack, answers.preset) : undefined,
  },
  {
    key: "tailwind",
    run: (answers, canGoBack) =>
      answers.componentLibrary === "none"
        ? confirmTailwind(canGoBack, answers.tailwind)
        : undefined,
  },
];

const DATA_AND_API_STEPS: Step[] = [
  {
    key: "database",
    section: "Data & API",
    run: (answers, canGoBack) => selectDatabase(canGoBack, answers.database),
  },
  {
    key: "orm",
    run: (answers, canGoBack) =>
      hasDatabase(answers) ? selectOrm(canGoBack, answers.orm) : undefined,
  },
  {
    key: "auth",
    run: (answers, canGoBack) =>
      hasDatabase(answers) ? selectAuth(canGoBack, answers.auth) : undefined,
  },
  {
    key: "api",
    run: (answers, canGoBack) => selectApiType(canGoBack, answers.api),
  },
  {
    key: "openapi",
    run: (answers, canGoBack) =>
      answers.api === "orpc"
        ? confirmOpenApi(canGoBack, answers.openapi)
        : undefined,
  },
  {
    key: "scalar",
    run: (answers, canGoBack) =>
      answers.openapi ? confirmScalar(canGoBack, answers.scalar) : undefined,
  },
];

const INTEGRATION_STEPS: Step[] = [
  {
    key: "email",
    section: "Integrations",
    run: (answers, canGoBack) => selectEmailProvider(canGoBack, answers.email),
  },
];

const DEPLOYMENT_STEPS: Step[] = [
  {
    key: "production",
    section: "Deployment",
    run: (answers, canGoBack) =>
      confirmProduction(canGoBack, answers.production),
  },
  {
    key: "nginxMode",
    run: (answers, canGoBack) =>
      answers.production
        ? selectNginxMode(canGoBack, answers.nginxMode)
        : undefined,
  },
];

const selectPipelineSteps = (
  answers: Answers,
  canGoBack: boolean,
): Promise<WizardAnswers["githubActionsSteps"] | symbol> =>
  answers.production
    ? selectCiCdSteps(canGoBack, answers.githubActionsSteps)
    : selectCiSteps(canGoBack, answers.githubActionsSteps);

const CI_CD_STEPS: Step[] = [
  {
    key: "githubActionsEnabled",
    section: "CI/CD",
    run: (answers, canGoBack) =>
      confirmGithubActions(canGoBack, answers.githubActionsEnabled),
  },
  {
    key: "githubActionsSteps",
    run: (answers, canGoBack) =>
      answers.githubActionsEnabled
        ? selectPipelineSteps(answers, canGoBack)
        : undefined,
  },
];

const SETUP_STEPS: Step[] = [
  {
    key: "git",
    section: "Setup",
    run: (answers, canGoBack) => confirmGit(canGoBack, answers.git),
  },
  {
    key: "install",
    run: (answers, canGoBack) => confirmInstall(canGoBack, answers.install),
  },
];

const FEATURE_STEPS: Step[] = [
  ...UI_STEPS,
  ...DATA_AND_API_STEPS,
  ...INTEGRATION_STEPS,
  ...DEPLOYMENT_STEPS,
  ...CI_CD_STEPS,
  ...SETUP_STEPS,
];

const skipInQuickStart = (step: Step): Step => ({
  ...step,
  when: (answers) => !answers.quickStart,
});

/**
 * Run the interactive setup wizard (with back-navigation) and assemble the
 * final project configuration.
 *
 * @param initialName - Name to pre-fill the first prompt with.
 */
export const gatherProjectConfig = async (
  initialName?: string,
): Promise<ProjectConfig> => {
  const answers = await runWizard<WizardAnswers>([
    ...buildProjectSteps(initialName),
    ...FEATURE_STEPS.map(skipInQuickStart),
  ]);
  return buildProjectConfig(answers);
};
