import { expect, test } from "vitest";

import { isValidHostname, resolvesToAny } from "../dns";

test("isValidHostname accepts real hostnames and rejects junk", () => {
  expect(isValidHostname("app.example.com")).toBe(true);
  expect(isValidHostname("a-b.co")).toBe(true);
  expect(isValidHostname("")).toBe(false);
  expect(isValidHostname("-bad.com")).toBe(false);
  expect(isValidHostname("has space.com")).toBe(false);
});

test("resolvesToAny compares resolved A records to the server IPs", async () => {
  const lookup = async () => ["203.0.113.7"];
  expect(await resolvesToAny("x.example.com", ["203.0.113.7"], lookup)).toBe(
    true,
  );
  expect(await resolvesToAny("x.example.com", ["198.51.100.1"], lookup)).toBe(
    false,
  );
});

test("resolvesToAny returns false when resolution fails", async () => {
  const lookup = async () => {
    throw new Error("ENOTFOUND");
  };
  expect(await resolvesToAny("x.example.com", ["203.0.113.7"], lookup)).toBe(
    false,
  );
});
