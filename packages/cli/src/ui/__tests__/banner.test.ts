import { describe, expect, test } from "vitest";

import { buildMetaStrip, centerText, renderVersionPart } from "../banner";

describe("renderVersionPart", () => {
  test('"latest" appends the latest tag', () => {
    expect(renderVersionPart("1.2.3", { state: "latest" }).plain).toBe(
      "v1.2.3 (latest)",
    );
  });

  test('"outdated" shows the update hint with the newer version', () => {
    expect(
      renderVersionPart("1.0.0", { state: "outdated", latest: "2.0.0" }).plain,
    ).toBe("v1.0.0 (update available → v2.0.0)");
  });

  test('"unknown" is just the version', () => {
    expect(renderVersionPart("1.2.3", { state: "unknown" }).plain).toBe(
      "v1.2.3",
    );
  });
});

describe("buildMetaStrip", () => {
  test("is the version and the repo link, separated by a dot", () => {
    expect(buildMetaStrip("1.0.0", { state: "unknown" }).plain).toBe(
      "v1.0.0  ·  github.com/maurice-rm/next-suite",
    );
  });

  test("carries the version status (latest tag)", () => {
    expect(buildMetaStrip("1.0.0", { state: "latest" }).plain).toBe(
      "v1.0.0 (latest)  ·  github.com/maurice-rm/next-suite",
    );
  });
});

describe("centerText", () => {
  test("left-pads so the visible glyphs sit centered", () => {
    expect(centerText("X", 1, 11)).toBe(`${" ".repeat(5)}X`);
  });

  test("never pads negatively when content is wider than the width", () => {
    expect(centerText("XXXXX", 5, 3)).toBe("XXXXX");
  });
});
