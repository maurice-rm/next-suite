import type { ProjectConfig } from "@/core/types";

const buildDatabaseSteps = (config: ProjectConfig): string[] => {
  const run = `${config.packageManager} run`;
  if (config.database?.orm === "drizzle") {
    return [`${run} db:generate`, `${run} db:migrate`];
  }
  return [`${run} db:push`];
};

/**
 * The commands to suggest after scaffolding: enter the project, optionally
 * start the database container, install dependencies (unless they were
 * installed already), bring the database schema up to date (migrations for
 * Drizzle, a schema push for Prisma), and start the dev server.
 *
 * @param config - The resolved project configuration.
 * @returns The ordered list of shell commands to print.
 */
export const nextSteps = (config: ProjectConfig): string[] => {
  const steps = [`cd ${config.projectName}`];
  if (config.database) steps.push("docker compose up -d");
  if (!config.install) steps.push(`${config.packageManager} install`);
  if (config.database) steps.push(...buildDatabaseSteps(config));
  steps.push(`${config.packageManager} run dev`);
  return steps;
};
