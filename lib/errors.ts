// lib/errors.ts
// Typed error classes and a centralised API error handler for all routes in this project.

import { type ZodError, type ZodIssue } from "zod";

// ---------------------------------------------------------------------------
// AuthorizationError — HTTP 403
// Thrown when a user is authenticated but lacks permission for the requested
// resource or action. Caught by handleApiError and returned as { error } with
// status 403.
// ---------------------------------------------------------------------------
export class AuthorizationError extends Error {
  readonly statusCode = 403;

  constructor(message = "You do not have access to this resource.") {
    super(message);
    this.name = "AuthorizationError";
    // Maintains proper prototype chain in transpiled ES5
    Object.setPrototypeOf(this, AuthorizationError.prototype);
  }
}

// ---------------------------------------------------------------------------
// ValidationError — HTTP 400
// Thrown when request input fails Zod schema validation. Optionally carries
// the raw ZodError for field-level detail in the response body.
// ---------------------------------------------------------------------------
export class ValidationError extends Error {
  readonly statusCode = 400;
  readonly zodError?: ZodError;

  constructor(message: string, zodError?: ZodError) {
    super(message);
    this.name = "ValidationError";
    this.zodError = zodError;
    Object.setPrototypeOf(this, ValidationError.prototype);
  }
}

// ---------------------------------------------------------------------------
// NotFoundError — HTTP 404
// Thrown when a requested resource does not exist or the caller is not allowed
// to know it exists (combine with AuthorizationError when appropriate).
// ---------------------------------------------------------------------------
export class NotFoundError extends Error {
  readonly statusCode = 404;

  constructor(message = "Resource not found.") {
    super(message);
    this.name = "NotFoundError";
    Object.setPrototypeOf(this, NotFoundError.prototype);
  }
}

// ---------------------------------------------------------------------------
// handleApiError
// ---------------------------------------------------------------------------
// The standard catch-block handler for every API route in this project.
// Usage:
//
//   catch (error: unknown) {
//     const { body, status } = handleApiError(error);
//     return Response.json(body, { status });
//   }
//
// Contract:
// - Known errors (AuthorizationError, ValidationError, NotFoundError) are
//   returned with their statusCode and message — safe to expose to clients.
// - All other errors are logged server-side and a generic 500 body is
//   returned — NEVER leak the raw message or stack trace to the client
//   (OWASP A05: Security Misconfiguration).
// ---------------------------------------------------------------------------

type ApiErrorBody =
  | { error: string; details?: Record<string, unknown>[] }
  | { error: string };

export function handleApiError(error: unknown): {
  body: ApiErrorBody;
  status: number;
} {
  if (error instanceof AuthorizationError) {
    return { body: { error: error.message }, status: error.statusCode };
  }

  if (error instanceof ValidationError) {
    const details = error.zodError?.issues.map((e: ZodIssue) => ({
      path: e.path.join("."),
      message: e.message,
    }));
    return {
      body: details
        ? { error: error.message, details }
        : { error: error.message },
      status: error.statusCode,
    };
  }

  if (error instanceof NotFoundError) {
    return { body: { error: error.message }, status: error.statusCode };
  }

  // Unexpected error: log full details server-side only.
  // OWASP A05 — never send raw errors or stack traces to the client.
  console.error("[API_ERROR]", error);
  return {
    body: { error: "Something went wrong. Please try again." },
    status: 500,
  };
}
