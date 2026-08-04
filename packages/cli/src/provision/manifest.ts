import type { ProjectManifest } from "@/generator/manifest";

// The name becomes a Linux user; useradd caps that at 32 characters.
const SAFE_NAME = /^[a-z][a-z0-9._-]{0,31}$/;

export const parseManifest = (raw: string): ProjectManifest => {
  let data: unknown;
  try {
    data = JSON.parse(raw);
  } catch {
    throw new Error("next-suite.json is not valid JSON.");
  }
  if (typeof data !== "object" || data === null || Array.isArray(data)) {
    throw new Error("next-suite.json must be a JSON object.");
  }
  const m = data as Partial<ProjectManifest>;
  if (m.version !== 1) {
    throw new Error(
      `Unsupported next-suite.json version: ${String(m.version)} (expected 1). Re-scaffold or upgrade the CLI.`,
    );
  }
  if (typeof m.name !== "string" || m.name.length === 0) {
    throw new Error("next-suite.json is missing a 'name'.");
  }
  if (!SAFE_NAME.test(m.name)) {
    throw new Error(
      `next-suite.json: unsafe project name '${m.name}' (it becomes a Linux user: start with a lowercase letter, then at most 31 more of lowercase letters, digits, dot, underscore or hyphen).`,
    );
  }
  return m as ProjectManifest;
};

export const requireProxied = (m: ProjectManifest): void => {
  if (m.production?.mode !== "proxied") {
    throw new Error(
      "provision supports only the 'proxied' production mode (this VPS uses a host nginx). Re-scaffold with --deployment proxied.",
    );
  }
};
