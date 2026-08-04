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
  spinner: () => ({ start: () => {}, stop: () => {}, error: spinnerError }),
  log: { warn: logWarn, message: logMessage },
}));
vi.mock("../install");
vi.mock("../shadcn");
vi.mock("../git");
vi.mock("../fix");
vi.mock("../run");
vi.mock("../migrations");

const config = (over: Partial<ProjectConfig> = {}): ProjectConfig => ({
  projectName: "app",
  targetDir: "/tmp/app",
  action: "create",
  componentLibrary: "none",
  tailwind: false,
  api: undefined,
  auth: "none",
  email: "none",
  git: false,
  packageManager: "npm",
  install: false,
  githubActions: [],
  ...over,
});

beforeEach(() => {
  vi.clearAllMocks();
  vi.mocked(isCommandAvailable).mockResolvedValue(true);
});

test("runs only the selected steps", async () => {
  await runPostSteps(config({ install: true }));
  expect(installDependencies).toHaveBeenCalledOnce();
  expect(fixProject).toHaveBeenCalledOnce();
  expect(initShadcn).not.toHaveBeenCalled();
  expect(initGit).not.toHaveBeenCalled();
  expect(createInitialCommit).not.toHaveBeenCalled();
});

test("skips the fix step when dependencies are not installed", async () => {
  await runPostSteps(config({ install: false, git: true }));
  expect(fixProject).not.toHaveBeenCalled();
});

test("skips the fix step when the install fails", async () => {
  vi.mocked(installDependencies).mockRejectedValueOnce(new Error("network"));
  await runPostSteps(config({ install: true }));
  expect(installDependencies).toHaveBeenCalledOnce();
  expect(fixProject).not.toHaveBeenCalled();
});

test("runs shadcn init only when shadcn is selected", async () => {
  await runPostSteps(
    config({
      componentLibrary: "shadcn",
      shadcn: { base: "radix", pointer: false },
    }),
  );
  expect(initShadcn).toHaveBeenCalledOnce();
});

test("a failing step shows an error and does not stop the others", async () => {
  vi.mocked(installDependencies).mockRejectedValueOnce(new Error("network"));
  await runPostSteps(config({ install: true, git: true }));
  expect(spinnerError).toHaveBeenCalledOnce();
  expect(createInitialCommit).toHaveBeenCalledOnce();
});

test("surfaces the captured stderr of a failed step as the reason", async () => {
  vi.mocked(installDependencies).mockRejectedValueOnce(
    Object.assign(new Error("exit 1"), { stderr: "  disk full  " }),
  );
  await runPostSteps(config({ install: true }));
  expect(logMessage).toHaveBeenCalledWith("disk full");
});

test("falls back to the error message when a failure has no stderr", async () => {
  vi.mocked(installDependencies).mockRejectedValueOnce(new Error("boom"));
  await runPostSteps(config({ install: true }));
  expect(logMessage).toHaveBeenCalledWith("boom");
});

test("uses stdout as the reason when stderr is empty", async () => {
  vi.mocked(installDependencies).mockRejectedValueOnce(
    Object.assign(new Error("msg"), { stderr: "  ", stdout: "  details  " }),
  );
  await runPostSteps(config({ install: true }));
  expect(logMessage).toHaveBeenCalledWith("details");
});

test("skips the initial commit when git init failed", async () => {
  vi.mocked(initGit).mockRejectedValueOnce(new Error("git missing"));
  await runPostSteps(config({ git: true }));
  expect(initGit).toHaveBeenCalledOnce();
  expect(createInitialCommit).not.toHaveBeenCalled();
});

test("warns once and skips install + shadcn when the package manager is missing", async () => {
  vi.mocked(isCommandAvailable).mockResolvedValue(false);
  await runPostSteps(
    config({
      install: true,
      git: true,
      componentLibrary: "shadcn",
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
  vi.mocked(initGit).mockImplementation(async () => void order.push("init"));
  vi.mocked(installDependencies).mockImplementation(
    async () => void order.push("install"),
  );
  vi.mocked(initShadcn).mockImplementation(
    async () => void order.push("shadcn"),
  );
  vi.mocked(fixProject).mockImplementation(async () => void order.push("fix"));
  vi.mocked(createInitialCommit).mockImplementation(
    async () => void order.push("commit"),
  );
  await runPostSteps(
    config({
      install: true,
      git: true,
      componentLibrary: "shadcn",
      shadcn: { base: "radix", pointer: false },
    }),
  );
  expect(order).toEqual(["init", "install", "shadcn", "fix", "commit"]);
});

const prodDrizzle = {
  install: true,
  database: { engine: "postgres", orm: "drizzle" },
  production: { mode: "proxied" },
} as const;

test("generates the initial migration for a production drizzle project", async () => {
  vi.mocked(isCommandAvailable).mockResolvedValue(true);
  await runPostSteps(config({ ...prodDrizzle }));
  expect(generateMigrations).toHaveBeenCalledWith("/tmp/app", "npm");
});

test("skips the migration where it would be wrong or impossible", async () => {
  vi.mocked(isCommandAvailable).mockResolvedValue(true);

  await runPostSteps(
    config({ install: true, database: { engine: "postgres", orm: "drizzle" } }),
  );
  await runPostSteps(
    config({
      install: true,
      database: { engine: "postgres", orm: "prisma" },
      production: { mode: "proxied" },
    }),
  );
  await runPostSteps(config({ ...prodDrizzle, install: false }));

  expect(generateMigrations).not.toHaveBeenCalled();
});

test("a failed migration warns and still lets the remaining steps run", async () => {
  vi.mocked(isCommandAvailable).mockResolvedValue(true);
  vi.mocked(generateMigrations).mockRejectedValueOnce(
    new Error("drizzle-kit blew up"),
  );

  await runPostSteps(config({ ...prodDrizzle, git: true }));

  expect(spinnerError).toHaveBeenCalled();
  expect(fixProject).toHaveBeenCalled();
  expect(createInitialCommit).toHaveBeenCalled();
});
