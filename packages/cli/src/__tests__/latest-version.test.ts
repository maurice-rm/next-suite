import { afterEach, expect, test, vi } from "vitest";

import { fetchLatestVersion } from "../latest-version";

const mockFetch = (impl: () => Promise<unknown>): void => {
  vi.stubGlobal("fetch", vi.fn(impl));
};

afterEach(() => vi.unstubAllGlobals());

test("returns the latest version from the registry", async () => {
  mockFetch(async () => ({
    ok: true,
    json: async () => ({ version: "1.2.3" }),
  }));
  expect(await fetchLatestVersion("create-next-suite")).toBe("1.2.3");
});

test("returns null for an unpublished package (non-OK response)", async () => {
  mockFetch(async () => ({ ok: false, json: async () => ({}) }));
  expect(await fetchLatestVersion("create-next-suite")).toBeNull();
});

test("returns null when the request fails (offline / timeout)", async () => {
  mockFetch(async () => {
    throw new Error("network down");
  });
  expect(await fetchLatestVersion("create-next-suite")).toBeNull();
});

test("returns null when the payload has no version string", async () => {
  mockFetch(async () => ({ ok: true, json: async () => ({}) }));
  expect(await fetchLatestVersion("create-next-suite")).toBeNull();
});
