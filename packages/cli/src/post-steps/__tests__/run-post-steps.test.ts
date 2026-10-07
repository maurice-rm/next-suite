import { beforeEach, expect, test, vi } from "vitest";

import type { ProjectConfig } from "@/core/types";

import { fixProject } from "../fix";
import { createInitialCommit, initGit } from "../git";
import { installDependencies } from "../install";
import { generateMigrations } from "../migrations";
import { isCommandAvailable } from "../run";
import { runPostSteps } from "../run-post-steps";
import { initShadcn } from "../shadcn";

const { spinnerError, logWarn, logMessage } = vi.hoisted(() => ({
  spinnerError: vi.fn(),
  logWarn: vi.fn(),
  logMessage: vi.fn(),
}));

vi.mock("@clack/prompts", () => ({
  spinner: () => ({ start: vi.fn(), stop: vi.fn(), error: spinnerError }),
  log: { warn: logWarn, message: logMessage },
}));
vi.mock("../install");
vi.mock("../shadcn");
vi.mock("../git");
vi.mock("../fix");
vi.mock("../run");
vi.mock("../migrations");

const createConfig = (
  overrides: Partial<ProjectConfig> = {},
): ProjectConfig => ({
  projectName: "app",
  targetDir: "/tmp/app",
  action: "create",
  tailwind: false,
  api: undefined,
  auth: "none",
  email: "none",
  git: false,
  packageManager: "npm",
  install: false,
  githubActions: [],
  ...overrides,
});

beforeEach(() => {
  vi.clearAllMocks();
  vi.mocked(isCommandAvailable).mockResolvedValue(true);
});

test("runs only the selected steps", async () => {
  await runPostSteps(createConfig({ install: true }));
  expect(installDependencies).toHaveBeenCalledOnce();
  expect(fixProject).toHaveBeenCalledOnce();
  expect(initShadcn).not.toHaveBeenCalled();
  expect(initGit).not.toHaveBeenCalled();
  expect(createInitialCommit).not.toHaveBeenCalled();
});

test("skips the fix step when dependencies are not installed", async () => {
  await runPostSteps(createConfig({ install: false, git: true }));
  expect(fixProject).not.toHaveBeenCalled();
});

test("skips the fix step when the install fails", async () => {
  vi.mocked(installDependencies).mockRejectedValueOnce(new Error("network"));
  await runPostSteps(createConfig({ install: true }));
  expect(installDependencies).toHaveBeenCalledOnce();
  expect(fixProject).not.toHaveBeenCalled();
});

test("fixes the files when shadcn installed the dependencies without --install", async () => {
  await runPostSteps(
    createConfig({
      install: false,
      shadcn: { base: "radix", pointer: false },
    }),
  );
  expect(installDependencies).not.toHaveBeenCalled();
  expect(fixProject).toHaveBeenCalledOnce();
});

test("runs shadcn init only when shadcn is selected", async () => {
  await runPostSteps(
    createConfig({
      shadcn: { base: "radix", pointer: false },
    }),
  );
  expect(initShadcn).toHaveBeenCalledOnce();
});

test("a failing step shows an error and does not stop the others", async () => {
  vi.mocked(installDependencies).mockRejectedValueOnce(new Error("network"));
  await runPostSteps(createConfig({ install: true, git: true }));
  expect(spinnerError).toHaveBeenCalledOnce();
  expect(createInitialCommit).toHaveBeenCalledOnce();
});

test("surfaces the captured stderr of a failed step as the reason", async () => {
  vi.mocked(installDependencies).mockRejectedValueOnce(
    Object.assign(new Error("exit 1"), { stderr: "  disk full  " }),
  );
  await runPostSteps(createConfig({ install: true }));
  expect(logMessage).toHaveBeenCalledWith("disk full");
});

test("falls back to the error message when a failure has no stderr", async () => {
  vi.mocked(installDependencies).mockRejectedValueOnce(new Error("boom"));
  await runPostSteps(createConfig({ install: true }));
  expect(logMessage).toHaveBeenCalledWith("boom");
});

test("uses stdout as the reason when stderr is empty", async () => {
  vi.mocked(installDependencies).mockRejectedValueOnce(
    Object.assign(new Error("msg"), { stderr: "  ", stdout: "  details  " }),
  );
  await runPostSteps(createConfig({ install: true }));
  expect(logMessage).toHaveBeenCalledWith("details");
});

