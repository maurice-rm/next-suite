import type { ProjectConfig } from "@/core/types";

/**
 * The commands to suggest after scaffolding: enter the project, optionally
 * start the database container, install dependencies (unless they were
 * installed already), run database migrations (if a database was selected),
 * and start the dev server.
 *
 * @param config - The resolved project configuration.
 * @returns The ordered list of shell commands to print.
 */
export const nextSteps = (config: ProjectConfig): string[] => {
  const steps = [`cd ${config.projectName}`];
  if (config.database) steps.push("docker compose up -d");
  if (!config.install) steps.push(`${config.packageManager} install`);
  if (config.database) steps.push(`${config.packageManager} run db:push`);
  steps.push(`${config.packageManager} run dev`);
  return steps;
};
