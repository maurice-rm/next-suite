import { DATABASES, ORMS } from "@/options";
import { defineSelect } from "@/ui";

export const selectDatabase = defineSelect(
  "Which database would you like to use?",
  [...DATABASES],
);

export const selectOrm = defineSelect("Which ORM would you like to use?", [
  ...ORMS,
]);
