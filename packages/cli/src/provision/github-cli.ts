import { execa } from "execa";

export type GhRunner = (args: string[], input?: string) => Promise<void>;

export const runGh: GhRunner = async (args, input) => {
  await execa("gh", args, { input });
};

/**
 * Pins every `gh` call to one repository — otherwise `gh` picks the target from
 * the remotes, which in a fork is not necessarily `origin`.
 */
export const buildGhRepoArgs = (repo?: string): string[] =>
  repo === undefined ? [] : ["--repo", repo];

export const resolveGhRepo = async (): Promise<string | undefined> => {
  const result = await execa(
    "gh",
    ["repo", "view", "--json", "nameWithOwner", "-q", ".nameWithOwner"],
    { reject: false },
  );
  const slug = result.stdout.trim();
  return result.exitCode === 0 && slug !== "" ? slug : undefined;
};
