export class OctogenError extends Error {
  constructor(message: string, options?: ErrorOptions) {
    super(message, options);
    this.name = new.target.name;
    Object.setPrototypeOf(this, new.target.prototype);
  }
}

export interface OctogenAPIErrorOptions {
  statusCode?: number;
  detail?: unknown;
  response?: Response;
  cause?: unknown;
}

export class MissingAPIKeyError extends OctogenError {
  constructor(message = "Octogen API key required. Set OCTO_API_KEY or pass apiKey.") {
    super(message);
  }
}

export class OctogenAPIError extends OctogenError {
  readonly statusCode: number | undefined;
  readonly detail: unknown;
  readonly response: Response | undefined;

  constructor(message: string, options: OctogenAPIErrorOptions = {}) {
    const errorOptions =
      options.cause === undefined ? undefined : { cause: options.cause };
    super(message, errorOptions);
    this.statusCode = options.statusCode;
    this.detail = options.detail;
    this.response = options.response;
  }
}

export class OctogenAuthenticationError extends OctogenAPIError {}

export class OctogenForbiddenError extends OctogenAPIError {}

export class OctogenNotFoundError extends OctogenAPIError {}

export class OctogenValidationError extends OctogenAPIError {}

export class OctogenConnectionError extends OctogenError {}
