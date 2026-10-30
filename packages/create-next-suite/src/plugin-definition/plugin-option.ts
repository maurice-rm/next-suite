/** A choice of an option: its value, or the value with the label and hint the wizard shows. */
export type OptionChoice =
  | string
  | {
      readonly value: string
      /** The name the wizard shows; the value without one. */
      readonly label?: string
      /** The hint the wizard shows beside the label. */
      readonly description?: string
    }

/** The value of a choice, written as the value or with a label. */
export const choiceValue = (choice: OptionChoice): string =>
  typeof choice === 'string' ? choice : choice.value

type ChoiceValue<Choice> = Choice extends string
  ? Choice
  : Choice extends { readonly value: infer Value extends string }
    ? Value
    : never

type QuestionFields = {
  /** The question the wizard asks. */
  readonly question: string
  /** What the option sets, as a short statement; the help of its flag shows it. */
  readonly description?: string
}

/** A yes/no question; the answer is a boolean. */
type BooleanOption = QuestionFields & {
  readonly type: 'boolean'
  /** The answer `--yes` takes. */
  readonly default: boolean
}

/**
 * A question answered with one of the choices; the answer is the chosen value.
 *
 * @typeParam Choices - The choices, inferred as a tuple.
 */
type SelectOption<Choices extends readonly OptionChoice[] = readonly OptionChoice[]> =
  QuestionFields & {
    readonly type?: 'select'
    readonly choices: Choices
    /** The value `--yes` takes; one of the choices. */
    readonly default: ChoiceValue<Choices[number]>
  }

/**
 * A question answered with any number of the choices; the answer is the list of chosen values.
 *
 * @typeParam Choices - The choices, inferred as a tuple.
 */
type MultiselectOption<Choices extends readonly OptionChoice[] = readonly OptionChoice[]> =
  QuestionFields & {
    readonly type: 'multiselect'
    readonly choices: Choices
    /** The values `--yes` takes; each one of the choices. */
    readonly default: readonly ChoiceValue<Choices[number]>[]
  }

/** A further question a plugin asks, with a flag `--<plugin>-<option>`. */
export type PluginOption = BooleanOption | SelectOption | MultiselectOption

/** The definition an option has to match, picked by its `type` and inferred `choices`. */
type DefinitionOf<Option> = Option extends { readonly type: 'boolean' }
  ? BooleanOption
  : Option extends {
        readonly type: 'multiselect'
        readonly choices: infer Choices extends readonly OptionChoice[]
      }
    ? MultiselectOption<Choices>
    : Option extends { readonly choices: infer Choices extends readonly OptionChoice[] }
      ? SelectOption<Choices>
      : PluginOption

/** `Definition`, with each field `Value` has beyond it refused. */
type Exact<Value, Definition> = Definition & {
  readonly [Key in Exclude<keyof Value, keyof Definition>]: never
}

/**
 * The options of a plugin as inferred, each checked against the definition its `type` picks:
 * a default must be one of the choices, and a misspelled field is refused.
 *
 * @typeParam Options - The options as written, by name.
 */
export type CheckedOptions<Options> = {
  readonly [Key in keyof Options]: Exact<Options[Key], DefinitionOf<Options[Key]>>
}

type AnswerOf<Option> = Option extends { readonly type: 'boolean' }
  ? boolean
  : Option extends {
        readonly type: 'multiselect'
        readonly choices: infer Choices extends readonly OptionChoice[]
      }
    ? readonly ChoiceValue<Choices[number]>[]
    : Option extends { readonly choices: infer Choices extends readonly OptionChoice[] }
      ? ChoiceValue<Choices[number]>
      : never

/**
 * The answers to a plugin's options, each narrowed to its option: a boolean, one of the choices,
 * or a list of them.
 *
 * @typeParam Options - The options as written, by name.
 */
export type Answers<Options> = { readonly [Key in keyof Options]: AnswerOf<Options[Key]> }

/** An answer as the core handles it, before it is narrowed to its option. */
export type Answer = boolean | string | readonly string[]
