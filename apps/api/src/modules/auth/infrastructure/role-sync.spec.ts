import { ROLES } from '@procurestack/shared';
import { Role as PrismaRole } from '../../../generated/prisma/enums';

// The DB enum and the shared Zod enum are two definitions of one concept. This test is
// the contract that keeps them from drifting (e.g. a migration adding a role but not the UI).
describe('Role enum sync', () => {
  it('Prisma Role enum matches @procurestack/shared ROLES exactly', () => {
    expect(Object.values(PrismaRole).sort()).toEqual([...ROLES].sort());
  });
});
