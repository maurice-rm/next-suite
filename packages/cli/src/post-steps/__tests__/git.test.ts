import { beforeEach, expect, test, vi } from "vitest";

import { createInitialCommit, initGit } from "../git";
import { isCommandAvailable, run } from "../run";

const { execaMock } = vi.hoisted(() => ({ execaMock: vi.fn() }));
vi.mock("execa", () => ({ execa: execaMock }));
vi.mock("../run");

const commitArgsOf = (): string[] | undefined =>
  vi
    .mocked(run)
    .mock.calls.map((c) => c[1])
    .find((args) => args.includes("commit"));

beforeEach(() => {
  vi.clearAllMocks();
  vi.mocked(isCommandAvailable).mockResolvedValue(true);
  execaMock.mockResolvedValue({ exitCode: 0, stdout: "me@example.com" });
});

test("throws when git is not installed", async () => {
  vi.mocked(isCommandAvailable).mockResolvedValue(false);
  await expect(initGit("/tmp/x")).rejects.toThrow(/Git is not installed/);
});

test("initGit runs `git init` on the main branch (no add, no commit)", async () => {
  await initGit("/tmp/x");
  const argSets = vi.mocked(run).mock.calls.map((c) => c[1]);
  expect(argSets).toContainEqual(["-c", "init.defaultBranch=main", "init"]);
  expect(argSets.some((a) => a.includes("add") || a.includes("commit"))).toBe(
    false,
  );
});

test("createInitialCommit stages everything and commits with hooks bypassed", async () => {
  await createInitialCommit("/tmp/x");
  const argSets = vi.mocked(run).mock.calls.map((c) => c[1]);
  expect(argSets).toContainEqual(["add", "-A"]);
  expect(
    argSets.some((a) => a.includes("commit") && a.includes("--no-verify")),
  ).toBe(true);
});

test("createInitialCommit keeps the configured identity (no -c override)", async () => {
  execaMock.mockResolvedValue({ exitCode: 0, stdout: "me@example.com" });
  await createInitialCommit("/tmp/x");
  expect(commitArgsOf()).toEqual([
    "commit",
    "--no-verify",
    "-m",
    "chore: initial commit",
  ]);
});

test("createInitialCommit injects a fallback identity when git has none", async () => {
  execaMock.mockResolvedValue({ exitCode: 1, stdout: "" });
  await createInitialCommit("/tmp/x");
  expect(commitArgsOf()).toEqual([
    "-c",
    "user.name=create-next-suite",
    "-c",
    "user.email=create-next-suite@users.noreply.github.com",
    "commit",
    "--no-verify",
    "-m",
    "chore: initial commit",
  ]);
});

test("initGit strips parent git context from the environment", async () => {
  process.env.GIT_DIR = "/parent/.git";
  await initGit("/tmp/x");
  expect(vi.mocked(run).mock.calls[0]?.[2].env?.GIT_DIR).toBeUndefined();
  delete process.env.GIT_DIR;
});
