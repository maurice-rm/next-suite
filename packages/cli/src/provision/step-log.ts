export interface StepHandlers {
  onStep?: (line: string) => void;
  onStepStart?: (label: string) => void;
}

export interface StepLog {
  lines: string[];
  step: (line: string) => void;
  start: (label: string) => void;
}

export const createStepLog = (handlers: StepHandlers): StepLog => {
  const lines: string[] = [];
  return {
    lines,
    step: (line) => {
      lines.push(line);
      handlers.onStep?.(line);
    },
    start: (label) => {
      handlers.onStepStart?.(label);
    },
  };
};
