import { defineConfig, type UserConfig } from 'tsdown'

const config: UserConfig = defineConfig({
  entry: ['src/create-next-suite.ts', 'src/next-suite.ts', 'src/plugin.ts'],
  format: 'esm',
  platform: 'node',
  hash: false,
  dts: {
    entry: 'src/plugin.ts',
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
