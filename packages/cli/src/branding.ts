const IS_UNICODE = process.platform !== "win32";

export const BRAND = "#2563EB";

/** Unicode/ASCII box-drawing and status glyphs. Win32 falls back to ASCII. */
export const SYMBOLS = {
  bar: IS_UNICODE ? "│" : "|",
  barEnd: IS_UNICODE ? "└" : "—",
  active: IS_UNICODE ? "◆" : "*",
  submit: IS_UNICODE ? "◇" : "o",
  cancel: IS_UNICODE ? "■" : "x",
  error: IS_UNICODE ? "▲" : "!",
  radioOn: IS_UNICODE ? "●" : ">",
  radioOff: IS_UNICODE ? "○" : " ",
  checkboxOn: IS_UNICODE ? "◼" : "[x]",
  checkboxOff: IS_UNICODE ? "◻" : "[ ]",
  corner: IS_UNICODE ? "↳" : ">",
};
