import { isJsonObject } from "./json-object";

export const PORT_REGISTRY_PATH = "/srv/ports.json";

export type PortRegistry = Record<string, number>;

const isPortRegistry = (value: unknown): value is PortRegistry =>
  isJsonObject(value) &&
  Object.values(value).every((port) => Number.isInteger(port));

export const parsePortRegistry = (raw: string): PortRegistry => {
  if (raw.trim() === "") return {};
  const data: unknown = JSON.parse(raw);
  if (!isPortRegistry(data)) {
    throw new Error(
      `${PORT_REGISTRY_PATH} must be a JSON object of project names to port numbers.`,
    );
  }
  return data;
};

export const serializePortRegistry = (registry: PortRegistry): string =>
  `${JSON.stringify(registry, null, 2)}\n`;

export const removePortEntry = (registryJson: string, name: string): string => {
  const remaining = Object.entries(parsePortRegistry(registryJson)).filter(
    ([project]) => project !== name,
  );
  return serializePortRegistry(Object.fromEntries(remaining));
};
