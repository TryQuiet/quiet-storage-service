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

export class NoPopulatedCommunitiesError extends Error {
  constructor(communityId: string, userCount: number) {
    super(
      `QSS can't join community with more than 1 user!  Community with team ID ${communityId} has ${userCount} users!`,
    )
  }
}

export class AuthenticationError extends Error {
  constructor(public readonly internalMessage: string) {
    super(
      `User does not have permissions on this community or has not signed in`,
    )
  }
}

export class SignatureMismatchError extends Error {
  constructor(
    public readonly entryUserId: string,
    public readonly signatureUserId: string,
  ) {
    super(`User ID on entry doesn't match signature`, {
      cause: `Entry user ID ${entryUserId} did not match signature user ID ${signatureUserId}`,
    })
  }
}

export class CommunityNotFoundError extends Error {
  constructor(communityId: string) {
    super(`No community found for this community ID: ${communityId}`)
  }
}
