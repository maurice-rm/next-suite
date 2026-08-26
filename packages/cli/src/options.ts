/**
 * The selectable options for each project-config dimension — the single source
 * of truth for their values, labels, hints, and display order. A leaf module
 * (it imports nothing from the layers): `core/types` derives the union types
 * from these arrays, and the prompts render them.
 */

interface Option {
  value: string;
  label: string;
  hint?: string;
}

/**
 * Define a dimension's options. The `const` type parameter preserves the literal
 * values (so `core/types` can derive the unions) and checks each entry against
 * `Option` — without an `as const satisfies` at every call site.
 */
const defineOptions = <const T extends readonly Option[]>(list: T): T => list;

export const COMPONENT_LIBRARIES = defineOptions([
  { value: "shadcn", label: "shadcn/ui", hint: "recommended" },
  { value: "none", label: "None", hint: "bring your own styling" },
]);

export const SHADCN_BASES = defineOptions([
  { value: "base", label: "Base UI", hint: "default" },
  { value: "radix", label: "Radix UI" },
]);

export const DATABASES = defineOptions([
  { value: "postgres", label: "PostgreSQL" },
  { value: "mysql", label: "MySQL" },
  { value: "none", label: "None" },
]);

export const ORMS = defineOptions([
  { value: "drizzle", label: "Drizzle" },
  { value: "prisma", label: "Prisma" },
]);

export const API_TYPES = defineOptions([
  { value: "trpc", label: "tRPC" },
  { value: "orpc", label: "oRPC" },
  { value: "none", label: "None" },
]);

export const AUTH_PROVIDERS = defineOptions([
  { value: "better-auth", label: "Better-Auth" },
  { value: "none", label: "None" },
]);

export const EMAIL_PROVIDERS = defineOptions([
  { value: "resend", label: "Resend" },
  { value: "none", label: "None" },
]);

export const NGINX_MODES = defineOptions([
  {
    value: "standalone",
    label: "nginx",
    hint: "this container terminates TLS",
  },
  {
    value: "proxied",
    label: "an upstream reverse proxy",
    hint: "nginx serves HTTP",
  },
]);

export const GITHUB_ACTIONS_CI_STEPS = defineOptions([
  { value: "lint", label: "Lint", hint: "eslint" },
  { value: "typecheck", label: "Type-check", hint: "tsc" },
  { value: "format", label: "Format check", hint: "prettier" },
  { value: "build", label: "Build", hint: "next build" },
]);

export const GITHUB_ACTIONS_CD_STEPS = defineOptions([
  { value: "image", label: "Build & push image", hint: "ghcr" },
  { value: "deploy", label: "Deploy", hint: "includes build & push" },
]);

/** A CD step (image/deploy) as opposed to a CI step (lint/typecheck/…). */
export const isCdStep = (step: string): boolean =>
  GITHUB_ACTIONS_CD_STEPS.some((cd) => cd.value === step);

export const GITHUB_ACTIONS_STEP_ORDER = [
  ...GITHUB_ACTIONS_CI_STEPS,
  ...GITHUB_ACTIONS_CD_STEPS,
].map((step) => step.value);
