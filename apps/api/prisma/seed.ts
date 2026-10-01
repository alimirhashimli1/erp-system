/**
 * Dev seed: one user per procurement role. Idempotent (upsert), safe to re-run.
 * The password comes from SEED_DEFAULT_PASSWORD — never hardcoded here.
 */
import { PrismaPg } from '@prisma/adapter-pg';
import * as argon2 from 'argon2';
import { PrismaClient, type Role } from '../src/generated/prisma/client';

try {
  process.loadEnvFile('../../.env');
} catch {
  // containers: variables come from the environment
}

const { DATABASE_URL, SEED_DEFAULT_PASSWORD } = process.env;
if (!DATABASE_URL || !SEED_DEFAULT_PASSWORD) {
  throw new Error('DATABASE_URL and SEED_DEFAULT_PASSWORD must be set to seed');
}

const users: { email: string; fullName: string; roles: Role[] }[] = [
  { email: 'requester@procurestack.dev', fullName: 'Rita Requester', roles: ['REQUESTER'] },
  { email: 'approver@procurestack.dev', fullName: 'Aaron Approver', roles: ['APPROVER'] },
  { email: 'buyer@procurestack.dev', fullName: 'Bea Buyer', roles: ['BUYER'] },
  { email: 'warehouse@procurestack.dev', fullName: 'Walt Warehouse', roles: ['WAREHOUSE'] },
  { email: 'finance@procurestack.dev', fullName: 'Fiona Finance', roles: ['FINANCE'] },
  { email: 'admin@procurestack.dev', fullName: 'Ada Admin', roles: ['ADMIN'] },
];

async function main(databaseUrl: string, seedPassword: string): Promise<void> {
  const prisma = new PrismaClient({ adapter: new PrismaPg({ connectionString: databaseUrl }) });
  try {
    const passwordHash = await argon2.hash(seedPassword, { type: argon2.argon2id });
    for (const u of users) {
      await prisma.user.upsert({
        where: { email: u.email },
        update: { fullName: u.fullName, roles: u.roles },
        create: { ...u, passwordHash },
      });
    }
    console.log(`Seeded ${users.length} users`);
  } finally {
    await prisma.$disconnect();
  }
}

void main(DATABASE_URL, SEED_DEFAULT_PASSWORD);
