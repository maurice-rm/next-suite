import * as z from 'zod'

import { conditionSchema } from './condition.ts'
import { scriptName } from './identifiers.ts'

/** A script a plugin runs after the dependencies are installed. */
export const postStepSchema = z.strictObject({
  script: scriptName,
  when: conditionSchema.optional(),
  running: z.string().min(1).optional().meta({
    description: 'What the run shows while the script runs, such as "Fixing files".',
  }),
  done: z.string().min(1).optional().meta({
    description: 'What the run shows when the script succeeded, such as "Fixed files".',
  }),
})

/** A post step whose condition holds, with the messages the run shows filled in. */
export type PostStep = { script: string; running: string; done: string }
