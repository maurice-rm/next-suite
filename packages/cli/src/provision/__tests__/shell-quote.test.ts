import { expect, test } from "vitest";

import { quoteShellWord } from "../shell-quote";

test("quoteShellWord wraps in single quotes and escapes an embedded quote", () => {
  expect(quoteShellWord("plain")).toBe("'plain'");
  expect(quoteShellWord("a'b")).toBe("'a'\\''b'");
});
