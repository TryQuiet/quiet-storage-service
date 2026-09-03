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

/**
 * Raised when the durable-admission gate is asked to persist a team that is no longer the one the
 * manager holds for that community.
 *
 * An LFA connection appends ADMIT_* to the specific `Team` instance it was constructed over. If the
 * cached sigchain for that community has since been replaced, persisting "the community" by id
 * would commit a graph that does not contain the admission, and the connection would then release
 * the acceptance anyway. Failing here keeps the gate closed (QSS-006 / private#203).
 */
export class AdmittingSigChainReplacedError extends Error {
  constructor(public readonly communityId: string) {
    super(
      `The in-memory sigchain for community ${communityId} was replaced while an admission was in flight, so the admitting graph was not persisted`,
    )
  }
}
