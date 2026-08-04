import path from "node:path";

import fs from "fs-extra";
import { afterEach, describe, expect, test } from "vitest";

import { validateProjectInput, validateShadcnPreset } from "../validation";

const cwd = process.cwd();
let tmpDir: string | undefined;
afterEach(async () => {
  if (tmpDir) await fs.remove(tmpDir);
  tmpDir = undefined;
});

describe("validateProjectInput", () => {
  test("empty or whitespace input is rejected", () => {
    expect(validateProjectInput("")).toBe("Name or path is required.");
    expect(validateProjectInput("   ")).toBe("Name or path is required.");
  });

  test("a parent or absolute target outside the cwd is rejected", () => {
    expect(validateProjectInput("../sibling")).toMatch(/current directory/);
    expect(
      validateProjectInput(path.join(path.parse(cwd).root, "etc", "app")),
    ).toMatch(/current directory/);
  });

  test("an invalid npm name is rejected (not as a containment error)", () => {
    const message = validateProjectInput("Invalid Name");
    expect(message).toBeDefined();
    expect(message).not.toMatch(/current directory/);
  });

  test("a valid name and '.' are accepted", () => {
    expect(validateProjectInput("my-app")).toBeUndefined();
    expect(validateProjectInput(".")).toBeUndefined();
  });

  test("a path resolving to an existing file is rejected", async () => {
    tmpDir = await fs.mkdtemp(path.join(cwd, "nc-validation-"));
    await fs.writeFile(path.join(tmpDir, "afile"), "x");
    const input = path.join(path.basename(tmpDir), "afile");
    expect(validateProjectInput(input)).toMatch(/file already exists/);
  });
});

describe("validateShadcnPreset", () => {
  test("empty, whitespace, or undefined defers to the default (allowed)", () => {
    expect(validateShadcnPreset(undefined)).toBeUndefined();
    expect(validateShadcnPreset("")).toBeUndefined();
    expect(validateShadcnPreset("   ")).toBeUndefined();
  });

  test("a bare token is accepted", () => {
    expect(validateShadcnPreset("b27GcrRo")).toBeUndefined();
    expect(validateShadcnPreset("my-preset_1")).toBeUndefined();
  });

  test("spaces, slashes, or other punctuation are rejected", () => {
    expect(validateShadcnPreset("foo bar")).toMatch(/letters, numbers/);
    expect(validateShadcnPreset("a/b")).toBeDefined();
    expect(validateShadcnPreset("drop;table")).toBeDefined();
  });
});
