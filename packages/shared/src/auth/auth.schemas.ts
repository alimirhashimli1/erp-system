import { z } from 'zod';
import { RoleSchema } from './roles';

export const LoginSchema = z.object({
  email: z
    .email()
    .max(254)
    .transform((e) => e.toLowerCase()),
  // Upper bound prevents hash-DoS with multi-megabyte passwords.
  password: z.string().min(1, 'Password is required').max(128),
});
/** Form-side (pre-transform) and server-side (post-transform) shapes. */
export type LoginInput = z.input<typeof LoginSchema>;
export type LoginCredentials = z.output<typeof LoginSchema>;

export const AuthUserSchema = z.object({
  id: z.uuid(),
  email: z.email(),
  fullName: z.string(),
  roles: z.array(RoleSchema),
});
export type AuthUser = z.infer<typeof AuthUserSchema>;

/** Refresh token travels in an httpOnly cookie, so only the access token is in the body. */
export const AccessTokenResponseSchema = z.object({
  accessToken: z.string(),
  expiresIn: z.number().int().positive(),
  user: AuthUserSchema,
});
export type AccessTokenResponse = z.infer<typeof AccessTokenResponseSchema>;
