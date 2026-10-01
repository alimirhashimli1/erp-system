import { AccessTokenResponseSchema, AuthUserSchema, LoginSchema } from '@procurestack/shared';
import { createZodDto } from 'nestjs-zod';

// DTO classes are generated from the shared Zod schemas: one definition drives
// request validation, response serialization, Swagger docs and the web client's types.
export class LoginDto extends createZodDto(LoginSchema) {}
export class AuthUserDto extends createZodDto(AuthUserSchema) {}
export class AccessTokenResponseDto extends createZodDto(AccessTokenResponseSchema) {}
