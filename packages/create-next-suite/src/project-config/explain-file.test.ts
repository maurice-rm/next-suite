import { describe, expect, it } from 'vitest'

import { explainFile } from './explain-file.ts'
import { hashFileContent, type LockFile } from './lock-file.ts'

const LAYOUT = 'export default function RootLayout() {}\n'

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
    {
      name: 'tweaks',
      source: './next-suite/plugins/tweaks',
      contentHash: `sha256-${'a'.repeat(64)}`,
    },
  ],
  disable: [],
  answers: {},
  files: { 'app/layout.tsx': hashFileContent(LAYOUT), 'instrumentation.ts': hashFileContent('') },
  provenance: {
    order: ['seo', 'tweaks'],
    points: {},
    files: {
      'app/layout.tsx': [
        { plugin: 'base', operation: 'base', kind: 'own' },
        { plugin: 'seo', operation: 'layout.metadata metadataBase', kind: 'extend' },
        { plugin: 'tweaks', operation: 'edit', kind: 'direct' },
        {
          plugin: 'override',
          operation: 'replace with next-suite/overrides/app/layout.tsx',
          kind: 'override',
        },
      ],
      'instrumentation.ts': [
        {
          plugin: 'pino',
          operation: 'instrumentation.onRequestError @/lib/logger',
          kind: 'extend',
        },
      ],
    },
  },
}

describe('explainFile', () => {
  it('lists every operation on a file in order, and says it is unchanged', () => {
    expect(explainFile({ lock: LOCK, path: 'app/layout.tsx', content: LAYOUT })).toEqual([
      'app/layout.tsx: written by base, unchanged since it was generated',
      '  1. base      base                                              own',
      '  2. seo       layout.metadata metadataBase                      extend',
      '  3. tweaks    edit                                              direct (./next-suite/plugins/tweaks); may break when base changes',
      '  4. override  replace with next-suite/overrides/app/layout.tsx  override',
    ])
  })

  it('says when a file was changed or deleted since it was generated', () => {
    expect(explainFile({ lock: LOCK, path: 'app/layout.tsx', content: 'mine\n' })[0]).toBe(
      'app/layout.tsx: written by base, changed since it was generated',
    )
    expect(explainFile({ lock: LOCK, path: 'app/layout.tsx', content: undefined })[0]).toBe(
      'app/layout.tsx: written by base, deleted since it was generated',
    )
  })

  it('names the core as the writer of a file no plugin owns', () => {
    expect(explainFile({ lock: LOCK, path: 'instrumentation.ts', content: '' })[0]).toBe(
      'instrumentation.ts: written by the core, unchanged since it was generated',
    )
  })

  it('says a file next-suite did not write is the project’s own', () => {
    expect(explainFile({ lock: LOCK, path: 'lib/mine.ts', content: 'x' })).toEqual([
      'next-suite did not write lib/mine.ts; it is entirely yours',
    ])
  })
})
