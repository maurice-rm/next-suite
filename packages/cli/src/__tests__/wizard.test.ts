import { expect, test, vi } from "vitest";

import { GO_BACK, runWizard, type WizardStep } from "../wizard";

interface Answers {
  a?: string;
  b?: string;
  c?: string;
}

/** Build a step with a plain (non-interactive) run, so `runWizard` needs no TTY. */
const step = (
  key: keyof Answers & string,
  run: WizardStep<Answers>["run"],
  extra: Partial<WizardStep<Answers>> = {},
): WizardStep<Answers> => ({ key, run, ...extra });

test("collects answers from the steps in order", async () => {
  const answers = await runWizard<Answers>([
    step("a", () => "1"),
    step("b", () => "2"),
  ]);
  expect(answers).toEqual({ a: "1", b: "2" });
});

test("a step that returns undefined is skipped (no key stored)", async () => {
  const answers = await runWizard<Answers>([
    step("a", () => "1"),
    step("b", () => undefined),
    step("c", () => "3"),
  ]);
  expect(answers).toEqual({ a: "1", c: "3" });
});

test("a step whose `when` is false is skipped without ever running", async () => {
  const bRun = vi.fn(() => "2");
  const answers = await runWizard<Answers>([
    step("a", () => "1"),
    step("b", bRun, { when: () => false }),
    step("c", () => "3"),
  ]);
  expect(bRun).not.toHaveBeenCalled();
  expect(answers).toEqual({ a: "1", c: "3" });
});

test("`when` sees the accumulated answers and gates dynamically", async () => {
  const gated = (first: string) =>
    runWizard<Answers>([
      step("a", () => first),
      step("b", () => "2", { when: (ans) => ans.a === "yes" }),
    ]);
  expect(await gated("yes")).toEqual({ a: "yes", b: "2" });
  expect(await gated("no")).toEqual({ a: "no" });
});

test("back-navigation returns to the previous shown step", async () => {
  let aRuns = 0;
  let bWentBack = false;
  const answers = await runWizard<Answers>([
    step("a", () => {
      aRuns += 1;
      return "1";
    }),
    step("b", () => {
      if (!bWentBack) {
        bWentBack = true;
        return GO_BACK;
      }
      return "2";
    }),
  ]);
  expect(aRuns).toBe(2); // ran once, then again after "b" went back
  expect(answers).toEqual({ a: "1", b: "2" });
});

test("a `when`-skipped step is not a back target", async () => {
  const seen: string[] = [];
  let cWentBack = false;
  await runWizard<Answers>([
    step("a", () => {
      seen.push("a");
      return "1";
    }),
    step(
      "b",
      () => {
        seen.push("b");
        return "2";
      },
      { when: () => false },
    ),
    step("c", () => {
      seen.push("c");
      if (!cWentBack) {
        cWentBack = true;
        return GO_BACK;
      }
      return "3";
    }),
  ]);
  expect(seen).not.toContain("b");
  expect(seen.filter((s) => s === "a")).toHaveLength(2); // back landed on "a", not "b"
});

test("canGoBack is false only on the first shown step", async () => {
  const canGoBack: boolean[] = [];
  await runWizard<Answers>([
    step("a", (_ans, back) => {
      canGoBack.push(back);
      return "1";
    }),
    step("b", (_ans, back) => {
      canGoBack.push(back);
      return "2";
    }),
  ]);
  expect(canGoBack).toEqual([false, true]);
});
