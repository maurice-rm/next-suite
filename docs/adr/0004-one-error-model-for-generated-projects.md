# 0004 — Generated projects share one error model across oRPC, tRPC and Better-Auth

- **Status:** accepted

## Context

Error handling in generated projects had grown per layer: a `DomainError` with a `kind` mapped by a table per API, its `code` doubling as the message, tRPC returning a Zod error tree while oRPC returned a plain `BAD_REQUEST`, status thresholds defined in several files, and no client-side mapping from errors to text. Every feature built on the scaffold would have added its own variant. The model below follows the one a project built from the scaffold settled on after review.

## Decision

- **One error type.** Every expected failure is an `AppError` (`code`, `status`, English `message`, optional `data`, `cause`). Anything else is an unexpected error, answered as a masked `INTERNAL_SERVER_ERROR` and logged with its cause.
- **Codes are declared where they belong and never renamed.** Common codes live in `lib/errors/common-errors.ts` and follow oRPC's standard names; a feature declares only the codes of rules it enforces, through `defineErrors`; Better-Auth's codes pass through with Better-Auth's status (`callAuth`). `lib/` knows no feature code.
- **One adapter per boundary, applied once.** A middleware on the base procedure maps errors for oRPC and for tRPC, so server-side calls and tests see what HTTP clients see. Invalid input becomes `INPUT_INVALID` with field errors keyed by TanStack Form's path syntax. tRPC's fixed codes carry the status; the app code travels in the formatter's `data`.
- **Logging happens once, at the transport boundary,** with the level following the status (`lib/http-status.ts`).
- **The client owns the text.** `toErrorMessage` resolves a feature's override, then a default per code, then per status, then a generic text; mutations toast centrally (sonner) unless a form shows the error itself. Texts are English, like the rest of the scaffold's UI.

## Considered options

- **Keeping `DomainError` with a kind per error.** It cannot carry Better-Auth's codes or a status the kinds don't name, and each API needed its own table.
- **oRPC's typed errors (`.errors()`) on every procedure.** They type codes on the client but need every code, Better-Auth's included, registered statically; they stay reserved for public `/api/v1` procedures, where they document the codes in the spec.
- **A library for Problem Details, HTTP errors or result types.** None removes code the model needs; each adds a dependency.

## Consequences

- A feature adds an `errors.ts` only for rules of its own, and message overrides only where the default text does not fit.
- The client depends on Better-Auth's code names; a rename surfaces as a type error in the message table, which is keyed by `authClient.$ERROR_CODES`.
- `/api/v1` error bodies carry the app `code` and put invalid-input details under `data`.
- API projects ship `sonner` and mount its `<Toaster />` in the root layout.
