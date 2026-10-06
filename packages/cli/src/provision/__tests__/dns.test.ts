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
  const lookup = () => Promise.resolve(["203.0.113.7"]);
  expect(await resolvesToAny("x.example.com", ["203.0.113.7"], lookup)).toBe(
    true,
  );
  expect(await resolvesToAny("x.example.com", ["198.51.100.1"], lookup)).toBe(
    false,
  );
});

const dnsError = (code: string): Error =>
  Object.assign(new Error(`queryA ${code} x.example.com`), { code });

test("resolvesToAny returns false when the domain does not resolve", async () => {
  for (const code of ["ENOTFOUND", "ENODATA"]) {
    const lookup = () => Promise.reject(dnsError(code));
    expect(await resolvesToAny("x.example.com", ["203.0.113.7"], lookup)).toBe(
      false,
    );
  }
});

test("resolvesToAny rethrows a lookup failure that is not an answer about the domain", async () => {
  const lookup = () => Promise.reject(dnsError("EBADNAME"));
  await expect(
    resolvesToAny("x.example.com", ["203.0.113.7"], lookup),
  ).rejects.toThrow(/EBADNAME/);
});
