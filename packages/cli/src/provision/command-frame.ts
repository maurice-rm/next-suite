import * as p from "@clack/prompts";

import { classifyVersion } from "@/core/version-check";
import { fetchLatestVersion } from "@/latest-version";
import { renderTitle } from "@/ui";

import pkg from "../../package.json";
import { CancelledError } from "./cancelled-error";

export const renderCommandIntro = async (title: string): Promise<void> => {
  const latest = await fetchLatestVersion(pkg.name);
  renderTitle(pkg.version, classifyVersion(pkg.version, latest));
  p.intro(title);
};

export const exitWithCommandError = (error: unknown): never => {
  if (error instanceof CancelledError) {
    p.cancel("Nothing changed.");
    process.exit(0);
  }
  p.cancel(error instanceof Error ? error.message : String(error));
  process.exit(1);
};
