import { describe, expect, it } from 'vitest'

import { settingContributions } from './setting-contributions.ts'

describe('settingContributions', () => {
  it('adds the React Compiler plugin and option, and the Cache Components options', () => {
    const manifest = settingContributions({ 'react-compiler': true, 'cache-components': true })

    expect(manifest.devDependencies).toEqual({
      'babel-plugin-react-compiler': 'catalog:babel-plugin-react-compiler',
    })
    expect(manifest.contributes?.nextConfig?.options).toEqual([
      { key: 'reactCompiler', value: 'true' },
      { key: 'cacheComponents', value: 'true' },
      { key: 'partialPrefetching', value: 'true' },
    ])
  })

  it('adds nothing for settings that are off', () => {
    const manifest = settingContributions({ 'react-compiler': false, 'cache-components': false })

    expect(manifest.devDependencies).toEqual({})
    expect(manifest.contributes?.nextConfig?.options).toEqual([])
  })
})
