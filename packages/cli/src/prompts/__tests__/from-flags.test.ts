import { beforeEach, expect, test, vi } from "vitest";

import { hasConflictingFiles } from "@/core/fs-checks";
import { detectPackageManager } from "@/core/pm-detector";
import { validateProjectInput } from "@/core/validation";

import { configFromFlags } from "../from-flags";

vi.mock("@/core/fs-checks");
vi.mock("@/core/pm-detector");
vi.mock("@/core/validation");

beforeEach(() => {
  vi.clearAllMocks();
  vi.mocked(validateProjectInput).mockReturnValue(undefined);
  vi.mocked(hasConflictingFiles).mockResolvedValue(false);
  vi.mocked(detectPackageManager).mockReturnValue(undefined);
});

test("minimal flags fill every dimension with its default", async () => {
  const config = await configFromFlags({ name: "acme-app" });
  expect(config.projectName).toBe("acme-app");
  expect(config.componentLibrary).toBe("none");
  expect(config.tailwind).toBe(false);
  expect(config.shadcn).toBeUndefined();
  expect(config.database).toBeUndefined();
  expect(config.api).toBeUndefined();
  expect(config.auth).toBe("none");
  expect(config.email).toBe("none");
  expect(config.git).toBe(true);
  expect(config.install).toBe(true);
  expect(config.packageManager).toBe("npm");
  expect(config.action).toBe("create");
});

test("packageManager: --pm wins, detector is the default", async () => {
  expect(
    (await configFromFlags({ name: "x", pm: "pnpm" })).packageManager,
  ).toBe("pnpm");
  vi.mocked(detectPackageManager).mockReturnValue("bun");
  expect((await configFromFlags({ name: "x" })).packageManager).toBe("bun");
});

test("--pm rejects an unknown manager", async () => {
  await expect(configFromFlags({ name: "x", pm: "deno" })).rejects.toThrow(
    /Unknown package manager/,
  );
});

test("--shadcn forces tailwind and fills shadcn defaults", async () => {
  const config = await configFromFlags({ name: "x", shadcn: true });
  expect(config.componentLibrary).toBe("shadcn");
  expect(config.tailwind).toBe(true);
  expect(config.shadcn).toEqual({
    base: "base",
    pointer: false,
    preset: undefined,
  });
});

test("--shadcn honors base / preset / pointer", async () => {
  const config = await configFromFlags({
    name: "x",
    shadcn: true,
    shadcnBase: "base",
    shadcnPreset: "b27Gc",
    shadcnPointer: true,
  });
  expect(config.shadcn).toEqual({
    base: "base",
    pointer: true,
    preset: "b27Gc",
  });
});

test("--shadcn-base rejects an unknown base", async () => {
  await expect(
    configFromFlags({ name: "x", shadcn: true, shadcnBase: "bootstrap" }),
  ).rejects.toThrow(/Unknown shadcn base/);
});

test("--tailwind, --no-git, --no-install are honored", async () => {
  const config = await configFromFlags({
    name: "x",
    tailwind: true,
    git: false,
    install: false,
  });
  expect(config.tailwind).toBe(true);
  expect(config.git).toBe(false);
  expect(config.install).toBe(false);
});

test("a missing name is rejected", async () => {
  await expect(configFromFlags({})).rejects.toThrow(/name is required/i);
});

test("an invalid name surfaces the validator's own message", async () => {
  vi.mocked(validateProjectInput).mockReturnValue(
    "A file already exists at that path — choose another name.",
  );
  await expect(configFromFlags({ name: "x" })).rejects.toThrow(
    /already exists/,
  );
});

test("a conflict requires --overwrite or --empty", async () => {
  vi.mocked(hasConflictingFiles).mockResolvedValue(true);
  await expect(configFromFlags({ name: "x" })).rejects.toThrow(
    /--overwrite or --empty/,
  );
  expect((await configFromFlags({ name: "x", overwrite: true })).action).toBe(
    "overwrite",
  );
  expect((await configFromFlags({ name: "x", empty: true })).action).toBe(
    "empty",
  );
});

test("--overwrite and --empty together are rejected", async () => {
  await expect(
    configFromFlags({ name: "x", overwrite: true, empty: true }),
  ).rejects.toThrow(/mutually exclusive/);
});

test("shadcn sub-flags without --shadcn are rejected", async () => {
  await expect(
    configFromFlags({ name: "x", shadcnBase: "base" }),
  ).rejects.toThrow(/require --shadcn/);
});

test("--database and --orm set the database config", async () => {
  const config = await configFromFlags({
    name: "x",
    database: "postgres",
    orm: "drizzle",
  });
  expect(config.database).toEqual({ engine: "postgres", orm: "drizzle" });
});

