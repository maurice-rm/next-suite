import { describe, expect, test } from "vitest";

import { buildProjectConfig, type WizardAnswers } from "../build-config";

const answers = (
  over: Partial<WizardAnswers> = {},
): Partial<WizardAnswers> => ({
  input: "my-app",
  componentLibrary: "none",
  tailwind: false,
  database: "none",
  api: "none",
  auth: "none",
  email: "none",
  git: false,
  packageManager: "npm",
  install: false,
  ...over,
});

describe("buildProjectConfig", () => {
  test("derives projectName from the input and defaults a missing action", () => {
    const config = buildProjectConfig(answers());
    expect(config.projectName).toBe("my-app");
    expect(config.action).toBe("create");
  });

  test("keeps a stored conflict action", () => {
    expect(buildProjectConfig(answers({ action: "overwrite" })).action).toBe(
      "overwrite",
    );
  });

  test("shadcn forces tailwind on and collects its options", () => {
    const config = buildProjectConfig(
      answers({
        componentLibrary: "shadcn",
        base: "radix",
        pointer: true,
        preset: "b27GcrRo",
        tailwind: undefined,
      }),
    );
    expect(config.tailwind).toBe(true);
    expect(config.shadcn).toEqual({
      base: "radix",
      pointer: true,
      preset: "b27GcrRo",
    });
  });

  test("omits a blank/whitespace shadcn preset", () => {
    const config = buildProjectConfig(
      answers({
        componentLibrary: "shadcn",
        base: "base",
        pointer: false,
        preset: "   ",
      }),
    );
    expect(config.shadcn?.preset).toBeUndefined();
  });

  test("without shadcn, tailwind comes from the answer and shadcn is undefined", () => {
    const config = buildProjectConfig(
      answers({ componentLibrary: "none", tailwind: true }),
    );
    expect(config.tailwind).toBe(true);
    expect(config.shadcn).toBeUndefined();
  });

  test('database "none" yields no options; an engine yields engine + orm', () => {
    expect(
      buildProjectConfig(answers({ database: "none" })).database,
    ).toBeUndefined();
    expect(
      buildProjectConfig(answers({ database: "postgres", orm: "drizzle" }))
        .database,
    ).toEqual({ engine: "postgres", orm: "drizzle" });
  });

  test("no production yields no options; enabled with a mode yields it", () => {
    expect(
      buildProjectConfig(answers({ production: false })).production,
    ).toBeUndefined();
    expect(
      buildProjectConfig(answers({ production: true, nginxMode: "standalone" }))
        .production,
    ).toEqual({ mode: "standalone" });
  });

  test("githubActions is empty unless enabled, then normalized", () => {
    expect(buildProjectConfig(answers({})).githubActions).toEqual([]);
    expect(
      buildProjectConfig(
        answers({ githubActionsEnabled: false, githubActionsSteps: ["lint"] }),
      ).githubActions,
    ).toEqual([]);
    expect(
      buildProjectConfig(
        answers({
          githubActionsEnabled: true,
          githubActionsSteps: ["deploy", "lint"],
        }),
      ).githubActions,
    ).toEqual(["lint", "image", "deploy"]);
  });

  test("throws when an unconditional answer is missing", () => {
    expect(() => buildProjectConfig(answers({ api: undefined }))).toThrow(
      /Wizard invariant violated: api/,
    );
  });

  test("quickStart yields the recommended baseline, ignoring feature answers", () => {
    const config = buildProjectConfig(answers({ quickStart: true }));
    expect(config).toMatchObject({
      componentLibrary: "none",
      tailwind: true,
      database: undefined,
      api: undefined,
      auth: "none",
      email: "none",
      production: undefined,
      githubActions: [],
      git: true, // overrides the helper's git: false
      install: true, // overrides the helper's install: false
      packageManager: "npm",
    });
    expect(config.shadcn).toBeUndefined();
  });

  test("openapi nests under the orpc api config; scalar defaults false", () => {
    expect(
      buildProjectConfig(answers({ api: "orpc", openapi: true, scalar: true }))
        .api,
    ).toEqual({ type: "orpc", openapi: { scalar: true } });
    expect(
      buildProjectConfig(answers({ api: "orpc", openapi: true })).api,
    ).toEqual({ type: "orpc", openapi: { scalar: false } });
    expect(buildProjectConfig(answers({ api: "orpc" })).api).toEqual({
      type: "orpc",
    });
  });
});
