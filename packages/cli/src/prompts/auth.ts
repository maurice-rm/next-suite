import { AUTH_PROVIDERS } from "@/options";
import { defineSelect } from "@/ui";

export const selectAuth = defineSelect(
  "Which authentication solution would you like to use?",
  [...AUTH_PROVIDERS],
);
