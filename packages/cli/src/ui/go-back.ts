import type { State } from "@clack/core";

import { GO_BACK } from "@/wizard";

type KeyListener = (char?: string, key?: { name?: string }) => void;

interface BackablePrompt<T> {
  state: State;
  prompt(): Promise<T>;
  on(event: "key", listener: KeyListener): void;
}

/**
 * Wire back-navigation onto a prompt: when `canGoBack` and a key matching
 * `isBackKey` is pressed, the returned promise resolves to {@link GO_BACK}
 * instead of the prompt's own value.
 */
export const withGoBack = <T>(
  prompt: BackablePrompt<T>,
  canGoBack: boolean,
  isBackKey: (char?: string, key?: { name?: string }) => boolean,
): Promise<T | typeof GO_BACK> => {
  let wasBackPressed = false;
  if (canGoBack) {
    prompt.on("key", (char, key) => {
      if (!isBackKey(char, key)) return;
      wasBackPressed = true;
      prompt.state = "cancel";
    });
  }
  return prompt.prompt().then((result) => (wasBackPressed ? GO_BACK : result));
};
