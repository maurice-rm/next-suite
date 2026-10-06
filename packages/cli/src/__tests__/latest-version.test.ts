import { afterEach, expect, test, vi } from "vitest";

import { fetchLatestVersion } from "../latest-version";

const mockFetch = (implementation: () => Promise<unknown>): void => {
  vi.stubGlobal("fetch", vi.fn(implementation));
};

afterEach(() => vi.unstubAllGlobals());

test("returns the latest version from the registry", async () => {
  mockFetch(() =>
    Promise.resolve({
      ok: true,
      json: () => Promise.resolve({ version: "1.2.3" }),
    }),
  );
  expect(await fetchLatestVersion("create-next-suite")).toBe("1.2.3");
});

test("returns null for an unpublished package (non-OK response)", async () => {
  mockFetch(() =>
    Promise.resolve({ ok: false, json: () => Promise.resolve({}) }),
  );
  expect(await fetchLatestVersion("create-next-suite")).toBeNull();
});

test("returns null when the request fails (offline / timeout)", async () => {
  mockFetch(() => Promise.reject(new Error("network down")));
  expect(await fetchLatestVersion("create-next-suite")).toBeNull();
});

test("returns null when the payload has no version string", async () => {
  mockFetch(() =>
    Promise.resolve({ ok: true, json: () => Promise.resolve({}) }),
  );
  expect(await fetchLatestVersion("create-next-suite")).toBeNull();
});
