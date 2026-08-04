import { afterEach, describe, expect, test } from "vitest";

import { PACKAGE_MANAGERS } from "@/package-managers";

import { detectPackageManager } from "../pm-detector";

const original = process.env.npm_config_user_agent;
afterEach(() => {
  if (original === undefined) delete process.env.npm_config_user_agent;
  else process.env.npm_config_user_agent = original;
});

describe("detectPackageManager", () => {
  test.each(PACKAGE_MANAGERS.map((pm) => pm.id))(
    "detects %s from the user agent",
    (id) => {
      process.env.npm_config_user_agent = `${id}/1.0.0 node/v22 linux x64`;
      expect(detectPackageManager()).toBe(id);
    },
  );

  test("returns undefined for an unknown agent", () => {
    process.env.npm_config_user_agent = "deno/2.0 node/v22 linux x64";
    expect(detectPackageManager()).toBeUndefined();
  });

  test("returns undefined when the env var is absent", () => {
    delete process.env.npm_config_user_agent;
    expect(detectPackageManager()).toBeUndefined();
  });
});
