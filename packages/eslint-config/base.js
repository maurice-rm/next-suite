import js from "@eslint/js";
import eslintConfigPrettier from "eslint-config-prettier";
import turboPlugin from "eslint-plugin-turbo";
import { defineConfig } from "eslint/config";
import tseslint from "typescript-eslint";

/**
 * The shared ESLint configuration: type-checked strict and stylistic
 * typescript-eslint rules plus the code rules a tool can enforce (naming,
 * parameter count, nesting, complexity, named constants). A consumer sets
 * `parserOptions.tsconfigRootDir` for its own package.
 *
 * @type {import("eslint").Linter.Config[]}
 */
export const config = defineConfig([
  js.configs.recommended,
  tseslint.configs.strictTypeChecked,
  tseslint.configs.stylisticTypeChecked,
  { languageOptions: { parserOptions: { projectService: true } } },
  {
    plugins: { turbo: turboPlugin },
    rules: { "turbo/no-undeclared-env-vars": "error" },
  },
  {
    rules: {
      "@typescript-eslint/naming-convention": [
        "error",
        { selector: "default", format: ["camelCase"] },
        { selector: "import", format: null },
        {
          selector: "variable",
          format: ["camelCase", "PascalCase", "UPPER_CASE"],
        },
        { selector: "variable", modifiers: ["destructured"], format: null },
        {
          selector: ["variable", "parameter"],
          types: ["boolean"],
          format: ["PascalCase"],
          prefix: ["is", "has", "can", "should", "uses", "was", "will"],
        },
        {
          selector: ["variable", "parameter"],
          modifiers: ["destructured"],
          types: ["boolean"],
          format: null,
        },
        {
          selector: "parameter",
          format: ["camelCase"],
          leadingUnderscore: "allow",
        },
        { selector: "typeLike", format: ["PascalCase"] },
        {
          selector: [
            "objectLiteralProperty",
            "objectLiteralMethod",
            "typeProperty",
          ],
          format: null,
        },
      ],
      "max-params": ["error", 3],
      "max-depth": ["error", 2],
      complexity: ["error", 15],
      "no-magic-numbers": "off",
      "@typescript-eslint/no-magic-numbers": [
        "error",
        {
          ignore: [-1, 0, 1, 2],
          ignoreArrayIndexes: true,
          ignoreDefaultValues: true,
          ignoreEnums: true,
          ignoreNumericLiteralTypes: true,
          ignoreReadonlyClassProperties: true,
          ignoreTypeIndexes: true,
        },
      ],
    },
  },
  {
    files: ["**/*.{js,mjs,cjs}"],
    extends: [tseslint.configs.disableTypeChecked],
    rules: { "@typescript-eslint/naming-convention": "off" },
  },
  eslintConfigPrettier,
  { ignores: ["dist/**"] },
]);
