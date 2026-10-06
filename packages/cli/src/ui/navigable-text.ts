import { type State, TextPrompt } from "@clack/core";
import ansis from "ansis";

import { SYMBOLS } from "@/branding";

import { withGoBack } from "./go-back";
import { brand, renderPromptTitle, textFooter } from "./style";

interface TextRenderState {
  state: State;
  value?: string;
  error?: string;
  userInput?: string;
  userInputWithCursor?: string;
}

interface TextRenderOptions {
  message: string;
  placeholder?: string;
  canGoBack: boolean;
}

const renderPlaceholder = (placeholder: string | undefined): string =>
  placeholder
    ? ansis.inverse(placeholder.slice(0, 1)) + ansis.dim(placeholder.slice(1))
    : ansis.inverse(ansis.hidden("_"));

const renderText = (
  self: TextRenderState,
  options: TextRenderOptions,
): string => {
  const title = renderPromptTitle(self.state, options.message);
  const input = self.userInput
    ? (self.userInputWithCursor ?? self.userInput)
    : renderPlaceholder(options.placeholder);
  const committed = self.value ?? "";

  switch (self.state) {
    case "error":
      return `${title.trim()}\n${ansis.yellow(SYMBOLS.bar)}  ${input}\n${ansis.yellow(SYMBOLS.barEnd)}  ${ansis.yellow(self.error ?? "")}\n`;
    case "submit":
      return committed
        ? `${title}${ansis.gray(SYMBOLS.bar)}  ${ansis.dim(committed)}`
        : title.replace(/\n$/, "");
    case "cancel":
      return `${title}${ansis.gray(SYMBOLS.bar)}${committed ? `  ${ansis.strikethrough(ansis.dim(committed))}` : ""}`;
    default:
      return `${title}${brand(SYMBOLS.bar)}  ${input}\n${brand(SYMBOLS.barEnd)}\n   ${textFooter(options.canGoBack)}\n`;
  }
};

interface NavigableTextOptions {
  message: string;
  placeholder?: string;
  initialValue?: string;
  validate?: (value: string | undefined) => string | undefined;
  canGoBack?: boolean;
}

/**
 * A single-line text prompt with optional validation and Esc back-navigation.
 *
 * @returns The entered string, or GO_BACK / the cancel symbol.
 */
export const navigableText = (
  options: NavigableTextOptions,
): Promise<string | symbol> => {
  const renderOptions: TextRenderOptions = {
    message: options.message,
    placeholder: options.placeholder,
    canGoBack: options.canGoBack ?? false,
  };
  const prompt = new TextPrompt({
    placeholder: options.placeholder,
    initialValue: options.initialValue,
    validate: options.validate,
    render() {
      return renderText(this, renderOptions);
    },
  });
  return withGoBack(
    prompt,
    renderOptions.canGoBack,
    (_char, key) => key?.name === "escape",
  ) as Promise<string | symbol>;
};
