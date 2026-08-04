import { defineConfirm } from "@/ui";

export const confirmOpenApi = defineConfirm(
  "Add an OpenAPI (REST) layer for oRPC?",
);

export const confirmScalar = defineConfirm("Include a Scalar API-docs UI?");
