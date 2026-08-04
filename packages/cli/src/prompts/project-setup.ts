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
  selectGithubActionsSteps,
  selectNginxMode,
} from "./deployment";
import { selectEmailProvider } from "./email";
import { confirmGit } from "./git";
import { confirmOpenApi, confirmScalar } from "./openapi";
import { confirmInstall, selectPackageManager } from "./package-manager";
import { confirmPointer, inputPreset, selectBase } from "./shadcn";
import { confirmTailwind } from "./tailwind";

/**
 * Run the interactive setup wizard (with back-navigation) and assemble the
 * final project configuration.
 *
 * @param initialName - Optional name to pre-fill the first prompt with.
 * @returns The fully resolved project configuration.
 */
export const gatherProjectConfig = async (
  initialName?: string,
): Promise<ProjectConfig> => {
  const introSteps: WizardStep<WizardAnswers>[] = [
    {
      key: "input",
      section: "Project",
      run: (a) =>
        navigableText({
          message: 'Enter your project name or path ("." = current directory)',
          placeholder: "my-app",
          initialValue: a.input ?? initialName,
          validate: (value) => validateProjectInput(value ?? ""),
        }),
    },
    {
      key: "action",
      run: async (a, canGoBack) => {
        const { targetDir, isCwd } = resolveTarget(
          required(a.input, "project input"),
        );
        if (!(await hasConflictingFiles(targetDir))) return undefined;

        const choice = await selectConflictAction(canGoBack, targetDir, isCwd);
        if (choice === "cancel") cancelAndExit();
        return choice;
      },
    },
    {
      key: "packageManager",
      run: (a, canGoBack) =>
        selectPackageManager(
          canGoBack,
          detectPackageManager(),
          a.packageManager,
        ),
    },
    {
      key: "quickStart",
      run: (a, canGoBack) =>
        navigableConfirm({
          message:
            "Quick start with recommended defaults (Tailwind, no extras)?",
          initialValue: a.quickStart ?? false,
          canGoBack,
        }),
    },
  ];

  const featureSteps: WizardStep<WizardAnswers>[] = [
    {
      key: "componentLibrary",
      section: "UI",
      run: (a, canGoBack) =>
        selectComponentLibrary(canGoBack, a.componentLibrary),
    },
    {
      key: "base",
      run: (a, canGoBack) =>
        a.componentLibrary === "shadcn"
          ? selectBase(canGoBack, a.base)
          : undefined,
    },
    {
      key: "pointer",
      run: (a, canGoBack) =>
        a.componentLibrary === "shadcn"
          ? confirmPointer(canGoBack, a.pointer)
          : undefined,
    },
    {
      key: "preset",
      run: (a, canGoBack) =>
        a.componentLibrary === "shadcn"
          ? inputPreset(canGoBack, a.preset)
          : undefined,
    },
    {
      key: "tailwind",
      run: (a, canGoBack) =>
        a.componentLibrary === "none"
          ? confirmTailwind(canGoBack, a.tailwind)
          : undefined,
    },
    {
      key: "database",
      section: "Data & API",
      run: (a, canGoBack) => selectDatabase(canGoBack, a.database),
    },
    {
      key: "orm",
      run: (a, canGoBack) =>
        a.database !== undefined && a.database !== "none"
          ? selectOrm(canGoBack, a.orm)
          : undefined,
    },
    {
      key: "auth",
      run: (a, canGoBack) =>
        a.database !== undefined && a.database !== "none"
          ? selectAuth(canGoBack, a.auth)
          : undefined,
    },
    {
      key: "api",
      run: (a, canGoBack) => selectApiType(canGoBack, a.api),
    },
    {
      key: "openapi",
      run: (a, canGoBack) =>
        a.api === "orpc" ? confirmOpenApi(canGoBack, a.openapi) : undefined,
    },
    {
      key: "scalar",
      run: (a, canGoBack) =>
        a.openapi ? confirmScalar(canGoBack, a.scalar) : undefined,
    },
    {
      key: "email",
      section: "Integrations",
      run: (a, canGoBack) => selectEmailProvider(canGoBack, a.email),
    },
    {
      key: "production",
      section: "Deployment",
      run: (a, canGoBack) => confirmProduction(canGoBack, a.production),
    },
    {
      key: "nginxMode",
      run: (a, canGoBack) =>
        a.production ? selectNginxMode(canGoBack, a.nginxMode) : undefined,
    },
    {
      key: "githubActionsEnabled",
      section: "CI/CD",
      run: (a, canGoBack) =>
        confirmGithubActions(canGoBack, a.githubActionsEnabled),
    },
    {
      key: "githubActionsSteps",
      run: (a, canGoBack) =>
        a.githubActionsEnabled
          ? selectGithubActionsSteps(
              canGoBack,
              a.production === true,
              a.githubActionsSteps,
            )
          : undefined,
    },
    {
      key: "git",
      section: "Setup",
      run: (a, canGoBack) => confirmGit(canGoBack, a.git),
    },
    {
      key: "install",
      run: (a, canGoBack) => confirmInstall(canGoBack, a.install),
    },
  ];

  const answers = await runWizard<WizardAnswers>([
    ...introSteps,
    ...featureSteps.map((step) => ({
      ...step,
      when: (a: Partial<WizardAnswers>) => !a.quickStart,
    })),
  ]);
  return buildProjectConfig(answers);
};
