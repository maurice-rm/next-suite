import { removeFromList } from '../code-edit/bracketed-list.ts'
import { CodeEditError } from '../code-edit/code-edit-error.ts'
import { type CodeStyle, detectCodeStyle, renderString } from '../code-edit/code-style.ts'
import { findDefaultExport, findObjectBehind } from '../code-edit/find-object.ts'
import { findProperty } from '../code-edit/find-property.ts'
import { renderPropertyName } from '../code-edit/property-name.ts'
import { openSourceDocument, type SourceDocument } from '../code-edit/source-document.ts'
import { createTypescriptModule } from '../code-edit/typescript-module.ts'
import type { Answer } from '../plugin-definition/plugin-option.ts'
import { ProjectConfigError } from './project-config-error.ts'
import { PROJECT_PATHS } from './project-paths.ts'

const PLUGINS = 'plugins'
const DISABLE = 'disable'
const ANSWERS = 'answers'
const DEFAULT_EXPORT = 'the default export'

/** A plugin to add to a config: the entry `plugins` names it by, its name and its answers. */
export type AddedPlugin = {
  /** The built-in name, path or address, as `plugins` takes it. */
  entry: string
  /** The plugin's name, which `disable` and `answers` use. */
  name: string
  answers: Readonly<Record<string, Answer>>
}

/** The string literal in both kinds of quotes, as a list may hold it. */
const quotedForms = (value: string): string[] => [
  renderString(value, { quote: '"', semicolon: '' }),
  renderString(value, { quote: "'", semicolon: '' }),
]

const renderAnswer = (answer: Answer, style: CodeStyle): string =>
  typeof answer === 'boolean'
    ? String(answer)
    : typeof answer === 'string'
      ? renderString(answer, style)
      : `[${answer.map((item) => renderString(item, style)).join(', ')}]`

/** `{ provider: 'smtp', tracking: false }`, in the file's quotes. */
const renderAnswers = (answers: AddedPlugin['answers'], style: CodeStyle): string =>
  `{ ${Object.entries(answers)
    .map(
      ([option, answer]) => `${renderPropertyName(option, style)}: ${renderAnswer(answer, style)}`,
    )
    .join(', ')} }`

/** Edits the config's text; a failed code operation becomes a message about the config. */
const editConfig = (
  text: string,
  change: (document: SourceDocument, style: CodeStyle) => void,
): string => {
  try {
    const document = openSourceDocument(PROJECT_PATHS.config, text)
    const style = document.inspect(({ text: current, program }) =>
      detectCodeStyle(current, program),
    )
    change(document, style)
    return document.print()
  } catch (error) {
    if (error instanceof CodeEditError) {
      throw new ProjectConfigError(
        `cannot edit ${PROJECT_PATHS.config}: ${error.message}; edit it by hand instead`,
        { cause: error },
      )
    }
    throw error
  }
}

/** Removes the property `key` of the config's `answers`, if it has one. */
const removeAnswers = (document: SourceDocument, key: string): void => {
  document.edit((context) => {
    const config = findObjectBehind(
      context.program,
      findDefaultExport(context.program),
      DEFAULT_EXPORT,
    )
    const answers = findProperty(config, ANSWERS)
    if (answers === undefined) {
      return
    }
    const object = findObjectBehind(
      context.program,
      answers.value,
      `${ANSWERS} of ${DEFAULT_EXPORT}`,
    )
    const property = findProperty(object, key)
    if (property !== undefined) {
      removeFromList(
        context,
        {
          open: object.start,
          close: object.end - 1,
          items: object.properties,
          emptyLayout: 'lines',
        },
        property,
      )
    }
  })
}

/**
 * Adds a plugin to the text of a `next-suite.config.ts`: its entry at the end of `plugins`, out
 * of `disable`, and its answers under `answers`. Everything else keeps its formatting; new code
 * takes the file's quotes.
 *
 * @throws ProjectConfigError for a config whose default export holds no object literal.
 */
export const addPluginToConfig = (text: string, { entry, name, answers }: AddedPlugin): string =>
  editConfig(text, (document, style) => {
    const config = createTypescriptModule(document).defaultExportObject()
    config.addToArray(PLUGINS, renderString(entry, style))
    for (const form of quotedForms(name)) {
      config.removeFromArray(DISABLE, form)
    }
    if (Object.keys(answers).length > 0) {
      config.object(ANSWERS).set(name, renderAnswers(answers, style))
    }
  })

/**
 * Disables a plugin in the text of a `next-suite.config.ts`: its name joins `disable`, and its
 * answers go, since a config may not answer a plugin it does not select. Everything else keeps
 * its formatting.
 *
 * @throws ProjectConfigError for a config whose default export holds no object literal.
 */
export const disablePluginInConfig = (text: string, name: string): string =>
  editConfig(text, (document, style) => {
    createTypescriptModule(document)
      .defaultExportObject()
      .addToArray(DISABLE, renderString(name, style))
    removeAnswers(document, name)
  })
