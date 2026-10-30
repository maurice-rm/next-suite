import { createEnv } from "@t3-oss/env-nextjs";
import * as z from "zod";

export const env = createEnv({
  server: {
  },
  client: {
  },
  experimental__runtimeEnv: {
  },
  emptyStringAsUndefined: true,
});
