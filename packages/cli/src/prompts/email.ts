import { EMAIL_PROVIDERS } from "@/options";
import { defineSelect } from "@/ui";

export const selectEmailProvider = defineSelect(
  "Which email provider would you like to use?",
  [...EMAIL_PROVIDERS],
);
