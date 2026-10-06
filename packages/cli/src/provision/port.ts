export interface PortRange {
  min: number;
  max: number;
}

export const PORT_RANGE: PortRange = { min: 8100, max: 8199 };

const LOCAL_ADDRESS_COLUMN = 3;

const TRAILING_PORT = /:(\d+)$/;

export const allocatePort = (
  reserved: readonly number[],
  liveListening: readonly number[],
  range: PortRange = PORT_RANGE,
): number => {
  const taken = new Set([...reserved, ...liveListening]);
  for (let port = range.min; port <= range.max; port++) {
    if (!taken.has(port)) return port;
  }
  const size = range.max - range.min + 1;
  throw new Error(
    `No free port in ${String(range.min)}-${String(range.max)} (all ${String(size)} taken).`,
  );
};

/** From `ss -ltn` output, the port of each Local Address:Port field (4th column). */
export const parseListeningPorts = (ssOutput: string): number[] => {
  const ports = new Set<number>();
  for (const line of ssOutput.split("\n")) {
    const trimmed = line.trim();
    if (trimmed === "" || trimmed.startsWith("State")) continue;
    const column = trimmed.split(/\s+/)[LOCAL_ADDRESS_COLUMN] ?? "";
    const match = TRAILING_PORT.exec(column);
    if (match) ports.add(Number(match[1]));
  }
  return [...ports];
};
