import { isCancel } from "@clack/core";
import * as p from "@clack/prompts";
import ansis from "ansis";

import { BRAND, SYMBOLS } from "@/branding";

// Lives here, not in `ui/`: the wizard is its only consumer, and importing it
// from `ui/` would make `wizard` ↔ `ui` a cycle.
const renderSectionBadge = (label: string): string =>
  `${ansis.gray(SYMBOLS.bar)}\n${ansis.gray(SYMBOLS.bar)}  ${ansis.bgHex(BRAND).white.bold(` ${label} `)}`;

/** Returned by a navigable prompt when the user presses "b"/Esc to go back. */
export const GO_BACK: unique symbol = Symbol("go-back");

export const isGoBack = (value: unknown): value is typeof GO_BACK =>
  value === GO_BACK;

type MaybePromise<T> = T | Promise<T>;

/** One ordered step in the wizard engine. */
export interface WizardStep<A> {
  key: keyof A & string;
  /**
   * Return a value to store it under `key` and advance, `GO_BACK` to return to
   * the previous *shown* step, the clack cancel symbol to exit, or `undefined`
   * to skip this step. `canGoBack` is false only on the first shown step, so
   * prompts can hide the "back" hint there.
   */
  run: (
    answers: Partial<A>,
    canGoBack: boolean,
  ) => MaybePromise<A[keyof A] | symbol | undefined>;
  /**
   * Marks the start of a topic area — set it on the first (always-shown) step
   * of each section only. A badge prints when a step's `section` differs from
   * the previous *shown* step's; a conditional first step would orphan it.
   */
  section?: string;
  /**
   * Evaluated before the section badge and `run`; returning false skips the
   * step entirely — no badge, no prompt. Use it to gate a whole tail of steps
   * (e.g. quick-start) without orphaning their badges.
   */
  when?: (answers: Partial<A>) => boolean;
}

const NO_STEP = -1;

/** Find the last step before `index` that produced UI. */
const findLastShownBefore = (shown: boolean[], index: number): number => {
  for (let i = index - 1; i >= 0; i--) {
    if (shown[i]) return i;
  }
  return NO_STEP;
};

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
  const answers = new Map<string, unknown>();
  const readAnswers = (): Partial<A> =>
    Object.fromEntries(answers) as Partial<A>;
  const shown: boolean[] = [];
  let index = 0;

  while (index < steps.length) {
    const step = steps[index];
    if (!step) break;

    const skip = (): void => {
      answers.delete(step.key);
      shown[index] = false;
      index += 1;
    };

    if (step.when && !step.when(readAnswers())) {
      skip();
      continue;
    }

    const previousShown = findLastShownBefore(shown, index);
    const canGoBack = previousShown !== NO_STEP;

    const previousSection = canGoBack
      ? steps[previousShown]?.section
      : undefined;
    if (step.section !== undefined && step.section !== previousSection) {
      console.log(renderSectionBadge(step.section));
    }

    const result = await step.run(readAnswers(), canGoBack);

    if (isGoBack(result)) {
      index = canGoBack ? previousShown : index;
      shown[index] = false;
      continue;
    }

    if (isCancel(result)) {
      cancelAndExit();
    }

    if (result === undefined) {
      skip();
      continue;
    }

    answers.set(step.key, result);
    shown[index] = true;
    index += 1;
  }

  return readAnswers();
};
