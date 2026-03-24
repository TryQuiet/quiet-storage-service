import {
  CanActivate,
  ExecutionContext,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common'
import { JwtService } from '@nestjs/jwt'
import { createLogger } from '../app/logger/logger.js'

const logger = createLogger('NseAuth:JwtGuard')

@Injectable()
export class NseJwtAuthGuard implements CanActivate {
  constructor(private readonly jwtService: JwtService) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const request = context.switchToHttp().getRequest<{
      headers: Record<string, string | undefined>
      user?: unknown
    }>()

    const authHeader = request.headers.authorization
    if (authHeader == null || !authHeader.startsWith('Bearer ')) {
      throw new UnauthorizedException(
        'Missing or malformed Authorization header',
      )
    }

    const token = authHeader.slice(7).trim()
    if (token === '') {
      throw new UnauthorizedException('Empty Bearer token')
    }

    try {
      const payload = await this.jwtService.verifyAsync<{
        deviceId: string
        teamId: string
      }>(token)
      request.user = payload
      return true
    } catch (err) {
      logger.warn(`JWT verification failed: ${String(err)}`)
      throw new UnauthorizedException('Invalid or expired token')
    }
  }
}
