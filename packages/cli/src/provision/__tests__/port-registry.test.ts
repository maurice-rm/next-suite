import { expect, test } from "vitest";

import { parsePortRegistry, removePortEntry } from "../port-registry";

test("removePortEntry removes only the named key", () => {
  const registry = JSON.stringify({ acme: 8100, other: 8101 });
  expect(removePortEntry(registry, "acme")).toBe(
    `${JSON.stringify({ other: 8101 }, null, 2)}\n`,
  );
});

test("removePortEntry tolerates an empty registry", () => {
  expect(removePortEntry("", "acme")).toBe("{}\n");
});

test("removePortEntry is a no-op when the key is already absent", () => {
  const registry = JSON.stringify({ other: 8101 });
  expect(removePortEntry(registry, "acme")).toBe(
    `${JSON.stringify({ other: 8101 }, null, 2)}\n`,
  );
});

test("parsePortRegistry rejects a registry whose values are not port numbers", () => {
  expect(() => parsePortRegistry(JSON.stringify({ acme: "8100" }))).toThrow(
    /project names to port numbers/,
  );
  expect(() => parsePortRegistry("[8100]")).toThrow(
    /project names to port numbers/,
  );
});

test("parsePortRegistry reads an empty file as an empty registry", () => {
  expect(parsePortRegistry("  \n")).toEqual({});
});
