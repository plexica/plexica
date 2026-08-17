// app-error-base.ts
// Base class for all application errors, plus the defineError factory used to
// declare simple AppError subclasses in one line.
// Kept in a separate leaf module (no imports) to prevent circular ESM imports:
// app-error.ts and modules/plugin/errors.ts both import AppError from here.

export abstract class AppError extends Error {
  abstract readonly statusCode: number;
  abstract readonly code: string;

  constructor(message: string) {
    super(message);
    this.name = this.constructor.name;
    // Maintains proper prototype chain for instanceof checks
    Object.setPrototypeOf(this, new.target.prototype);
  }
}

/**
 * Declares a simple AppError subclass — fixed statusCode/code and an
 * overridable default message — in a single statement:
 *
 *   export const WorkspaceNotFoundError = defineError('WORKSPACE_NOT_FOUND', 404, 'Workspace not found');
 *
 * The class `name` is set explicitly: class expressions returned from a
 * factory have an empty constructor.name, and AppError copies it into
 * err.name (log serialization). instanceof keeps working because the
 * returned class is a real AppError subclass.
 */
export function defineError(
  code: string,
  statusCode: number,
  defaultMessage: string
): new (message?: string) => AppError {
  const cls = class extends AppError {
    readonly code = code;
    readonly statusCode = statusCode;
    constructor(message = defaultMessage) {
      super(message);
    }
  };
  Object.defineProperty(cls, 'name', { value: code, configurable: true });
  return cls;
}
