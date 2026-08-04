import os from "node:os";
import path from "node:path";

import { describe, expect, test } from "vitest";

import { isUnsafeToEmpty, isWithinCwd, resolveTarget } from "../target";

const cwd = process.cwd();

describe("resolveTarget", () => {
  test('"." resolves to the cwd and is flagged as such', () => {
    expect(resolveTarget(".")).toEqual({
      targetDir: cwd,
      projectName: path.basename(cwd),
      isCwd: true,
    });
  });

  test("a plain name resolves under the cwd", () => {
    expect(resolveTarget("my-app")).toEqual({
      targetDir: path.join(cwd, "my-app"),
      projectName: "my-app",
      isCwd: false,
    });
  });

  test("a nested path takes its last segment as the project name", () => {
    expect(resolveTarget("nested/my-app")).toMatchObject({
      targetDir: path.join(cwd, "nested", "my-app"),
      projectName: "my-app",
    });
  });

  test("an absolute path passes through", () => {
    const abs = path.join(path.parse(cwd).root, "tmp", "elsewhere");
    expect(resolveTarget(abs)).toMatchObject({
      targetDir: abs,
      projectName: "elsewhere",
    });
  });

  test("surrounding whitespace is trimmed", () => {
    expect(resolveTarget("  spaced  ").projectName).toBe("spaced");
  });
});

describe("isWithinCwd", () => {
  test("the cwd and its descendants are inside", () => {
    expect(isWithinCwd(cwd)).toBe(true);
    expect(isWithinCwd(path.join(cwd, "app"))).toBe(true);
    expect(isWithinCwd(path.join(cwd, "a", "b"))).toBe(true);
  });

  test("a parent, a sibling, or an unrelated absolute path is outside", () => {
    expect(isWithinCwd(path.dirname(cwd))).toBe(false);
    expect(isWithinCwd(path.resolve(cwd, "..", "sibling"))).toBe(false);
    expect(isWithinCwd(path.join(path.parse(cwd).root, "etc"))).toBe(false);
  });
});

describe("isUnsafeToEmpty", () => {
  test("a filesystem root, the home dir, the cwd, and ancestors are unsafe", () => {
    expect(isUnsafeToEmpty(path.parse(cwd).root)).toBe(true);
    expect(isUnsafeToEmpty(os.homedir())).toBe(true);
    expect(isUnsafeToEmpty(cwd)).toBe(true);
    expect(isUnsafeToEmpty(path.dirname(cwd))).toBe(true);
  });

  test("a directory under the cwd is safe", () => {
    expect(isUnsafeToEmpty(path.join(cwd, "some-project"))).toBe(false);
  });
});
