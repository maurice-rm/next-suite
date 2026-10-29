import { resolve } from 'node:path'
import type { Writable } from 'node:stream'

import { Command, Option } from 'commander'

import type { TargetAction } from '../answers/target-action.ts'

import { answersFromFlags, type QuestionFlag } from '../questions/flags.ts'
import { InputError } from '../questions/input-error.ts'
import { readAnswerFile } from '../questions/read-answer-file.ts'
import type { AnswerInput } from '../questions/resolve-answers.ts'

type CoreFlags = {
  yes?: boolean
  answers?: string
  dryRun?: boolean
  diff?: boolean
  overwrite?: boolean
  empty?: boolean
  plugin?: string[]
  trust?: string[]
}

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
  new Option('--overwrite', 'write into a folder that has files, keeping the others').conflicts(
    'empty',
  ),
  new Option('--empty', 'empty a folder that has files first, keeping only .git'),
  new Option(
    '--plugin <address>',
    'add a plugin from a folder, npm, GitHub, GitLab, Git or a URL; repeatable',
  ).argParser((address: string, previous: string[] = []) => [...previous, address]),
  new Option(
    '--trust <pattern>',
    'run the code of plugins from matching sources, such as "github:acme/*", for this run; repeatable',
  ).argParser((pattern: string, previous: string[] = []) => [...previous, pattern]),
]
const COMMANDER_OPTIONS = ['help', 'version']

/** The flag names a plugin question may not take. */
export const RESERVED_NAMES: ReadonlySet<string> = new Set([
  ...CORE_OPTIONS.map((option) => option.name()),
  ...COMMANDER_OPTIONS,
])

const PLUGIN_FLAG = '--plugin'

/**
 * The plugin addresses on a command line, read before it is parsed in full, because the plugins
 * decide which other flags exist.
 */
export const readPluginAddresses = (argv: readonly string[]): string[] =>
  argv.flatMap((arg, index) => {
    if (arg === PLUGIN_FLAG) {
      const address = argv[index + 1]
      return address === undefined ? [] : [address]
    }
    return arg.startsWith(`${PLUGIN_FLAG}=`) ? [arg.slice(PLUGIN_FLAG.length + 1)] : []
  })

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

/** What to do with a target folder that has files, as the flags say, if they say anything. */
export const targetActionOf = ({ flags }: Invocation): TargetAction | undefined => {
  if (flags.overwrite === true) {
    return 'overwrite'
  }
  return flags.empty === true ? 'empty' : undefined
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
