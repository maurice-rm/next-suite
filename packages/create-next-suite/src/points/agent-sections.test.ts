import { describe, expect, it } from 'vitest'

import { createAgentSections } from './agent-sections.ts'

describe('createAgentSections', () => {
  it('keeps every section in the order it was added', () => {
    const agents = createAgentSections()
    agents.addSection('Database', 'Change the schema, then run `db:generate`.')
    agents.addSection('Docker', 'Run `docker compose up --build`.')

    expect(agents.sections()).toEqual([
      { title: 'Database', text: 'Change the schema, then run `db:generate`.' },
      { title: 'Docker', text: 'Run `docker compose up --build`.' },
    ])
  })
})
