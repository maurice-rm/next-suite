import type { ProjectConfig } from "@/core/types";

/**
 * Whether the project tests against an in-process PGlite database. PGlite
 * speaks Postgres only, and Drizzle is the ORM with a PGlite driver.
 */
export const usesTestDatabase = (config: ProjectConfig): boolean =>
  config.database?.engine === "postgres" && config.database.orm === "drizzle";
