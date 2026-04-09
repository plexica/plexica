// app-error-base.ts
// Base class for all application errors.
// Kept in a separate file to prevent circular ESM imports:
//   app-error.ts re-exports from app-error-domain.ts
//   app-error-domain.ts needs AppError as its base class
// Both files import AppError from this leaf module (no further imports).

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
