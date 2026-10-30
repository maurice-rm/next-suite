import { describe, expect, it } from 'vitest'

import { openTypescriptModule } from '../code-edit/typescript-module.ts'
import { createNextConfig } from './next-config.ts'

const source = (...lines: string[]): string => `${lines.join('\n')}\n`

const BASE = source(
  'import type { NextConfig } from "next";',
  '',
  'const nextConfig: NextConfig = {};',
  '',
  'export default nextConfig;',
)

describe('createNextConfig', () => {
  it('sets options of the exported config, imports and wraps it', () => {
    const module = openTypescriptModule('next.config.ts', BASE)
    const nextConfig = createNextConfig(module)
    nextConfig.addImport({ from: '@next/mdx', defaultName: 'createMDX' })
    nextConfig.setOption('reactCompiler', 'true')
    nextConfig.wrap('withMDX')

    expect(module.print()).toBe(
      source(
        'import type { NextConfig } from "next";',
        'import createMDX from "@next/mdx";',
        '',
        'const nextConfig: NextConfig = {',
        '  reactCompiler: true,',
        '};',
        '',
        'export default withMDX(nextConfig);',
      ),
    )
  })
})
