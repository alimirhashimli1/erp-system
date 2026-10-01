import { ForbiddenException, type ExecutionContext, UnauthorizedException } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import type { Role } from '@procurestack/shared';
import { AnyAuthenticated, Public, Roles } from '../decorators/access.decorators';
import { RolesGuard } from './roles.guard';

class Probe {
  @Public() open() {}
  @AnyAuthenticated() anyone() {}
  @Roles('BUYER', 'ADMIN') buyersOnly() {}
  @Roles('FINANCE') financeOnly() {}
  undecorated() {}
}

function contextFor(handler: keyof Probe, roles?: Role[]): ExecutionContext {
  const user = roles ? { id: 'u1', email: 'u@x.dev', roles } : undefined;
  return {
    getHandler: () => Probe.prototype[handler],
    getClass: () => Probe,
    switchToHttp: () => ({ getRequest: () => ({ user }) }),
  } as unknown as ExecutionContext;
}

describe('RolesGuard', () => {
  const guard = new RolesGuard(new Reflector());

  it('lets public routes through without a user', () => {
    expect(guard.canActivate(contextFor('open'))).toBe(true);
  });

  it('DENIES routes that declare no policy, even for an admin (default deny)', () => {
    expect(() => guard.canActivate(contextFor('undecorated', ['ADMIN']))).toThrow(
      ForbiddenException,
    );
  });

  it('allows any signed-in user on @AnyAuthenticated routes', () => {
    expect(guard.canActivate(contextFor('anyone', ['REQUESTER']))).toBe(true);
  });

  it('allows a user holding at least one listed role', () => {
    expect(guard.canActivate(contextFor('buyersOnly', ['REQUESTER', 'BUYER']))).toBe(true);
  });

  it('forbids a user with none of the listed roles', () => {
    expect(() => guard.canActivate(contextFor('buyersOnly', ['REQUESTER']))).toThrow(
      ForbiddenException,
    );
  });

  it('does not treat ADMIN as a superuser (segregation of duties)', () => {
    expect(() => guard.canActivate(contextFor('financeOnly', ['ADMIN']))).toThrow(
      ForbiddenException,
    );
  });

  it('returns 401 (not 403) when a protected route has no authenticated user', () => {
    expect(() => guard.canActivate(contextFor('anyone'))).toThrow(UnauthorizedException);
  });
});
