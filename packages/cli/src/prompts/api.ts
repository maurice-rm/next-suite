import { API_TYPES } from "@/options";
import { defineSelect } from "@/ui";

export const selectApiType = defineSelect(
  "Which API layer would you like to use?",
  [...API_TYPES],
);
