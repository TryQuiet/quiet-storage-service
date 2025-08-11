export class CompoundError<T extends Error> extends Error {
  constructor(
    message: string,
    public readonly original?: T,
  ) {
    super(message, {
      cause: original,
    })
  }
}

export class NotInitializedError extends Error {
  constructor(className: string) {
    super(`${className} is not initialized!`)
  }
}

export class EntityValidationError extends Error {}
