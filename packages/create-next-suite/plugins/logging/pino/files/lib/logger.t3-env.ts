import type { Instrumentation } from "next";
import pino from "pino";

import { env } from "@/env";

const level = env.LOG_LEVEL;

export const logger = pino({
  level,
  redact: [
    "req.headers.authorization",
    "req.headers.cookie",
  ],
});

export const reportRequestError: Instrumentation.onRequestError = (error, request, context) => {
  logger.error(
    { err: error, path: request.path, method: request.method, ...context },
    "request failed",
  );
};
