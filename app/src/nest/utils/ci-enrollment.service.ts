import { Inject, Injectable } from '@nestjs/common'
import { createHash } from 'node:crypto'
import { createRemoteJWKSet, jwtVerify, type JWTVerifyGetKey } from 'jose'
import { ConfigService } from './config/config.service.js'
import { Environment } from './config/types.js'
import { EnvVars } from './config/env_vars.js'
import { PostgresClient } from '../storage/postgres/postgres.client.js'

export const CI_ENROLLMENT_PREFIX = 'quiet-ci-oidc:'
export const CI_ENROLLMENT_AUDIENCE =
  'https://qss-dev.quiet-services.app/ci-enrollment'
export const CI_ENROLLMENT_KEYS = Symbol('CI_ENROLLMENT_KEYS')
const ISSUER = 'https://token.actions.githubusercontent.com'
const WORKFLOWS = ['mobile-notification-e2e.yml', 'mobile-notification-ios.yml']

export interface CiEnrollmentGrant {
  expiresAt: number
}

export const ciEnrollmentKeysProvider = {
  provide: CI_ENROLLMENT_KEYS,
  useFactory: (): JWTVerifyGetKey =>
    createRemoteJWKSet(new URL(`${ISSUER}/.well-known/jwks`), {
      timeoutDuration: 5000,
      cooldownDuration: 30000,
    }),
}

@Injectable()
export class CiEnrollmentService {
  constructor(
    private readonly postgres: PostgresClient,
    @Inject(CI_ENROLLMENT_KEYS) private readonly keys: JWTVerifyGetKey,
  ) {}

  public get enabled(): boolean {
    return (
      ConfigService.getBool(EnvVars.CI_ENROLLMENT_ENABLED, false) === true &&
      ConfigService.getEnv() === Environment.Development &&
      ConfigService.getString(EnvVars.QSS_HOSTNAME) ===
        'qss-dev.quiet-services.app'
    )
  }

  public async verify(token: string): Promise<CiEnrollmentGrant | undefined> {
    if (
      !this.enabled ||
      token.length > 16384 ||
      !token.startsWith(CI_ENROLLMENT_PREFIX)
    )
      return undefined
    try {
      const { payload } = await jwtVerify(
        token.slice(CI_ENROLLMENT_PREFIX.length),
        this.keys,
        {
          issuer: ISSUER,
          audience: CI_ENROLLMENT_AUDIENCE,
          algorithms: ['RS256'],
          maxTokenAge: '10 minutes',
          requiredClaims: [
            'exp',
            'iat',
            'nbf',
            'jti',
            'repository_id',
            'repository_owner_id',
            'repository',
            'ref',
            'event_name',
            'workflow_ref',
            'run_id',
            'run_attempt',
            'check_run_id',
          ],
        },
      )
      if (
        payload.repository_id !== '438267145' ||
        payload.repository_owner_id !== '59660937' ||
        payload.repository !== 'TryQuiet/quiet' ||
        payload.ref !== 'refs/heads/develop' ||
        !['push', 'workflow_dispatch'].includes(String(payload.event_name)) ||
        !WORKFLOWS.some(
          file =>
            payload.workflow_ref ===
            `TryQuiet/quiet/.github/workflows/${file}@refs/heads/develop`,
        ) ||
        typeof payload.exp !== 'number' ||
        typeof payload.iat !== 'number' ||
        payload.exp - payload.iat > 600 ||
        ![payload.run_id, payload.run_attempt, payload.check_run_id].every(
          value => typeof value === 'string' && /^[1-9][0-9]*$/.test(value),
        )
      ) {
        return undefined
      }
      // Different JWTs from the same job cannot mint additional grants. The
      // unique PostgreSQL row also prevents replay across sockets and QSS hosts.
      const id = createHash('sha256')
        .update(
          [
            payload.repository_id,
            payload.run_id,
            payload.run_attempt,
            payload.check_run_id,
          ].join(':'),
        )
        .digest('hex')
      if (!(await this.postgres.reserveCiEnrollment(id))) return undefined
      return { expiresAt: Date.now() + 5 * 60_000 }
    } catch {
      // Never send JWTs, claims, database errors or verifier diagnostics to logs
      // or callers. A missing migration or unavailable database fails closed.
      return undefined
    }
  }
}
