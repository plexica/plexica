// validation.ts
// Shared validation helpers for route handlers.
//
// parseOrThrow collapses the recurring Zod boilerplate:
//   const parsed = XSchema.safeParse(input);
//   if (!parsed.success) {
//     throw new ValidationError(parsed.error.issues.map((i) => i.message).join(', '));
//   }
// into a single narrowing call. The ValidationError message format (issue
// messages joined with ', ') is preserved exactly.
//
// stripUndefined supports exactOptionalPropertyTypes: Zod parses optional
// fields as `T | undefined`, which cannot be assigned to `field?: T` filter
// interfaces. Dropping undefined-valued keys lets the result satisfy them.

import { ValidationError } from './app-error.js';

import type { z, ZodTypeAny } from 'zod';

/**
 * Parses `input` with `schema` and returns the narrowed data on success.
 * Throws ValidationError (422) with all issue messages joined by ', ' on failure.
 *
 * The schema is generic over ZodTypeAny with the return type taken from
 * z.infer (the schema's OUTPUT type): schemas with .default()/.coerce have
 * distinct input/output types, and a ZodType<T> parameter would mis-infer T.
 */
export function parseOrThrow<S extends ZodTypeAny>(schema: S, input: unknown): z.infer<S> {
  const parsed = schema.safeParse(input);
  if (!parsed.success) {
    throw new ValidationError(parsed.error.issues.map((i) => i.message).join(', '));
  }
  return parsed.data as z.infer<S>;
}

/** Mapped type companion of stripUndefined: every field with undefined excluded. */
export type StripUndefined<T> = { [K in keyof T]: Exclude<T[K], undefined> };

/**
 * Returns a copy of `obj` without undefined-valued keys, so the result can be
 * assigned to interfaces with optional fields under exactOptionalPropertyTypes.
 */
export function stripUndefined<T extends Record<string, unknown>>(obj: T): StripUndefined<T> {
  return Object.fromEntries(
    Object.entries(obj).filter(([, value]) => value !== undefined)
  ) as StripUndefined<T>;
}
