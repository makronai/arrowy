/**
 * Array Database Engine - Standard Error Hierarchy
 * Zero external dependencies.
 */

export class ArrayError extends Error {
  /**
   * @param {string} message
   * @param {string} code
   * @param {Record<string, any>} [details]
   */
  constructor(message, code = "ARRAY_ERROR", details = {}) {
    super(message);
    this.name = this.constructor.name;
    this.code = code;
    this.details = details;
    if (Error.captureStackTrace) {
      Error.captureStackTrace(this, this.constructor);
    }
  }

  toJSON() {
    return {
      error: this.name,
      code: this.code,
      message: this.message,
      details: this.details
    };
  }
}

export class ValidationError extends ArrayError {
  constructor(message, details = {}) {
    super(message, "VALIDATION_ERROR", details);
  }
}

export class SchemaError extends ArrayError {
  constructor(message, details = {}) {
    super(message, "SCHEMA_ERROR", details);
  }
}

export class NotFoundError extends ArrayError {
  constructor(message, details = {}) {
    super(message, "NOT_FOUND", details);
  }
}

export class ConflictError extends ArrayError {
  constructor(message, details = {}) {
    super(message, "CONFLICT", details);
  }
}

export class GenerationConflictError extends ConflictError {
  constructor(expectedGeneration, actualGeneration, resource) {
    super(
      `Optimistic concurrency conflict on ${resource}: expected generation ${expectedGeneration}, found ${actualGeneration}`,
      { expectedGeneration, actualGeneration, resource }
    );
    this.code = "GENERATION_CONFLICT";
  }
}

export class StorageError extends ArrayError {
  constructor(message, details = {}) {
    super(message, "STORAGE_ERROR", details);
  }
}

export class CorruptedDataError extends ArrayError {
  constructor(message, details = {}) {
    super(message, "CORRUPTED_DATA", details);
  }
}

export class RecordTooLargeError extends ArrayError {
  constructor(recordSize, maxLimit) {
    super(
      `Record size (${recordSize} bytes) exceeds maximum chunk budget (${maxLimit} bytes)`,
      "RECORD_TOO_LARGE",
      { recordSize, maxLimit }
    );
  }
}

export class RateLimitError extends ArrayError {
  constructor(message, retryAfterSeconds = null) {
    super(message, "RATE_LIMIT_EXCEEDED", { retryAfterSeconds });
  }
}

export class AuthenticationError extends ArrayError {
  constructor(message = "Authentication failed or token invalid") {
    super(message, "AUTHENTICATION_FAILED");
  }
}

export class QueryError extends ArrayError {
  constructor(message, details = {}) {
    super(message, "QUERY_ERROR", details);
  }
}
