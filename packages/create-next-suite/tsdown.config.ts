import { defineConfig, type UserConfig } from 'tsdown'

const config: UserConfig = defineConfig({
  entry: ['src/create-next-suite.ts', 'src/next-suite.ts', 'src/plugin.ts', 'src/testing.ts'],
  format: 'esm',
  platform: 'node',
  hash: false,
  treeshake: {
    // zod has no import side effects; without this rule dist/plugin.d.mts keeps a bare
    // `import 'zod'` left over from the schemas next to the public types.
    moduleSideEffects: [{ test: /^zod$/, external: true, sideEffects: false }],
  },
  copy: { from: 'generated/schemas/*.json', to: 'dist/schemas' },
  dts: {
    entry: ['src/plugin.ts', 'src/testing.ts'],
  },
  publint: {
    level: 'error',
  },
  attw: {
    profile: 'esm-only',
    level: 'error',
  },
})

export default config
