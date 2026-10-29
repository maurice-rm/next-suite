import { BASE_SETTINGS_SECTION } from '../input/base-settings.ts'
import { InputError } from '../input/input-error.ts'
import {
  DEFAULT_PROJECT_DIRECTORY,
  findProjectNameProblem,
  projectNameOf,
} from '../input/project-name.ts'
import { renderSectionBadge } from '../ui/theme.ts'
import { GO_BACK, text } from '../wizard/prompts.ts'
import type { Streams } from '../wizard/streams.ts'
import { WizardCancelled } from '../wizard/wizard-cancelled.ts'

const PROJECT_NAME_QUESTION = 'What is your project named?'

type DirectoryQuestion = {
  streams: Streams
  isInteractive: boolean
  useDefaults: boolean
}

/** The project directory, and the wizard section whose badge was shown when it was asked. */
type DirectoryAnswer = { directory: string; shownSection: string | undefined }

/**
 * Answers the project directory when none was given: the default with `--yes`, otherwise asked
 * in the terminal at the start of the Project section. Without a terminal it is required.
 */
export const askProjectDirectory = async ({
  streams,
  isInteractive,
  useDefaults,
}: DirectoryQuestion): Promise<DirectoryAnswer> => {
  if (useDefaults) {
    return { directory: DEFAULT_PROJECT_DIRECTORY, shownSection: undefined }
  }
  if (!isInteractive) {
    throw new InputError(
      'name the project directory, such as `create-next-suite my-app`, or pass --yes',
    )
  }
  streams.output.write(renderSectionBadge(BASE_SETTINGS_SECTION))
  const answer = await text({
    ...streams,
    message: PROJECT_NAME_QUESTION,
    canGoBack: false,
    defaultValue: DEFAULT_PROJECT_DIRECTORY,
    validate: (value) => findProjectNameProblem(projectNameOf(value)),
  })
  if (answer === GO_BACK) {
    throw new WizardCancelled()
  }
  return { directory: answer, shownSection: BASE_SETTINGS_SECTION }
}
