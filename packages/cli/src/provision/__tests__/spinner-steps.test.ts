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
  const s = createStepSpinner(true);
  s.onStepStart("Doing thing…");
  expect(spinnerStart).toHaveBeenCalledWith("Doing thing…");
});

test("onStep stops the running spinner with the completion line", () => {
  const s = createStepSpinner(true);
  s.onStepStart("Doing thing…");
  s.onStep("Done");
  expect(spinnerStop).toHaveBeenCalledWith("Done");
  expect(logStep).not.toHaveBeenCalled();
});

test("onStep with no active spinner logs the line plainly (default no-op-safe path)", () => {
  const s = createStepSpinner(true);
  s.onStep("Just a note");
  expect(logStep).toHaveBeenCalledWith("Just a note");
  expect(spinnerStop).not.toHaveBeenCalled();
});

test("a second onStep after the spinner is already stopped falls back to plain logging", () => {
  const s = createStepSpinner(true);
  s.onStepStart("Doing thing…");
  s.onStep("First result");
  s.onStep("Second result");
  expect(spinnerStop).toHaveBeenCalledTimes(1);
  expect(logStep).toHaveBeenCalledWith("Second result");
});

test("onStepStart clears a still-running spinner from a phase that never completed", () => {
  const s = createStepSpinner(true);
  s.onStepStart("First phase…");
  s.onStepStart("Second phase…");
  expect(spinnerClear).toHaveBeenCalledOnce();
  expect(spinnerStart).toHaveBeenCalledTimes(2);
});

test("fail stops a running spinner with an error mark", () => {
  const s = createStepSpinner(true);
  s.onStepStart("Doing thing…");
  s.fail();
  expect(spinnerError).toHaveBeenCalledWith("Failed");
});

test("fail is a no-op when no spinner is running", () => {
  const s = createStepSpinner(true);
  s.fail();
  expect(spinnerError).not.toHaveBeenCalled();
});

test("without a TTY no spinner is created — only the completion lines are logged", () => {
  const s = createStepSpinner(false);
  s.onStepStart("Doing thing…");
  s.onStep("Done");

  expect(spinnerStart).not.toHaveBeenCalled();
  expect(spinnerStop).not.toHaveBeenCalled();
  expect(logStep).toHaveBeenCalledWith("Done");
});

test("without a TTY a failure names the phase it happened in", () => {
  const s = createStepSpinner(false);
  s.onStepStart("Requesting TLS certificate…");
  s.fail();

  expect(logError).toHaveBeenCalledWith("Requesting TLS certificate… Failed");
  expect(spinnerError).not.toHaveBeenCalled();
});
