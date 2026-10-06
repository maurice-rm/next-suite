import { beforeEach, expect, test, vi } from "vitest";

import { createStepSpinner } from "../spinner-steps";

const {
  spinnerStart,
  spinnerStop,
  spinnerError,
  spinnerClear,
  logStep,
  logError,
} = vi.hoisted(() => ({
  spinnerStart: vi.fn(),
  spinnerStop: vi.fn(),
  spinnerError: vi.fn(),
  spinnerClear: vi.fn(),
  logStep: vi.fn(),
  logError: vi.fn(),
}));

vi.mock("@clack/prompts", () => ({
  spinner: () => ({
    start: spinnerStart,
    stop: spinnerStop,
    error: spinnerError,
    clear: spinnerClear,
  }),
  log: { step: logStep, error: logError },
}));

beforeEach(() => {
  vi.clearAllMocks();
});

test("onStepStart starts a spinner with the label", () => {
  const spinner = createStepSpinner(true);
  spinner.onStepStart("Doing thing…");
  expect(spinnerStart).toHaveBeenCalledWith("Doing thing…");
});

test("onStep stops the running spinner with the completion line", () => {
  const spinner = createStepSpinner(true);
  spinner.onStepStart("Doing thing…");
  spinner.onStep("Done");
  expect(spinnerStop).toHaveBeenCalledWith("Done");
  expect(logStep).not.toHaveBeenCalled();
});

test("onStep with no active spinner logs the line plainly (default no-op-safe path)", () => {
  const spinner = createStepSpinner(true);
  spinner.onStep("Just a note");
  expect(logStep).toHaveBeenCalledWith("Just a note");
  expect(spinnerStop).not.toHaveBeenCalled();
});

test("a second onStep after the spinner is already stopped falls back to plain logging", () => {
  const spinner = createStepSpinner(true);
  spinner.onStepStart("Doing thing…");
  spinner.onStep("First result");
  spinner.onStep("Second result");
  expect(spinnerStop).toHaveBeenCalledTimes(1);
  expect(logStep).toHaveBeenCalledWith("Second result");
});

test("onStepStart clears a still-running spinner from a phase that never completed", () => {
  const spinner = createStepSpinner(true);
  spinner.onStepStart("First phase…");
  spinner.onStepStart("Second phase…");
  expect(spinnerClear).toHaveBeenCalledOnce();
  expect(spinnerStart).toHaveBeenCalledTimes(2);
});

test("fail stops a running spinner with an error mark", () => {
  const spinner = createStepSpinner(true);
  spinner.onStepStart("Doing thing…");
  spinner.fail();
  expect(spinnerError).toHaveBeenCalledWith("Failed");
});

test("fail is a no-op when no spinner is running", () => {
  const spinner = createStepSpinner(true);
  spinner.fail();
  expect(spinnerError).not.toHaveBeenCalled();
});

test("without a TTY no spinner is created — only the completion lines are logged", () => {
  const spinner = createStepSpinner(false);
  spinner.onStepStart("Doing thing…");
  spinner.onStep("Done");

  expect(spinnerStart).not.toHaveBeenCalled();
  expect(spinnerStop).not.toHaveBeenCalled();
  expect(logStep).toHaveBeenCalledWith("Done");
});

test("without a TTY a failure names the phase it happened in", () => {
  const spinner = createStepSpinner(false);
  spinner.onStepStart("Requesting TLS certificate…");
  spinner.fail();

  expect(logError).toHaveBeenCalledWith("Requesting TLS certificate… Failed");
  expect(spinnerError).not.toHaveBeenCalled();
});
