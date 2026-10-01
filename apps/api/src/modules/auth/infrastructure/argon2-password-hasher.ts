import { Injectable } from '@nestjs/common';
import * as argon2 from 'argon2';
import type { PasswordHasher } from '../application/ports';

/**
 * argon2id: memory-hard, so GPU/ASIC brute force is expensive. Parameters follow the
 * OWASP Password Storage Cheat Sheet baseline (19 MiB memory, 2 iterations, 1 lane).
 */
@Injectable()
export class Argon2PasswordHasher implements PasswordHasher {
  hash(plain: string): Promise<string> {
    return argon2.hash(plain, {
      type: argon2.argon2id,
      memoryCost: 19456,
      timeCost: 2,
      parallelism: 1,
    });
  }

  async verify(hash: string, plain: string): Promise<boolean> {
    try {
      return await argon2.verify(hash, plain);
    } catch {
      return false; // malformed hash → treat as mismatch, never as a 500
    }
  }
}
