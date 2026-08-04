import path from "node:path";

import { expect, test } from "vitest";

import {
  configPath,
  parseGlobalConfig,
  serializeGlobalConfig,
} from "../config";

const valid = {
  host: "vps.example.com",
  adminUser: "root",
  certbotEmail: "me@x.io",
};

test("configPath honors XDG_CONFIG_HOME", () => {
  const prev = process.env.XDG_CONFIG_HOME;
  process.env.XDG_CONFIG_HOME = "/xdg";
  expect(configPath()).toBe(path.join("/xdg", "next-suite", "config.json"));
  process.env.XDG_CONFIG_HOME = prev;
});

test("round-trips through serialize/parse", () => {
  expect(parseGlobalConfig(serializeGlobalConfig(valid))).toEqual(valid);
});

test("serializeGlobalConfig ends with a newline", () => {
  expect(serializeGlobalConfig(valid).endsWith("}\n")).toBe(true);
});

test("parseGlobalConfig rejects a missing field", () => {
  expect(() =>
    parseGlobalConfig(JSON.stringify({ host: "x", adminUser: "root" })),
  ).toThrow(/certbotEmail/);
});

test("parseGlobalConfig rejects null JSON", () => {
  expect(() => parseGlobalConfig("null")).toThrow(/must be a JSON object/);
});

test("parseGlobalConfig rejects array JSON", () => {
  expect(() => parseGlobalConfig("[]")).toThrow(/must be a JSON object/);
});

test("parseGlobalConfig rejects an invalid certbotEmail", () => {
  expect(() =>
    parseGlobalConfig(
      JSON.stringify({ ...valid, certbotEmail: "not-an-email" }),
    ),
  ).toThrow(/certbotEmail/);
});

test("host and adminUser may not start with a dash — ssh would read them as options", () => {
  const bad = (over: Record<string, string>) =>
    JSON.stringify({
      host: "vps.example.com",
      adminUser: "root",
      certbotEmail: "me@x.io",
      ...over,
    });
  expect(() =>
    parseGlobalConfig(bad({ adminUser: "-oProxyCommand=touch /tmp/pwned" })),
  ).toThrow(/adminUser/);
  expect(() => parseGlobalConfig(bad({ host: "-oProxyCommand=x" }))).toThrow(
    /host/,
  );
  expect(() => parseGlobalConfig(bad({}))).not.toThrow();
});
