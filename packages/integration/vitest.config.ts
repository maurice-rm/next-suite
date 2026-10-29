import { defineConfig, type ViteUserConfig } from 'vitest/config'

const config: ViteUserConfig = defineConfig({
  test: {
    include: ['src/**/*.test.ts'],
  },
})

export default config
