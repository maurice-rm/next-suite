export const PORT_RANGE = { min: 8100, max: 8199 } as const;

export const allocatePort = (
  reserved: readonly number[],
  liveListening: readonly number[],
  range: { min: number; max: number } = PORT_RANGE,
): number => {
  const taken = new Set([...reserved, ...liveListening]);
  for (let port = range.min; port <= range.max; port++) {
    if (!taken.has(port)) return port;
  }
  throw new Error(
    `No free port in ${range.min}-${range.max} (all ${range.max - range.min + 1} taken).`,
  );
};
