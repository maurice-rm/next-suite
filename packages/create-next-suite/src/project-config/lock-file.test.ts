import { describe, expect, it } from 'vitest'

import { hashFileContent, type LockFile, parseLockFile, renderLockFile } from './lock-file.ts'

const LOCK: LockFile = {
  generator: { name: 'create-next-suite', version: '2.0.0' },
  project: {
    name: 'my-app',
    srcDir: false,
    importAlias: '@/*',
    reactCompiler: false,
    cacheComponents: true,
  },
  plugins: [
    { name: 'pnpm', source: 'builtin', version: '2.0.0' },
    {
      name: 'mail',
      source: 'github:acme/plugins/mail#v1',
      resolved: '0123abc',
      contentHash: `sha256-${'a'.repeat(64)}`,
    },
    {
      name: 'tweaks',
      source: './next-suite/plugins/tweaks',
      contentHash: `sha256-${'b'.repeat(64)}`,
    },
    { name: 'site-url', source: 'inline' },
  ],
  disable: [],
  answers: { pino: { level: 'info' } },
  files: {
    'app/page.tsx': hashFileContent('export default function Page() {}\n'),
  },
  provenance: {
    order: ['pnpm'],
    points: {},
    files: {
      'app/page.tsx': [{ plugin: 'base', operation: 'base', kind: 'own' }],
    },
  },
}

describe('the lock file', () => {
  it('reads back what it writes', () => {
    expect(parseLockFile(renderLockFile(LOCK), '.next-suite/lock.json')).toEqual(LOCK)
  })

  it('hashes a file the way trust hashes plugins: sha256 and the hex digest', () => {
    expect(hashFileContent('')).toBe(
      'sha256-e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855',
    )
  })

  it('hashes a file the same with CRLF line endings, as Git on Windows checks it out', () => {
    expect(hashFileContent('a\r\nb\r\n')).toBe(hashFileContent('a\nb\n'))
  })

  it('fails with the path for a lock that is no lock', () => {
    expect(() => parseLockFile('{"generator": 1}', '/p/.next-suite/lock.json')).toThrow(
      /^\/p\/\.next-suite\/lock\.json /,
    )
    expect(() => parseLockFile('not json', '/p/.next-suite/lock.json')).toThrow(
      /^\/p\/\.next-suite\/lock\.json /,
    )
  })
})
