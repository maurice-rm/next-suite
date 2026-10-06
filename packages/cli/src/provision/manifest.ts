import type { ProjectManifest } from "@/generator/manifest";

import { isJsonObject } from "./json-object";

// The name becomes a Linux user; useradd caps that at 32 characters.
const SAFE_NAME = /^[a-z][a-z0-9._-]{0,31}$/;

const SUPPORTED_VERSION = 1;

const parseJson = (raw: string): unknown => {
  try {
    return JSON.parse(raw);
  } catch {
    throw new Error("next-suite.json is not valid JSON.");
  }
};

export const parseManifest = (raw: string): ProjectManifest => {
  const data = parseJson(raw);
  if (!isJsonObject(data)) {
    throw new Error("next-suite.json must be a JSON object.");
  }
  if (data.version !== SUPPORTED_VERSION) {
    throw new Error(
      `Unsupported next-suite.json version: ${String(data.version)} (expected 1). Re-scaffold or upgrade the CLI.`,
    );
  }
  const { name } = data;
  if (typeof name !== "string" || name.length === 0) {
    throw new Error("next-suite.json is missing a 'name'.");
  }
  if (!SAFE_NAME.test(name)) {
    throw new Error(
      `next-suite.json: unsafe project name '${name}' (it becomes a Linux user: start with a lowercase letter, then at most 31 more of lowercase letters, digits, dot, underscore or hyphen).`,
    );
  }
  return data as unknown as ProjectManifest;
};

export const requireProxied = (manifest: ProjectManifest): void => {
  if (manifest.production?.mode !== "proxied") {
    throw new Error(
      "provision supports only the 'proxied' production mode (this VPS uses a host nginx). Re-scaffold with --deployment proxied.",
    );
  }
};
