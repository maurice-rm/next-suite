import { Command, CommanderError } from 'commander'

import { PromptCancelledError } from '../ui/prompt-cancelled-error.ts'
import { failure } from '../ui/theme.ts'
import { NEXT_SUITE_COMMAND } from './command-name.ts'
import { describeError } from './describe-error.ts'
import { addEjectCommand } from './eject-command.ts'
import { EXIT_CANCELLED, EXIT_FAILURE, EXIT_SUCCESS } from './exit-code.ts'
import { addExplainCommand } from './explain-command.ts'
import type { NextSuiteEnvironment, Report } from './next-suite-environment.ts'
import { addPluginCommand } from './plugin-command.ts'
import { addRegistryCommand } from './registry-command.ts'
import { addTrustCommand } from './trust-command.ts'
import { addUpdateCommand } from './update-command.ts'

const createProgram = (environment: NextSuiteEnvironment, report: Report): Command => {
  const program = new Command()
    .name(NEXT_SUITE_COMMAND)
    .description(
      'Manage plugin registries and trust for create-next-suite, and update, explain or leave a project.',
    )
    .version(environment.cliVersion)
    .exitOverride()
    .configureOutput({
      writeOut: (text) => environment.output.write(text),
      writeErr: (text) => environment.error.write(text),
    })
  addRegistryCommand(program, environment, report)
  addTrustCommand(program, environment, report)
  addPluginCommand(program, environment, report)
  addUpdateCommand(program, environment, report)
  addExplainCommand(program, environment, report)
  addEjectCommand(program, environment, report)
  return program
}

/** Runs `next-suite` and answers its exit code; a failure prints one message. */
export const runNextSuite = async (environment: NextSuiteEnvironment): Promise<number> => {
  const program = createProgram(environment, (text) => environment.output.write(`${text}\n`))
  try {
    await program.parseAsync([...environment.argv], { from: 'user' })
    return EXIT_SUCCESS
  } catch (error) {
    if (error instanceof CommanderError) {
      return error.exitCode
    }
    if (error instanceof PromptCancelledError) {
      environment.error.write(`${failure('Operation cancelled.')}\n`)
      return EXIT_CANCELLED
    }
    environment.error.write(`${failure(describeError(error, NEXT_SUITE_COMMAND))}\n`)
    return EXIT_FAILURE
  }
}
