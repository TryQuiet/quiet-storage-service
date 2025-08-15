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

export class NoPopulatedCommunitiesError extends Error {
  constructor(communityId: string, userCount: number) {
    super(
      `QSS can't join community with more than 1 user!  Community with team ID ${communityId} has ${userCount} users!`,
    )
  }
}
