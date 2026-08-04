import * as p from "@clack/prompts";

export interface StepSpinner {
  /** Starts a spinner for a slow phase, clearing a still-running one first (a
   * phase that never produced its own completion line). */
  onStepStart: (label: string) => void;
  /** Completes the running spinner with this line, or — when no spinner is
   * running — logs it plainly, so extra lines within one phase (e.g. several
   * GitHub deletes per "phase") render the same as before this existed. */
  onStep: (line: string) => void;
  /** Stops a still-running spinner with a failure mark before an error
   * propagates, so a thrown mid-phase error never leaves a dangling frame. */
  fail: (message?: string) => void;
}

export const createStepSpinner = (
  interactive = Boolean(process.stdout.isTTY),
): StepSpinner => {
  if (!interactive) {
    let pending: string | undefined;
    return {
      onStepStart: (label) => {
        pending = label;
      },
      onStep: (line) => {
        pending = undefined;
        p.log.step(line);
      },
      fail: (message = "Failed") => {
        p.log.error(pending ? `${pending} ${message}` : message);
        pending = undefined;
      },
    };
  }

  let active: ReturnType<typeof p.spinner> | undefined;
  return {
    onStepStart: (label) => {
      active?.clear();
      active = p.spinner();
      active.start(label);
    },
    onStep: (line) => {
      if (active) {
        active.stop(line);
        active = undefined;
      } else {
        p.log.step(line);
      }
    },
    fail: (message = "Failed") => {
      active?.error(message);
      active = undefined;
    },
  };
};