test("--database and --orm must be passed together", async () => {
  await expect(
    configFromFlags({ name: "x", database: "postgres" }),
  ).rejects.toThrow(/passed together/);
  await expect(configFromFlags({ name: "x", orm: "prisma" })).rejects.toThrow(
    /passed together/,
  );
});

test("--database/--orm reject unknown values", async () => {
  await expect(
    configFromFlags({ name: "x", database: "sqlite", orm: "drizzle" }),
  ).rejects.toThrow(/Unknown database/);
  await expect(
    configFromFlags({ name: "x", database: "none", orm: "drizzle" }),
  ).rejects.toThrow(/Unknown database/);
  await expect(
    configFromFlags({ name: "x", database: "mysql", orm: "typeorm" }),
  ).rejects.toThrow(/Unknown ORM/);
});

test("--api sets the api type", async () => {
  expect((await configFromFlags({ name: "x", api: "trpc" })).api).toEqual({
    type: "trpc",
  });
  expect((await configFromFlags({ name: "x", api: "orpc" })).api).toEqual({
    type: "orpc",
  });
});

test("--api rejects unknown values and the literal none", async () => {
  await expect(configFromFlags({ name: "x", api: "graphql" })).rejects.toThrow(
    /Unknown api/,
  );
  await expect(configFromFlags({ name: "x", api: "none" })).rejects.toThrow(
    /Unknown api/,
  );
});

test("--openapi requires --api orpc", async () => {
  await expect(configFromFlags({ name: "x", openapi: true })).rejects.toThrow(
    "--openapi requires --api orpc",
  );
});

test("--scalar requires --openapi", async () => {
  await expect(
    configFromFlags({ name: "x", api: "orpc", scalar: true }),
  ).rejects.toThrow("--scalar requires --openapi");
});

test("--openapi --scalar nests under the orpc api config", async () => {
  expect(
    (
      await configFromFlags({
        name: "x",
        api: "orpc",
        openapi: true,
        scalar: true,
      })
    ).api,
  ).toEqual({ type: "orpc", openapi: { scalar: true } });
});

test("--auth sets better-auth when a database is present", async () => {
  const config = await configFromFlags({
    name: "x",
    database: "postgres",
    orm: "drizzle",
    auth: "better-auth",
  });
  expect(config.auth).toBe("better-auth");
});

test("--auth without --database is rejected", async () => {
  await expect(
    configFromFlags({ name: "x", auth: "better-auth" }),
  ).rejects.toThrow(/requires --database/);
});

test("--auth rejects unknown values and the literal none", async () => {
  await expect(
    configFromFlags({
      name: "x",
      database: "postgres",
      orm: "drizzle",
      auth: "clerk",
    }),
  ).rejects.toThrow(/Unknown auth/);
  await expect(
    configFromFlags({
      name: "x",
      database: "postgres",
      orm: "drizzle",
      auth: "none",
    }),
  ).rejects.toThrow(/Unknown auth/);
});

test("--email sets the provider", async () => {
  expect((await configFromFlags({ name: "x", email: "resend" })).email).toBe(
    "resend",
  );
});

test("--email rejects unknown values and the literal none", async () => {
  await expect(
    configFromFlags({ name: "x", email: "sendgrid" }),
  ).rejects.toThrow(/Unknown email/);
  await expect(configFromFlags({ name: "x", email: "none" })).rejects.toThrow(
    /Unknown email/,
  );
});

test("--deployment sets the production mode", async () => {
  expect(
    (await configFromFlags({ name: "x", deployment: "standalone" })).production,
  ).toEqual({ mode: "standalone" });
});

test("--deployment rejects unknown values and the literal none", async () => {
  await expect(
    configFromFlags({ name: "x", deployment: "swarm" }),
  ).rejects.toThrow(/Unknown deployment/);
  await expect(
    configFromFlags({ name: "x", deployment: "none" }),
  ).rejects.toThrow(/Unknown deployment/);
});

test("--github-actions CI steps work without deployment", async () => {
  expect(
    (
      await configFromFlags({
        name: "x",
        githubActions: "lint,typecheck,build",
      })
    ).githubActions,
  ).toEqual(["lint", "typecheck", "build"]);
});

test("--github-actions image/deploy require --deployment", async () => {
  await expect(
    configFromFlags({ name: "x", githubActions: "image" }),
  ).rejects.toThrow(/image\/deploy requires --deployment/);
  await expect(
    configFromFlags({ name: "x", githubActions: "deploy" }),
  ).rejects.toThrow(/image\/deploy requires --deployment/);
});

test("--github-actions rejects unknown values", async () => {
  await expect(
    configFromFlags({ name: "x", githubActions: "jenkins" }),
  ).rejects.toThrow(/Unknown github-actions/);
});
