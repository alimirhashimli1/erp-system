import { createParamDecorator, type ExecutionContext, UnauthorizedException } from '@nestjs/common';
import type { Request } from 'express';
import type { AuthPrincipal } from '../domain/user-account';

export interface AuthenticatedRequest extends Request {
  user?: AuthPrincipal;
}

/** Injects the verified caller. Only valid on non-public routes. */
export const CurrentUser = createParamDecorator((_: unknown, ctx: ExecutionContext) => {
  const user = ctx.switchToHttp().getRequest<AuthenticatedRequest>().user;
  if (!user) throw new UnauthorizedException();
  return user;
});
