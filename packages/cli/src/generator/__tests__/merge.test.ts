import { expect, test } from "vitest";

import {
  isMergeable,
  mergeEnv,
  mergePackageJson,
  mergePrettierConfig,
} from "../merge";

test("isMergeable flags files merged across layers", () => {
  expect(isMergeable("package.json")).toBe(true);
  expect(isMergeable(".env.example")).toBe(true);
  expect(isMergeable(".prettierrc.json")).toBe(true);
  expect(isMergeable("page.tsx")).toBe(false);
});

test("mergePrettierConfig concatenates plugins in layer order, keeps scalars", () => {
  const base = JSON.stringify({
    semi: true,
    printWidth: 80,
    plugins: ["prettier-plugin-packagejson"],
  });
  const feature = JSON.stringify({ plugins: ["prettier-plugin-tailwindcss"] });
  const cfg = JSON.parse(mergePrettierConfig([base, feature]));
  expect(cfg.semi).toBe(true);
  expect(cfg.printWidth).toBe(80);
  expect(cfg.plugins).toEqual([
    "prettier-plugin-packagejson",
    "prettier-plugin-tailwindcss",
  ]);
});

test("mergePrettierConfig dedupes plugins last-seen-wins; last scalar wins", () => {
  const base = JSON.stringify({ printWidth: 80, plugins: ["a", "b"] });
  const feature = JSON.stringify({ printWidth: 100, plugins: ["a"] });
  const cfg = JSON.parse(mergePrettierConfig([base, feature]));
  expect(cfg.printWidth).toBe(100);
  expect(cfg.plugins).toEqual(["b", "a"]);
});

test("mergePrettierConfig omits plugins when no fragment declares any", () => {
  const cfg = JSON.parse(mergePrettierConfig([JSON.stringify({ semi: true })]));
  expect(cfg.semi).toBe(true);
  expect(cfg.plugins).toBeUndefined();
});

test("mergePrettierConfig treats an empty plugins array as none", () => {
  const cfg = JSON.parse(
    mergePrettierConfig([JSON.stringify({ plugins: [] })]),
  );
  expect(cfg.plugins).toBeUndefined();
});

test("mergePrettierConfig throws on invalid JSON", () => {
  expect(() => mergePrettierConfig(["{ not json"])).toThrow(
    /Invalid \.prettierrc\.json fragment/,
  );
});

test("mergePackageJson unions + sorts deps; last scalar wins, absent scalars kept", () => {
  const base = JSON.stringify({
    name: "app",
    version: "0.1.0",
    dependencies: { next: "^15", react: "^19" },
  });
  const feature = JSON.stringify({
    version: "0.2.0",
    dependencies: { "better-auth": "^1" },
  });
  const pkg = JSON.parse(mergePackageJson([base, feature]));
  expect(pkg.name).toBe("app");
  expect(pkg.version).toBe("0.2.0");
  expect(Object.keys(pkg.dependencies)).toEqual([
    "better-auth",
    "next",
    "react",
  ]);
});

test("mergePackageJson throws on invalid JSON", () => {
  expect(() => mergePackageJson(["{ not json"])).toThrow(
    /Invalid package\.json fragment/,
  );
});

test("mergeEnv dedupes keys with last-wins", () => {
  expect(mergeEnv(["A=1\nB=2", "B=3"])).toBe("A=1\nB=3\n");
});

test("mergePackageJson unions devDependencies and scripts too", () => {
  const base = JSON.stringify({
    devDependencies: { typescript: "^5" },
    scripts: { build: "next build" },
  });
  const feature = JSON.stringify({
    devDependencies: { drizzle: "^0.3" },
    scripts: { "db:push": "drizzle-kit push" },
  });
  const pkg = JSON.parse(mergePackageJson([base, feature]));
  expect(Object.keys(pkg.devDependencies)).toEqual(["drizzle", "typescript"]);
  expect(Object.keys(pkg.scripts)).toEqual(["build", "db:push"]);
});

test("mergeEnv keeps block comments and joins blocks with one blank line", () => {
  expect(mergeEnv(["# Database\nA=1\nnonsense", "# Auth\nB=2"])).toBe(
    "# Database\nA=1\n\n# Auth\nB=2\n",
  );
});

test("mergeEnv drops a block whose keys were all emitted earlier", () => {
  expect(mergeEnv(["# App\nURL=x", "# Auth\nSECRET=s\n\n# App\nURL=x"])).toBe(
    "# App\nURL=x\n\n# Auth\nSECRET=s\n",
  );
});

test("mergeEnv trims around key and value, so 'A = 1' dedupes with 'A=1'", () => {
  expect(mergeEnv(["A = 1", "A=2"])).toBe("A=2\n");
  expect(mergeEnv(["  KEY  =  value  "])).toBe("KEY=value\n");
});

test("mergeEnv keeps '=' inside a value (splits on the first one only)", () => {
  expect(mergeEnv(["URL=postgres://u:p@h/db?x=1"])).toBe(
    "URL=postgres://u:p@h/db?x=1\n",
  );
});
