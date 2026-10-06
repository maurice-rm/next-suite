import { expect, test } from "vitest";

import { GO_BACK, runWizard, type WizardStep } from "@/wizard";

import { provisionStepKeys } from "../provision-wizard";

test("provisionStepKeys omits flagged fields and keeps the gate last", () => {
  expect(provisionStepKeys({})).toEqual([
    "domain",
    "isStaging",
    "shouldConfigureGithub",
    "shouldProceed",
  ]);
  expect(provisionStepKeys({ domain: "x.com" })).toEqual([
    "isStaging",
    "shouldConfigureGithub",
    "shouldProceed",
  ]);
  expect(provisionStepKeys({ isStaging: true })).toEqual([
    "domain",
    "shouldConfigureGithub",
    "shouldProceed",
  ]);
  expect(
    provisionStepKeys({
      domain: "x.com",
      isStaging: false,
      shouldSkipGithub: true,
    }),
  ).toEqual(["shouldProceed"]);
});

interface Answers {
  domain?: string;
  github?: boolean;
  proceed?: boolean;
}

test("a flagged step is never in the list, so GO_BACK reaches the real previous step directly", async () => {
  expect(provisionStepKeys({ isStaging: true })).toEqual([
    "domain",
    "shouldConfigureGithub",
    "shouldProceed",
  ]);

  const seen: string[] = [];
  let hasGithubGoneBack = false;
  const steps: WizardStep<Answers>[] = [
    {
      key: "domain",
      run: () => {
        seen.push("domain");
        return "example.com";
      },
    },
    {
      key: "github",
      run: (_answers, canGoBack) => {
        seen.push("github");
        expect(canGoBack).toBe(true);
        if (!hasGithubGoneBack) {
          hasGithubGoneBack = true;
          return GO_BACK;
        }
        return true;
      },
    },
    {
      key: "proceed",
      run: () => {
        seen.push("proceed");
        return true;
      },
    },
  ];

  const answers = await runWizard<Answers>(steps);
  expect(seen).toEqual(["domain", "github", "domain", "github", "proceed"]);
  expect(answers).toEqual({
    domain: "example.com",
    github: true,
    proceed: true,
  });
});
