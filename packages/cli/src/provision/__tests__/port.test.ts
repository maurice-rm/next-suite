import { expect, test } from "vitest";

import { allocatePort, PORT_RANGE } from "../port";

test("returns the range minimum when nothing is taken", () => {
  expect(allocatePort([], [])).toBe(PORT_RANGE.min);
});

test("skips both reserved and live-listening ports", () => {
  expect(allocatePort([8100], [8101])).toBe(8102);
});

test("treats reserved and live as a union", () => {
  expect(allocatePort([8100, 8102], [8101])).toBe(8103);
});

test("throws when the range is exhausted", () => {
  const range = { min: 8100, max: 8101 };
  expect(() => allocatePort([8100, 8101], [], range)).toThrow(/No free port/);
});
