import { describe, expect, it } from 'vitest'

import type { ProvenanceLog } from '../project-model/provenance.ts'
import { applyOverrides } from './apply-overrides.ts'

const PROVENANCE: ProvenanceLog = {
  order: [],
  points: {},
  files: {
    'app/page.tsx': [{ plugin: 'base', operation: 'base', kind: 'own' }],
  },
}

describe('applyOverrides', () => {
  it('replaces a generated file by its override and records it', () => {
    const generated = {
      files: new Map([
        ['app/page.tsx', 'generated\n'],
        ['app/layout.tsx', 'layout\n'],
      ]),
      provenance: PROVENANCE,
    }

    const overridden = applyOverrides(
      generated,
      new Map([['next-suite/overrides/app/page.tsx', 'mine\n']]),
    )

    expect(overridden.files).toEqual(
      new Map([
        ['app/page.tsx', 'mine\n'],
        ['app/layout.tsx', 'layout\n'],
      ]),
    )
    expect(overridden.provenance.files['app/page.tsx']).toEqual([
      { plugin: 'base', operation: 'base', kind: 'own' },
      {
        plugin: 'override',
        operation: 'replace with next-suite/overrides/app/page.tsx',
        kind: 'override',
      },
    ])
    expect(generated.files.get('app/page.tsx')).toBe('generated\n')
  })

  it('ignores the project inputs that are no overrides', () => {
    const generated = {
      files: new Map([['app/page.tsx', 'generated\n']]),
      provenance: PROVENANCE,
    }

    expect(
      applyOverrides(generated, new Map([['next-suite/plugins/tweaks/plugin.ts', 'x']])).files,
    ).toEqual(generated.files)
  })

  it('fails for an override of a file the project does not generate', () => {
    const generated = {
      files: new Map([['app/page.tsx', 'generated\n']]),
      provenance: PROVENANCE,
    }

    expect(() =>
      applyOverrides(generated, new Map([['next-suite/overrides/app/pages.tsx', 'mine\n']])),
    ).toThrow(
      'next-suite/overrides/app/pages.tsx replaces app/pages.tsx, which the project does not generate; put a file of your own straight into the project',
    )
  })
})
