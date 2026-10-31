import type { CommandResult, CommandRunner } from '../post-steps/run-command.ts'
import { CLI_PACKAGE } from '../project-config/project-paths.ts'

/** Generating a project from a config with a given published version of create-next-suite. */
type GeneratorRequest = {
  /** An exact version, such as `2.0.0`. */
  version: string
  configPath: string
  /** A directory to run in, outside any project, so no project's own setup takes part. */
  workDirectory: string
  /** The name of the directory inside `workDirectory` the project goes into. */
  targetName: string
}

/** Runs a published version of create-next-suite; answers how it ended. */
export type PublishedGeneratorRunner = (request: GeneratorRequest) => Promise<CommandResult>

/**
 * A runner that starts a published version of create-next-suite through npm, which comes with
 * Node.js: from npm's cache when it has the version, from the registry otherwise. The project is
 * created from the config without git, install or any question.
 */
export const createPublishedGeneratorRunner =
  (runCommand: CommandRunner): PublishedGeneratorRunner =>
  ({ version, configPath, targetName, workDirectory }) =>
    runCommand(
      'npm',
      [
        'exec',
        '--yes',
        '--prefer-offline',
        `--package=${CLI_PACKAGE}@${version}`,
        '--',
        CLI_PACKAGE,
        targetName,
        '--config',
        configPath,
        '--yes',
        '--no-git',
        '--no-install',
      ],
      workDirectory,
    )
