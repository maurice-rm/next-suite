const isUnicode = process.platform !== "win32";

export const BRAND = "#2563EB";

/** Unicode/ASCII box-drawing and status glyphs. Win32 falls back to ASCII. */
export const SYMBOLS = {
  bar: isUnicode ? "│" : "|",
  barEnd: isUnicode ? "└" : "—",
  active: isUnicode ? "◆" : "*",
  submit: isUnicode ? "◇" : "o",
  cancel: isUnicode ? "■" : "x",
  error: isUnicode ? "▲" : "!",
  radioOn: isUnicode ? "●" : ">",
  radioOff: isUnicode ? "○" : " ",
  checkboxOn: isUnicode ? "◼" : "[x]",
  checkboxOff: isUnicode ? "◻" : "[ ]",
  corner: isUnicode ? "↳" : ">",
};
