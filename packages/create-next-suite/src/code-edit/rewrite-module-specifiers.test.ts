import { describe, expect, it } from 'vitest'

import { CodeEditError } from './code-edit-error.ts'
import { rewriteModuleSpecifiers } from './rewrite-module-specifiers.ts'

const source = (...lines: string[]): string => `${lines.join('\n')}\n`

const toTilde = (specifier: string): string =>
  specifier.startsWith('@/') ? `~/${specifier.slice(2)}` : specifier

describe('rewriteModuleSpecifiers', () => {
  it('rewrites the specifiers of imports, re-exports and dynamic imports', () => {
    const text = source(
      'import { env } from "@/env";',
      "import type { Db } from '@/db';",
      'import "@/styles.css";',
      'export { logger } from "@/lib/logger";',
      'export * from "@/lib/auth";',
      'const load = () => import("@/lib/heavy");',
    )

    expect(rewriteModuleSpecifiers('a.ts', text, toTilde)).toBe(
      source(
        'import { env } from "~/env";',
        "import type { Db } from '~/db';",
        'import "~/styles.css";',
        'export { logger } from "~/lib/logger";',
        'export * from "~/lib/auth";',
        'const load = () => import("~/lib/heavy");',
      ),
    )
  })

  it('rewrites the specifiers of type imports and import-require declarations', () => {
    const text = source('type Db = typeof import("@/db");', 'import legacy = require("@/legacy");')

    expect(rewriteModuleSpecifiers('a.ts', text, toTilde)).toBe(
      source('type Db = typeof import("~/db");', 'import legacy = require("~/legacy");'),
    )
  })

  it('leaves strings and comments that only look like specifiers alone', () => {
    const text = source(
      '// import { a } from "@/a";',
      'const path = "@/lib/logger";',
      'export const name = `@/b`;',
    )

    expect(rewriteModuleSpecifiers('a.ts', text, toTilde)).toBe(text)
  })

  it('keeps the offsets right after text outside the ASCII range', () => {
    const text = source('const greeting = "Grüße 👋";', 'import { a } from "@/a";')

    expect(rewriteModuleSpecifiers('a.ts', text, toTilde)).toBe(
      source('const greeting = "Grüße 👋";', 'import { a } from "~/a";'),
    )
  })

  it('reads TSX', () => {
    const text = source(
      'import { Button } from "@/components/button";',
      'export const A = () => <Button />;',
    )

    expect(rewriteModuleSpecifiers('a.tsx', text, toTilde)).toBe(
      source('import { Button } from "~/components/button";', 'export const A = () => <Button />;'),
    )
  })

  it('returns a file without matching specifiers unchanged', () => {
    const text = source('import { a } from "./a";')

    expect(rewriteModuleSpecifiers('a.ts', text, toTilde)).toBe(text)
  })

  it('refuses a file that does not parse and names it', () => {
    expect(() => rewriteModuleSpecifiers('lib/broken.ts', 'import {', toTilde)).toThrow(
      CodeEditError,
    )
  })
})
