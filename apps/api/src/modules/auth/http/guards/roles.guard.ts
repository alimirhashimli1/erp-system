import {
  type CanActivate,
  type ExecutionContext,
  ForbiddenException,
  Injectable,
  Logger,
  UnauthorizedException,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import {
  ACCESS_POLICY_KEY,
  type AccessPolicy,
  IS_PUBLIC_KEY,
} from '../decorators/access.decorators';
import type { AuthenticatedRequest } from '../authenticated-request';

/** Authorization: "are you allowed?" — enforces the route's declared policy, default deny. */
@Injectable()
export class RolesGuard implements CanActivate {
  private readonly logger = new Logger(RolesGuard.name);

  constructor(private readonly reflector: Reflector) {}

  canActivate(ctx: ExecutionContext): boolean {
    const targets = [ctx.getHandler(), ctx.getClass()];
    if (this.reflector.getAllAndOverride<boolean | undefined>(IS_PUBLIC_KEY, targets)) return true;

    const policy = this.reflector.getAllAndOverride<AccessPolicy | undefined>(
      ACCESS_POLICY_KEY,
      targets,
    );
    if (!policy) {
      this.logger.error(
        `Route ${ctx.getClass().name}.${ctx.getHandler().name} declares no access policy — denied`,
      );
      throw new ForbiddenException();
    }

    const user = ctx.switchToHttp().getRequest<AuthenticatedRequest>().user;
    if (!user) throw new UnauthorizedException();
    if (policy.kind === 'authenticated') return true;
    if (policy.roles.some((r) => user.roles.includes(r))) return true;
    throw new ForbiddenException('Insufficient role');
  }
}
