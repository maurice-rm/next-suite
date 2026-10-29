import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

import { afterEach, beforeEach, describe, expect, it } from 'vitest'

import { readUserConfig, userConfigPath, writeUserConfig } from './user-config.ts'

let root: string

beforeEach(async () => {
  root = await mkdtemp(join(tmpdir(), 'next-suite-config-'))
})

afterEach(async () => {
  await rm(root, { recursive: true, force: true })
})

describe('the user configuration', () => {
  it('lives in the XDG config folder', () => {
    expect(userConfigPath({ XDG_CONFIG_HOME: '/x' }, '/home/me')).toBe('/x/next-suite/config.json')
    expect(userConfigPath({}, '/home/me')).toBe('/home/me/.config/next-suite/config.json')
  })

  it('is empty when missing, and keeps keys other tools wrote', async () => {
    const path = join(root, 'config.json')
    expect(await readUserConfig(path)).toEqual({ trust: [], registries: {} })

    await writeFile(path, JSON.stringify({ host: 'server.example' }))
    const config = await readUserConfig(path)
    config.trust.push('github:acme/*')
    await writeUserConfig(path, config)

    expect(JSON.parse(await readFile(path, 'utf8'))).toEqual({
      host: 'server.example',
      trust: ['github:acme/*'],
      registries: {},
    })
  })
})
