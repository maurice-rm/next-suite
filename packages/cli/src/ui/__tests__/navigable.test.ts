import { describe, expect, test, vi } from "vitest";

// Capture the options each clack prompt is constructed with, so the
// initialValue-forwarding of defineSelect/defineConfirm can be asserted without
// a TTY. Hoisted so the vi.mock factory below can close over them.
const { selectArgs, confirmArgs } = vi.hoisted(() => ({
  selectArgs: [] as Record<string, unknown>[],
  confirmArgs: [] as Record<string, unknown>[],
}));

vi.mock("@clack/core", () => {
  class FakePrompt {
    on = vi.fn();
    prompt(): Promise<unknown> {
      return Promise.resolve("value");
    }
  }
  return {
    SelectPrompt: class extends FakePrompt {
      constructor(options: Record<string, unknown>) {
        super();
        selectArgs.push(options);
      }
    },
    ConfirmPrompt: class extends FakePrompt {
      constructor(options: Record<string, unknown>) {
        super();
        confirmArgs.push(options);
      }
    },
    GroupMultiSelectPrompt: class extends FakePrompt {},
    TextPrompt: class extends FakePrompt {},
    isCancel: () => false,
  };
});

import type { State } from "@clack/core";

import { GO_BACK } from "@/wizard";

import { withGoBack } from "../go-back";
import { defineConfirm } from "../navigable-confirm";
import { defineSelect } from "../navigable-select";

type KeyListener = (char?: string, key?: { name?: string }) => void;

// A fake clack prompt: it captures the key listener and optionally fires a key
// before resolving, so withGoBack's back-vs-value logic can be driven without a
// TTY. `state` is the clack-internal field withGoBack mutates to cancel.
const fakePrompt = (options: { value?: unknown; pressKey?: string } = {}) => {
  let onKey: KeyListener | undefined;
  return {
    state: "active" as State,
    on(_event: "key", listener: KeyListener) {
      onKey = listener;
    },
    prompt() {
      if (options.pressKey !== undefined) {
        onKey?.(options.pressKey, { name: options.pressKey });
      }
      return Promise.resolve(options.value ?? "chosen");
    },
  };
};

const isBackKey = (char?: string) => char === "b";

describe("withGoBack", () => {
  test("resolves GO_BACK when the back key is pressed", async () => {
    expect(
      await withGoBack(fakePrompt({ pressKey: "b" }), true, isBackKey),
    ).toBe(GO_BACK);
  });

  test("resolves the prompt's value when no back key is pressed", async () => {
    expect(
      await withGoBack(fakePrompt({ value: "picked" }), true, isBackKey),
    ).toBe("picked");
  });

  test("ignores the back key when back-navigation is disabled", async () => {
    expect(
      await withGoBack(
        fakePrompt({ value: "picked", pressKey: "b" }),
        false,
        isBackKey,
      ),
    ).toBe("picked");
  });
});

// Regression guard for the back-navigation bug: revisiting a step must restore
// the prior answer, which relies on the prompt wrappers forwarding initialValue.
describe("defineSelect / defineConfirm initialValue forwarding", () => {
  test("defineSelect forwards initialValue to the prompt", async () => {
    const select = defineSelect("Pick one", [
      { value: "a", label: "A" },
      { value: "b", label: "B" },
    ]);
    await select(true, "b");
    expect(selectArgs.at(-1)?.initialValue).toBe("b");
  });

  test("defineSelect leaves initialValue undefined when omitted", async () => {
    const select = defineSelect("Pick one", [{ value: "a", label: "A" }]);
    await select(true);
    expect(selectArgs.at(-1)?.initialValue).toBeUndefined();
  });

  test("defineConfirm forwards a false initialValue over the Yes default", async () => {
    await defineConfirm("Sure?")(true, false);
    expect(confirmArgs.at(-1)?.initialValue).toBe(false);
  });

  test("defineConfirm defaults to Yes (true) when initialValue is omitted", async () => {
    await defineConfirm("Sure?")(true);
    expect(confirmArgs.at(-1)?.initialValue).toBe(true);
  });
});
