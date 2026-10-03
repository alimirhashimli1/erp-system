/**
 * Dev seed: one user per procurement role plus a small, realistic master-data set.
 * Idempotent (upsert by business key), safe to re-run.
 * The password comes from SEED_DEFAULT_PASSWORD — never hardcoded here.
 */
import { PrismaPg } from '@prisma/adapter-pg';
import * as argon2 from 'argon2';
import { PrismaClient, type Role, type Uom } from '../src/generated/prisma/client';

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

// Countries chosen to make later lessons interesting: EU vs non-EU duties (Incoterms,
// landed cost) and LkSG country risk (Phase 4).
const suppliers = [
  {
    code: 'SUP-0001',
    name: 'Rhein Fasteners GmbH',
    countryCode: 'DE',
    email: 'sales@rhein-fasteners.example',
  },
  {
    code: 'SUP-0002',
    name: 'Shenzhen Precision Parts Co.',
    countryCode: 'CN',
    email: 'export@szprecision.example',
  },
  {
    code: 'SUP-0003',
    name: 'Polska Packaging Sp. z o.o.',
    countryCode: 'PL',
    email: 'biuro@polpack.example',
  },
  {
    code: 'SUP-0004',
    name: 'Midwest Industrial Supply Inc.',
    countryCode: 'US',
    email: 'orders@midwest-ind.example',
  },
  {
    code: 'SUP-0005',
    name: 'Pune Castings Pvt. Ltd.',
    countryCode: 'IN',
    email: 'sales@punecastings.example',
  },
];

const items: {
  sku: string;
  description: string;
  uom: Uom;
  category: string;
  standardPriceCents: bigint;
}[] = [
  {
    sku: 'BOLT-M8X40',
    description: 'Hex bolt M8×40, 8.8, zinc plated',
    uom: 'EA',
    category: 'Fasteners',
    standardPriceCents: 12n,
  },
  {
    sku: 'NUT-M8',
    description: 'Hex nut M8, class 8',
    uom: 'EA',
    category: 'Fasteners',
    standardPriceCents: 4n,
  },
  {
    sku: 'STEEL-S235',
    description: 'Steel sheet S235JR, 2 mm',
    uom: 'KG',
    category: 'Raw material',
    standardPriceCents: 95n,
  },
  {
    sku: 'CABLE-NYM3',
    description: 'Installation cable NYM-J 3×1.5',
    uom: 'M',
    category: 'Electrical',
    standardPriceCents: 89n,
  },
  {
    sku: 'OIL-HLP46',
    description: 'Hydraulic oil HLP 46',
    uom: 'L',
    category: 'MRO',
    standardPriceCents: 420n,
  },
  {
    sku: 'BOX-CARTON-L',
    description: 'Shipping carton 600×400×400, 25 pcs',
    uom: 'BOX',
    category: 'Packaging',
    standardPriceCents: 3_150n,
  },
  {
    sku: 'PUMP-HYD-20',
    description: 'Hydraulic gear pump 20 cc',
    uom: 'EA',
    category: 'Spare parts',
    standardPriceCents: 48_500n,
  },
];

const costCenters = [
  { code: 'CC-1000', name: 'Production' },
  { code: 'CC-2000', name: 'Maintenance' },
  { code: 'CC-3000', name: 'Logistics' },
  { code: 'CC-9000', name: 'IT & Administration' },
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
    for (const sup of suppliers) {
      await prisma.supplier.upsert({ where: { code: sup.code }, update: {}, create: sup });
    }
    for (const item of items) {
      await prisma.item.upsert({ where: { sku: item.sku }, update: {}, create: item });
    }
    for (const cc of costCenters) {
      await prisma.costCenter.upsert({ where: { code: cc.code }, update: {}, create: cc });
    }
    console.log(
      `Seeded ${users.length} users, ${suppliers.length} suppliers, ${items.length} items, ${costCenters.length} cost centers`,
    );
  } finally {
    await prisma.$disconnect();
  }
}

void main(DATABASE_URL, SEED_DEFAULT_PASSWORD);
