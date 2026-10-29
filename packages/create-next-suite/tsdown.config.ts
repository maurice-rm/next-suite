import { defineConfig, type UserConfig } from 'tsdown'

const config: UserConfig = defineConfig({
  entry: ['src/create-next-suite.ts', 'src/next-suite.ts', 'src/plugin.ts', 'src/testing.ts'],
  format: 'esm',
  platform: 'node',
  hash: false,
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
