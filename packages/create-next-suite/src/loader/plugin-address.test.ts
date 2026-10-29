import { describe, expect, it } from 'vitest'

import { parsePluginAddress } from './plugin-address.ts'

describe('parsePluginAddress', () => {
  it('parses every form of address', () => {
    expect(parsePluginAddress('./plugins/mail')).toEqual({ kind: 'local', path: './plugins/mail' })
    expect(parsePluginAddress('/abs/mail')).toEqual({ kind: 'local', path: '/abs/mail' })
    expect(parsePluginAddress('npm:next-suite-plugin-postmark@^1')).toEqual({
      kind: 'npm',
      name: 'next-suite-plugin-postmark',
      range: '^1',
    })
    expect(parsePluginAddress('npm:@acme/mail')).toEqual({
      kind: 'npm',
      name: '@acme/mail',
      range: 'latest',
    })
    expect(parsePluginAddress('github:acme/plugins/mail#v2')).toEqual({
      kind: 'github',
      owner: 'acme',
      repo: 'plugins',
      path: 'mail',
      ref: 'v2',
    })
    expect(parsePluginAddress('gitlab:group/repo')).toEqual({
      kind: 'gitlab',
      owner: 'group',
      repo: 'repo',
      path: '',
      ref: undefined,
    })
    expect(parsePluginAddress('git+https://host/repo.git#main')).toEqual({
      kind: 'git',
      url: 'https://host/repo.git',
      ref: 'main',
    })
    expect(parsePluginAddress('https://host/plugin.tgz')).toEqual({
      kind: 'url',
      url: 'https://host/plugin.tgz',
    })
    expect(parsePluginAddress('@acme/auth')).toEqual({
      kind: 'registry',
      registry: '@acme',
      name: 'auth',
    })
  })

  it('answers nothing for an address of no known form', () => {
    expect(parsePluginAddress('mail')).toBeUndefined()
    expect(parsePluginAddress('ftp://host/x')).toBeUndefined()
    expect(parsePluginAddress('github:acme/plugins/../../evil')).toBeUndefined()
    expect(parsePluginAddress('github:../plugins')).toBeUndefined()
    expect(parsePluginAddress('https://*.evil.example/p.tgz')).toBeUndefined()
  })
})
