import { resolve } from 'node:path'
import type { Writable } from 'node:stream'

import { Command, Option } from 'commander'

import { answersFromFlags, type QuestionFlag } from '../questions/flags.ts'
import { InputError } from '../questions/input-error.ts'
import { readAnswerFile } from '../questions/read-answer-file.ts'
import type { AnswerInput } from '../questions/resolve-answers.ts'

type CoreFlags = { yes?: boolean; answers?: string; dryRun?: boolean; diff?: boolean }

/** A parsed command line: the directory argument and every flag value. */
export type Invocation = {
  directory: string | undefined
  flags: CoreFlags & Record<string, unknown>
}

/** The answers given before any question is asked, and which of them came from flags. */
export type GivenAnswers = { input: AnswerInput; flagKeys: ReadonlySet<string> }

type CommandLineSource = {
  argv: readonly string[]
  version: string
  output: Writable
  error: Writable
}

/** The options of create-next-suite itself; no plugin flag may take their names. */
const CORE_OPTIONS = [
  new Option('-y, --yes', 'answer every open question with its default'),
  new Option(
    '--answers <file>',
    'read answers from a JSON file in the format of `answers` in next-suite.json',
  ),
  new Option('--dry-run', 'show what would be created, write nothing'),
  new Option('--diff', 'with --dry-run, show the content of every file'),
]
const COMMANDER_OPTIONS = ['help', 'version']

/** The flag names a plugin question may not take. */
export const RESERVED_NAMES: ReadonlySet<string> = new Set([
  ...CORE_OPTIONS.map((option) => option.name()),
  ...COMMANDER_OPTIONS,
])

/**
 * Parses the command line with the core options and the flags of the questions. Commander
 * answers --help and --version itself and throws its `CommanderError` to end the run.
 */
export const parseCommandLine = async (
  { argv, version, output, error }: CommandLineSource,
  questionFlags: readonly QuestionFlag[],
): Promise<Invocation> => {
  let invocation: Invocation | undefined
  const program = new Command()
    .name('create-next-suite')
    .description('Create a Next.js app from plugins.')
    .version(version)
    .argument(
      '[directory]',
      'project name or path, "." for the current directory; the folder name is the package name',
    )
    .exitOverride()
    .configureOutput({
      writeOut: (text) => output.write(text),
      writeErr: (text) => error.write(text),
    })
    .action((directory: string | undefined, flags: Invocation['flags']) => {
      invocation = { directory, flags }
    })
  for (const option of [...CORE_OPTIONS, ...questionFlags.flatMap((flag) => flag.options)]) {
    program.addOption(option)
  }
  await program.parseAsync([...argv], { from: 'user' })
  if (invocation === undefined) {
    throw new InputError('the command line did not run the command')
  }
  return invocation
}

/** Reads the answers of the answer file and the flags; flags win over the file. */
export const readGivenAnswers = async (
  { flags }: Invocation,
  { cwd, questionFlags }: { cwd: string; questionFlags: readonly QuestionFlag[] },
): Promise<GivenAnswers> => {
  const fileInput =
    flags.answers === undefined ? {} : await readAnswerFile(resolve(cwd, flags.answers))
  const flagInput = answersFromFlags(questionFlags, flags)
  return { input: { ...fileInput, ...flagInput }, flagKeys: new Set(Object.keys(flagInput)) }
}
