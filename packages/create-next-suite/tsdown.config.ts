import { defineConfig, type UserConfig } from 'tsdown'

const config: UserConfig = defineConfig({
  entry: [
    'src/create-next-suite.ts',
    'src/next-suite.ts',
    'src/config.ts',
    'src/plugin.ts',
    'src/points.ts',
    'src/testing.ts',
  ],
  format: 'esm',
  platform: 'node',
  hash: false,
  treeshake: {
    // External modules count as side-effectful, so dist/plugin.d.mts would keep a bare
    // `import 'zod'`: https://rolldown.rs/in-depth/external-modules
    moduleSideEffects: 'no-external',
  },
  copy: { from: 'generated/schemas/*.json', to: 'dist/schemas' },
  dts: {
    entry: ['src/config.ts', 'src/plugin.ts', 'src/points.ts', 'src/testing.ts'],
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
