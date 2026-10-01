import { Body, Controller, Get, HttpCode, Post, Req, Res } from '@nestjs/common';
import { ApiBearerAuth, ApiNoContentResponse, ApiTags } from '@nestjs/swagger';
import { Throttle } from '@nestjs/throttler';
import type { CookieOptions, Request, Response } from 'express';
import { ZodResponse } from 'nestjs-zod';
import { AppConfigService } from '../../../config/app-config.service';
import { AuthService, type RequestContext } from '../application/auth.service';
import type { AuthPrincipal } from '../domain/user-account';
import { AccessTokenResponseDto, AuthUserDto, LoginDto } from './auth.dto';
import { CurrentUser } from './authenticated-request';
import { AnyAuthenticated, Public } from './decorators/access.decorators';

export const REFRESH_COOKIE = 'ps_rt';
const REFRESH_COOKIE_PATH = '/api/auth';

const contextOf = (req: Request): RequestContext => ({
  ip: req.ip,
  userAgent: req.get('user-agent')?.slice(0, 200),
});

const readRefreshCookie = (req: Request): string | undefined => {
  const value: unknown = (req.cookies as Record<string, unknown> | undefined)?.[REFRESH_COOKIE];
  return typeof value === 'string' ? value : undefined;
};

@ApiTags('auth')
@Controller('auth')
export class AuthController {
  constructor(
    private readonly auth: AuthService,
    private readonly config: AppConfigService,
  ) {}

  @Public()
  @Throttle({ default: { limit: 5, ttl: 60_000 } }) // brute-force / credential-stuffing brake
  @Post('login')
  @HttpCode(200)
  @ZodResponse({ type: AccessTokenResponseDto })
  async login(
    @Body() body: LoginDto,
    @Req() req: Request,
    @Res({ passthrough: true }) res: Response,
  ) {
    const session = await this.auth.login(body, contextOf(req));
    res.cookie(REFRESH_COOKIE, session.refreshToken, this.cookieOptions());
    return session.response;
  }

  @Public() // authenticated by the refresh cookie, not by an access token
  @Throttle({ default: { limit: 30, ttl: 60_000 } })
  @Post('refresh')
  @HttpCode(200)
  @ZodResponse({ type: AccessTokenResponseDto })
  async refresh(@Req() req: Request, @Res({ passthrough: true }) res: Response) {
    try {
      const session = await this.auth.refresh(readRefreshCookie(req), contextOf(req));
      res.cookie(REFRESH_COOKIE, session.refreshToken, this.cookieOptions());
      return session.response;
    } catch (e) {
      res.clearCookie(REFRESH_COOKIE, { ...this.cookieOptions(), maxAge: undefined });
      throw e;
    }
  }

  @Public() // must work with an expired access token
  @Post('logout')
  @HttpCode(204)
  @ApiNoContentResponse()
  async logout(@Req() req: Request, @Res({ passthrough: true }) res: Response): Promise<void> {
    await this.auth.logout(readRefreshCookie(req));
    res.clearCookie(REFRESH_COOKIE, { ...this.cookieOptions(), maxAge: undefined });
  }

  @AnyAuthenticated()
  @ApiBearerAuth()
  @Get('me')
  @ZodResponse({ type: AuthUserDto })
  me(@CurrentUser() principal: AuthPrincipal) {
    return this.auth.me(principal.id);
  }

  /**
   * httpOnly: JS (and so XSS) can't read it. SameSite=strict: not sent on cross-site
   * requests (CSRF). Path-scoped: only sent to /api/auth/*, not to every API call.
   */
  private cookieOptions(): CookieOptions {
    return {
      httpOnly: true,
      secure: this.config.get('COOKIE_SECURE'),
      sameSite: 'strict',
      path: REFRESH_COOKIE_PATH,
      maxAge: this.config.get('REFRESH_TOKEN_TTL_DAYS') * 24 * 60 * 60 * 1000,
    };
  }
}
