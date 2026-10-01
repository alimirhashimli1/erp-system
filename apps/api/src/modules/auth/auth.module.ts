import { Module } from '@nestjs/common';
import { APP_GUARD } from '@nestjs/core';
import { JwtModule } from '@nestjs/jwt';
import { AuthService } from './application/auth.service';
import { PASSWORD_HASHER, REFRESH_TOKEN_REPOSITORY, USER_REPOSITORY } from './application/ports';
import { TokenService } from './application/token.service';
import { AuthController } from './http/auth.controller';
import { JwtAuthGuard } from './http/guards/jwt-auth.guard';
import { RolesGuard } from './http/guards/roles.guard';
import { Argon2PasswordHasher } from './infrastructure/argon2-password-hasher';
import { PrismaRefreshTokenRepository } from './infrastructure/prisma-refresh-token.repository';
import { PrismaUserRepository } from './infrastructure/prisma-user.repository';

@Module({
  // Secret/options are passed per call in TokenService so they come from validated config.
  imports: [JwtModule.register({})],
  controllers: [AuthController],
  providers: [
    AuthService,
    TokenService,
    { provide: USER_REPOSITORY, useClass: PrismaUserRepository },
    { provide: REFRESH_TOKEN_REPOSITORY, useClass: PrismaRefreshTokenRepository },
    { provide: PASSWORD_HASHER, useClass: Argon2PasswordHasher },
    // Global guards, in order: authenticate every request, then authorize it.
    { provide: APP_GUARD, useClass: JwtAuthGuard },
    { provide: APP_GUARD, useClass: RolesGuard },
  ],
})
export class AuthModule {}
