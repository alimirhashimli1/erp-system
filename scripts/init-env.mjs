// Creates .env from .env.example, replacing every __GENERATE__ with a strong random secret.
// Refuses to overwrite an existing .env (pass --force to regenerate everything).
import { randomBytes } from 'node:crypto';
import { existsSync, readFileSync, writeFileSync } from 'node:fs';

const target = new URL('../.env', import.meta.url);
if (existsSync(target) && !process.argv.includes('--force')) {
  console.log('.env already exists — leaving it untouched (use --force to regenerate).');
  process.exit(0);
}

const values = {};
const lines = readFileSync(new URL('../.env.example', import.meta.url), 'utf8')
  .split('\n')
  .map((line) => {
    const match = /^([A-Z0-9_]+)=__GENERATE__$/.exec(line);
    if (!match) return line;
    // hex keeps DB/Redis passwords URL-safe inside connection strings
    values[match[1]] = randomBytes(match[1] === 'SEED_DEFAULT_PASSWORD' ? 9 : 32).toString('hex');
    return `${match[1]}=${values[match[1]]}`;
  });

// Inline ${VAR} references so every consumer (Nest, Prisma, Compose) reads literal values.
const output = lines.join('\n').replace(/\$\{([A-Z0-9_]+)\}/g, (ref, name) => values[name] ?? ref);
writeFileSync(target, output, { mode: 0o600 });

console.log('Created .env with fresh secrets.');
console.log(`Demo login password (all seeded users): ${values.SEED_DEFAULT_PASSWORD}`);
