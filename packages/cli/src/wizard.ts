import { isCancel } from "@clack/core";
import * as p from "@clack/prompts";
import ansis from "ansis";

import { BRAND, SYMBOLS } from "@/branding";

/**
 * A section-header badge — an inverse-brand pill on its own bar line, printed
 * above the first prompt of each wizard topic area. clack redraws only the
 * prompt block below it, so the badge persists (like `intro`).
 *
 * Lives here, not in `ui/`: the wizard is its only consumer, and importing it
 * from `ui/` would make `wizard` ↔ `ui` a cycle.
 */
const sectionBadge = (label: string): string =>
  `${ansis.gray(SYMBOLS.bar)}\n${ansis.gray(SYMBOLS.bar)}  ${ansis.bgHex(BRAND).white.bold(` ${label} `)}`;

/** Returned by a navigable prompt when the user presses "b"/Esc to go back. */
export const GO_BACK: unique symbol = Symbol("go-back");

export const isGoBack = (value: unknown): value is typeof GO_BACK =>
  value === GO_BACK;

type MaybePromise<T> = T | Promise<T>;

/** One ordered step in the wizard engine. */
export interface WizardStep<A> {
  /** Key under which this step's answer is stored. */
  key: keyof A & string;
  /**
   * Run the step. Return one of:
   * - a value  → stored under `key` and advance
   * - `GO_BACK` → return to the previous *shown* step
   * - the clack cancel symbol → exit
   * - `undefined` → skip this step (condition not met)
   *
   * `canGoBack` is false only on the first shown step, so prompts can hide the
   * "back" hint there.
   */
  run: (answers: Partial<A>, canGoBack: boolean) => MaybePromise<unknown>;
  /**
   * Marks the start of a topic area — set it on the first (always-shown) step
   * of each section only. A badge prints when a step's `section` differs from
   * the previous *shown* step's; a conditional first step would orphan it.
   */
  section?: string;
  /**
   * Optional guard evaluated before the section badge and `run`. When it returns
   * false the step is skipped entirely — no badge, no prompt. Use it to gate a
   * whole tail of steps (e.g. quick-start) without orphaning their badges;
   * per-step "condition not met" skips can still just return `undefined`.
   */
  when?: (answers: Partial<A>) => boolean;
}

/** Find the last step before `index` that produced UI. */
const lastShownBefore = (shown: boolean[], index: number): number => {
  for (let i = index - 1; i >= 0; i--) {
    if (shown[i]) return i;
  }
  return -1;
};

/**
 * Print the standard cancel message and exit the process with code 0.
 */
export const cancelAndExit = (): never => {
  p.cancel("Operation cancelled.");
  process.exit(0);
};

/**
 * Unwrap an answer that an always-run step must have produced.
 *
 * @throws If `value` is undefined (a wizard invariant was violated).
 */
export const required = <T>(value: T | undefined, field: string): T => {
  if (value === undefined)
    throw new Error(`Wizard invariant violated: ${field} is missing.`);
  return value;
};

/**
 * Run an ordered list of steps with back-navigation, collecting their answers.
 * Skipped steps (condition not met) have no entry in the returned partial.
 */
export const runWizard = async <A>(
  steps: WizardStep<A>[],
): Promise<Partial<A>> => {
  const answers: Record<string, unknown> = {};
  const shown: boolean[] = [];
  let index = 0;

  while (index < steps.length) {
    const step = steps[index];
    if (!step) break;

    const skip = (): void => {
      delete answers[step.key];
      shown[index] = false;
      index += 1;
    };

    if (step.when && !step.when(answers as Partial<A>)) {
      skip();
      continue;
    }

    const prevShown = lastShownBefore(shown, index);
    const canGoBack = prevShown !== -1;

    const prevSection =
      prevShown === -1 ? undefined : steps[prevShown]?.section;
    if (step.section !== undefined && step.section !== prevSection) {
      console.log(sectionBadge(step.section));
    }

    const result = await step.run(answers as Partial<A>, canGoBack);

    if (isGoBack(result)) {
      const prev = lastShownBefore(shown, index);
      if (prev !== -1) {
        shown[prev] = false;
        index = prev;
      }
      continue;
    }

    if (isCancel(result)) {
      cancelAndExit();
    }

    if (result === undefined) {
      skip();
      continue;
    }

    answers[step.key] = result;
    shown[index] = true;
    index += 1;
  }

  return answers as Partial<A>;
};
