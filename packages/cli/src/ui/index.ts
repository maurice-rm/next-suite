// Public surface of the UI layer. Consumers import from "@/ui", never from the
// individual files (style.ts is a UI-internal detail).
export { renderTitle } from "./banner";
export {
  defineConfirm,
  defineSelect,
  navigableConfirm,
  type NavigableConfirmOptions,
  navigableGroupMultiselect,
  type NavigableGroupMultiselectOptions,
  type NavigableOption,
  navigableSelect,
  type NavigableSelectOptions,
  navigableText,
  type NavigableTextOptions,
} from "./navigable";
export { renderOutro, renderProvisionOutro } from "./outro";
