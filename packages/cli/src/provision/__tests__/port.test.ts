import { expect, test } from "vitest";

import { allocatePort, parseListeningPorts, PORT_RANGE } from "../port";

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

test("parseListeningPorts reads the trailing port off the Local Address:Port column", () => {
  const output = `State   Recv-Q Send-Q Local Address:Port  Peer Address:Port
LISTEN  0      128    0.0.0.0:8100        0.0.0.0:*
LISTEN  0      128    [::]:8100           [::]:*
LISTEN  0      128    127.0.0.1:5432      0.0.0.0:*
`;
  expect(parseListeningPorts(output)).toEqual([8100, 5432]);
});
