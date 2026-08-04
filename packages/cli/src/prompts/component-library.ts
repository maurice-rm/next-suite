import { COMPONENT_LIBRARIES } from "@/options";
import { defineSelect } from "@/ui";

export const selectComponentLibrary = defineSelect(
  "Which component library would you like to use?",
  [...COMPONENT_LIBRARIES],
);
