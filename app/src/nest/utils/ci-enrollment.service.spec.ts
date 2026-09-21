import { jest } from '@jest/globals'
import { createServer, type Server } from 'node:http'
import {
  createRemoteJWKSet,
  generateKeyPair,
  exportJWK,
  SignJWT,
  type JWTPayload,
} from 'jose'
import { MikroORM } from '@mikro-orm/postgresql'
import mikroOrmConfig from '../storage/postgres/mikro-orm.postgres.config.js'
import { PostgresClient } from '../storage/postgres/postgres.client.js'
import {
  CiEnrollmentService,
  CI_ENROLLMENT_AUDIENCE,
  CI_ENROLLMENT_PREFIX,
} from './ci-enrollment.service.js'
import { CaptchaService } from './captcha.js'
import type { AWSSecretsService } from './aws/aws-secrets.service.js'

describe('staging CI enrollment with signed identities and durable replay protection', () => {
  let orm: MikroORM
  let postgres: PostgresClient
  let service: CiEnrollmentService
  let http: Server
  let signingKey: CryptoKey
  let keys: ReturnType<typeof createRemoteJWKSet>
  let previous: Record<string, string | undefined>
  const env = {
    CI_ENROLLMENT_ENABLED: 'true',
    ENV: 'development',
    QSS_HOSTNAME: 'qss-dev.quiet-services.app',
  }
  const claims: JWTPayload = {
    repository_id: '438267145',
    repository_owner_id: '59660937',
    repository: 'TryQuiet/quiet',
    ref: 'refs/heads/develop',
    event_name: 'workflow_dispatch',
    workflow_ref:
      'TryQuiet/quiet/.github/workflows/mobile-notification-e2e.yml@refs/heads/develop',
    run_id: '1234',
    run_attempt: '1',
    check_run_id: '5678',
  }

  beforeAll(async () => {
    orm = await MikroORM.init(mikroOrmConfig)
    postgres = new PostgresClient(orm, orm.em.fork())
    const pair = await generateKeyPair('RS256', { extractable: true })
    signingKey = pair.privateKey
    const jwk = {
      ...(await exportJWK(pair.publicKey)),
      kid: 'ci-test',
      alg: 'RS256',
      use: 'sig',
    }
    http = createServer((_request, response) => {
      response.writeHead(200, { 'content-type': 'application/json' })
      response.end(JSON.stringify({ keys: [jwk] }))
    })
    await new Promise<void>(resolve => http.listen(0, '127.0.0.1', resolve))
    const address = http.address()
    if (address == null || typeof address === 'string')
      throw new Error('Missing test JWKS address')
    keys = createRemoteJWKSet(new URL(`http://127.0.0.1:${address.port}/jwks`))
  })

  beforeEach(async () => {
    previous = Object.fromEntries(
      Object.keys(env).map(key => [key, process.env[key]]),
    )
    Object.assign(process.env, env)
    await orm.em
      .getConnection('write')
      .execute('delete from ci_enrollment_grants')
    service = new CiEnrollmentService(postgres, keys)
  })

  afterEach(() => {
    for (const [key, value] of Object.entries(previous)) {
      if (value === undefined) Reflect.deleteProperty(process.env, key)
      else process.env[key] = value
    }
    jest.restoreAllMocks()
  })

  afterAll(async () => {
    await new Promise<void>(resolve =>
      http.close(() => {
        resolve()
      }),
    )
    await orm.close()
  })

  async function token(
    overrides: JWTPayload = {},
    key = signingKey,
  ): Promise<string> {
    const now = Math.floor(Date.now() / 1000)
    return (
      CI_ENROLLMENT_PREFIX +
      (await new SignJWT({
        ...claims,
        iss: 'https://token.actions.githubusercontent.com',
        aud: CI_ENROLLMENT_AUDIENCE,
        iat: now,
        nbf: now,
        exp: now + 300,
        jti: 'original-jti',
        ...overrides,
      })
        .setProtectedHeader({ alg: 'RS256', kid: 'ci-test' })
        .sign(key))
    )
  }

  it('accepts a trusted workflow once across concurrent QSS instances and different JWTs from that job', async () => {
    const jwt = await token()
    const secondHost = new CiEnrollmentService(
      new PostgresClient(orm, orm.em.fork()),
      keys,
    )
    const results = await Promise.all(
      Array.from(
        { length: 12 },
        async (_, index) =>
          await (index % 2 === 0 ? service : secondHost).verify(jwt),
      ),
    )
    const grants = results.filter(result => result !== undefined)
    expect(grants).toHaveLength(1)
    expect(grants[0].expiresAt).toBeGreaterThan(Date.now())
    expect(grants[0].expiresAt).toBeLessThanOrEqual(Date.now() + 300_000)
    expect(
      await secondHost.verify(await token({ jti: 'another-jti' })),
    ).toBeUndefined()
    expect(
      await secondHost.verify(await token({ check_run_id: '5679' })),
    ).toBeDefined()
  })

  it.each([
    ['repository ID', { repository_id: '1' }],
    ['owner ID', { repository_owner_id: '1' }],
    ['repository name', { repository: 'other/quiet' }],
    ['branch', { ref: 'refs/heads/attacker' }],
    ['PR event', { event_name: 'pull_request' }],
    ['PR target event', { event_name: 'pull_request_target' }],
    [
      'different workflow',
      {
        workflow_ref:
          'TryQuiet/quiet/.github/workflows/other.yml@refs/heads/develop',
      },
    ],
    [
      'PR workflow',
      {
        workflow_ref:
          'TryQuiet/quiet/.github/workflows/mobile-notification-e2e.yml@refs/pull/1/merge',
      },
    ],
    ['issuer', { iss: 'https://issuer.invalid' }],
    ['audience', { aud: 'https://qss-prod.quiet-services.app/ci-enrollment' }],
    ['expiry', { exp: 1 }],
    ['excessive lifetime', { exp: Math.floor(Date.now() / 1000) + 3600 }],
    ['not yet valid', { nbf: Math.floor(Date.now() / 1000) + 3600 }],
    ['missing job', { check_run_id: undefined }],
    ['invalid run', { run_id: '../any' }],
  ] as Array<[string, JWTPayload]>)(
    'rejects an untrusted %s',
    async (_name, overrides) => {
      expect(await service.verify(await token(overrides))).toBeUndefined()
      expect(await service.verify(await token())).toBeDefined()
    },
  )

  it('rejects a forged signature even when every claim is trusted', async () => {
    const attacker = await generateKeyPair('RS256')
    expect(
      await service.verify(await token({}, attacker.privateKey)),
    ).toBeUndefined()
  })

  it.each([
    ['CI_ENROLLMENT_ENABLED', 'false'],
    ['ENV', 'production'],
    ['ENV', 'local'],
    ['QSS_HOSTNAME', 'qss-prod.quiet-services.app'],
  ])('fails closed when %s is %s', async (key, value) => {
    process.env[key] = value
    expect(await service.verify(await token())).toBeUndefined()
  })

  it('fails closed on database errors without revealing verification details', async () => {
    jest
      .spyOn(postgres, 'reserveCiEnrollment')
      .mockRejectedValue(new Error('database sentinel'))
    expect(await service.verify(await token())).toBeUndefined()
  })

  it('keeps ordinary hCaptcha validation active, including rejection of the public test token', async () => {
    const aws = {
      getSecretEnvVar: jest
        .fn<() => Promise<string>>()
        .mockResolvedValue('normal-hcaptcha-secret'),
    }
    const captcha = new CaptchaService(
      aws as unknown as AWSSecretsService,
      service,
    )
    const request = jest.spyOn(globalThis, 'fetch').mockResolvedValue(
      new Response(
        JSON.stringify({
          success: false,
          'error-codes': ['invalid-input-response'],
        }),
      ),
    )
    const result = await captcha.verifyToken(
      '10000000-aaaa-bbbb-cccc-000000000001',
    )
    expect(result.success).toBe(false)
    expect(request).toHaveBeenCalledWith(
      'https://api.hcaptcha.com/siteverify',
      expect.objectContaining({ method: 'POST' }),
    )
    request.mockClear()
    expect(
      (await captcha.verifyToken(await token())).ciEnrollmentGrant,
    ).toBeDefined()
    expect(request).not.toHaveBeenCalled()
  })
})