test("skips the initial commit when git init failed", async () => {
  vi.mocked(initGit).mockRejectedValueOnce(new Error("git missing"));
  await runPostSteps(createConfig({ git: true }));
  expect(initGit).toHaveBeenCalledOnce();
  expect(createInitialCommit).not.toHaveBeenCalled();
});

test("warns once and skips install + shadcn when the package manager is missing", async () => {
  vi.mocked(isCommandAvailable).mockResolvedValue(false);
  await runPostSteps(
    createConfig({
      install: true,
      git: true,
      shadcn: { base: "radix", pointer: false },
    }),
  );
  expect(logWarn).toHaveBeenCalledOnce();
  expect(installDependencies).not.toHaveBeenCalled();
  expect(initShadcn).not.toHaveBeenCalled();
  expect(fixProject).not.toHaveBeenCalled();
  expect(initGit).toHaveBeenCalledOnce();
  expect(createInitialCommit).toHaveBeenCalledOnce();
});

test("runs steps in order: git init → install → shadcn → fix → commit", async () => {
  const order: string[] = [];
  vi.mocked(initGit).mockImplementation(() => {
    order.push("init");
    return Promise.resolve();
  });
  vi.mocked(installDependencies).mockImplementation(() => {
    order.push("install");
    return Promise.resolve();
  });
  vi.mocked(initShadcn).mockImplementation(() => {
    order.push("shadcn");
    return Promise.resolve();
  });
  vi.mocked(fixProject).mockImplementation(() => {
    order.push("fix");
    return Promise.resolve();
  });
  vi.mocked(createInitialCommit).mockImplementation(() => {
    order.push("commit");
    return Promise.resolve();
  });
  await runPostSteps(
    createConfig({
      install: true,
      git: true,
      shadcn: { base: "radix", pointer: false },
    }),
  );
  expect(order).toEqual(["init", "install", "shadcn", "fix", "commit"]);
});

const PRODUCTION_DRIZZLE: Partial<ProjectConfig> = {
  install: true,
  database: { engine: "postgres", orm: "drizzle" },
  production: { mode: "proxied" },
};

test("generates the initial migration for a production drizzle project", async () => {
  vi.mocked(isCommandAvailable).mockResolvedValue(true);
  await runPostSteps(createConfig({ ...PRODUCTION_DRIZZLE }));
  expect(generateMigrations).toHaveBeenCalledWith("/tmp/app", "npm", "drizzle");
});

test("generates the initial migration for a production prisma project", async () => {
  vi.mocked(isCommandAvailable).mockResolvedValue(true);
  await runPostSteps(
    createConfig({
      install: true,
      database: { engine: "postgres", orm: "prisma" },
      production: { mode: "proxied" },
    }),
  );
  expect(generateMigrations).toHaveBeenCalledWith("/tmp/app", "npm", "prisma");
});

test("generates the initial migration the PGlite test database migrates from", async () => {
  vi.mocked(isCommandAvailable).mockResolvedValue(true);
  await runPostSteps(
    createConfig({
      install: true,
      database: { engine: "postgres", orm: "drizzle" },
    }),
  );
  expect(generateMigrations).toHaveBeenCalledWith("/tmp/app", "npm", "drizzle");
});

test("skips the migration where it would be wrong or impossible", async () => {
  vi.mocked(isCommandAvailable).mockResolvedValue(true);

  await runPostSteps(
    createConfig({
      install: true,
      database: { engine: "mysql", orm: "drizzle" },
    }),
  );
  await runPostSteps(
    createConfig({
      install: true,
      database: { engine: "postgres", orm: "prisma" },
    }),
  );
  await runPostSteps(createConfig({ ...PRODUCTION_DRIZZLE, install: false }));

  expect(generateMigrations).not.toHaveBeenCalled();
});

test("a failed migration warns and still lets the remaining steps run", async () => {
  vi.mocked(isCommandAvailable).mockResolvedValue(true);
  vi.mocked(generateMigrations).mockRejectedValueOnce(
    new Error("drizzle-kit blew up"),
  );

  await runPostSteps(createConfig({ ...PRODUCTION_DRIZZLE, git: true }));

  expect(spinnerError).toHaveBeenCalled();
  expect(fixProject).toHaveBeenCalled();
  expect(createInitialCommit).toHaveBeenCalled();
});
