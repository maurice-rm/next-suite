import type { Instrumentation } from "next";
import pino from "pino";

const level = process.env.LOG_LEVEL ?? "info";

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
