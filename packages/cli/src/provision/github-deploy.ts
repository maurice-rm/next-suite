import type { DeployTarget } from "./deploy-target";

export interface GithubEntry {
  kind: "secret" | "variable";
  name: string;
  value: string;
}

export type GithubEntryName = Pick<GithubEntry, "kind" | "name">;

export const GITHUB_DEPLOY_NAMES: GithubEntryName[] = [
  { kind: "secret", name: "DEPLOY_SSH_KEY" },
  { kind: "secret", name: "DEPLOY_SSH_HOST" },
  { kind: "secret", name: "DEPLOY_SSH_USER" },
  { kind: "variable", name: "DEPLOY_PATH" },
  { kind: "variable", name: "NEXT_PUBLIC_APP_URL" },
];

export const buildGithubDeployEntries = (
  deploy: DeployTarget,
  privateKey: string,
  appUrl?: string,
): GithubEntry[] => {
  const entries: GithubEntry[] = [
    { kind: "secret", name: "DEPLOY_SSH_KEY", value: privateKey },
    { kind: "secret", name: "DEPLOY_SSH_HOST", value: deploy.host },
    { kind: "secret", name: "DEPLOY_SSH_USER", value: deploy.user },
    { kind: "variable", name: "DEPLOY_PATH", value: deploy.path },
  ];
  if (appUrl !== undefined) {
    entries.push({
      kind: "variable",
      name: "NEXT_PUBLIC_APP_URL",
      value: appUrl,
    });
  }
  return entries;
};

const formatChecklistEntry = (entry: GithubEntry, value: string): string =>
  value.includes("\n")
    ? `${entry.kind} ${entry.name}:\n${value}`
    : `${entry.kind} ${entry.name}: ${value}`;

/** One block for the whole manual-secrets checklist — a multi-line value (the
 * SSH private key) gets its own label line, so it renders verbatim instead of
 * breaking a single `key: value` line across the terminal. */
export const formatManualChecklist = (entries: GithubEntry[]): string => {
  let body = "";
  let wasPreviousMultiline = false;
  for (const entry of entries) {
    const value = entry.value.replace(/\n+$/, "");
    const isMultiline = value.includes("\n");
    if (body !== "")
      body += isMultiline || wasPreviousMultiline ? "\n\n" : "\n";
    body += formatChecklistEntry(entry, value);
    wasPreviousMultiline = isMultiline;
  }
  return body;
};
