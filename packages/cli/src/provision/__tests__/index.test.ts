import { expect, test } from "vitest";

import { GO_BACK, runWizard, type WizardStep } from "@/wizard";

import { provisionStepKeys } from "../index";

test("provisionStepKeys omits flagged fields and keeps the gate last", () => {
  expect(provisionStepKeys({})).toEqual([
    "domain",
    "staging",
    "github",
    "proceed",
  ]);
  expect(provisionStepKeys({ domain: "x.com" })).toEqual([
    "staging",
    "github",
    "proceed",
  ]);
  expect(provisionStepKeys({ staging: true })).toEqual([
    "domain",
    "github",
    "proceed",
  ]);
  expect(
    provisionStepKeys({ domain: "x.com", staging: false, skipGithub: true }),
  ).toEqual(["proceed"]);
});

interface Answers {
  domain?: string;
  github?: boolean;
  proceed?: boolean;
}

test("a flagged step is never in the list, so GO_BACK reaches the real previous step directly", async () => {
  expect(provisionStepKeys({ staging: true })).toEqual([
    "domain",
    "github",
    "proceed",
  ]);

  const seen: string[] = [];
  let githubWentBack = false;
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
      run: (_a, canGoBack) => {
        seen.push("github");
        expect(canGoBack).toBe(true);
        if (!githubWentBack) {
          githubWentBack = true;
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
