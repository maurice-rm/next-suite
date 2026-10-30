import * as z from 'zod'

import { type Condition, conditionSchema } from './condition.ts'
import { scriptName } from './identifiers.ts'

/** A script a plugin runs after the dependencies are installed, such as a format run. */
export type PostStep = {
  /** The script of package.json to run, such as `format`. */
  script: string
  /** Runs the script only when this condition holds. */
  when?: Condition | undefined
  /** What the run shows while the script runs, such as "Fixing files"; `Running <script>` by default. */
  running?: string | undefined
  /** What the run shows when the script succeeded, such as "Fixed files"; `Ran <script>` by default. */
  done?: string | undefined
}

/** A post step whose condition holds, with the messages the run shows filled in. */
export type ResolvedPostStep = { script: string; running: string; done: string }

export const postStepSchema = z
  .strictObject({
    script: scriptName.meta({
      description: 'The script of package.json to run, such as `format`.',
    }),
    when: conditionSchema
      .optional()
      .meta({ description: 'Runs the script only when this condition holds.' }),
    running: z.string().min(1).optional().meta({
      description:
        'What the run shows while the script runs, such as "Fixing files"; `Running <script>` by default.',
    }),
    done: z.string().min(1).optional().meta({
      description:
        'What the run shows when the script succeeded, such as "Fixed files"; `Ran <script>` by default.',
    }),
  })
  .meta({
    id: 'PostStep',
    description:
      'A script a plugin runs after the dependencies are installed, such as a format run.',
  })
