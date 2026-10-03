import type { Requisition, Rfx } from '@procurestack/shared';
import type { Clock } from '../../src/common/clock';
import { type HttpApp, type TestUser, uniq } from './http-app';

/** Controllable clock for deadline tests: starts at real "now", moves only when told. */
export class TestClock implements Clock {
  private current = new Date();
  now = () => new Date(this.current);
  today = () => this.current.toISOString().slice(0, 10);
  advance(ms: number): void {
    this.current = new Date(this.current.getTime() + ms);
  }
}

export interface Cast {
  requester: TestUser;
  approver: TestUser; // DoA level 3: one person can approve any small PR
  buyer: TestUser;
  finance: TestUser;
  warehouse: TestUser;
}

export async function cast(t: HttpApp): Promise<Cast> {
  const [requester, approver, buyer, finance, warehouse] = await Promise.all([
    t.user(['REQUESTER']),
    t.user(['APPROVER'], 3),
    t.user(['BUYER']),
    t.user(['FINANCE']),
    t.user(['WAREHOUSE']),
  ]);
  return { requester, approver, buyer, finance, warehouse };
}

const idOf = (res: { body: unknown }) => (res.body as { id: string }).id;

export async function supplier(t: HttpApp, c: Cast, countryCode: string): Promise<string> {
  return idOf(
    await t
      .as(c.buyer)
      .post('/api/suppliers', {
        code: `S-${uniq()}`,
        name: `Supplier ${countryCode}`,
        countryCode,
        email: 'bids@supplier.example',
      })
      .expect(201),
  );
}

export async function item(t: HttpApp, c: Cast, standardPriceCents: number): Promise<string> {
  return idOf(
    await t
      .as(c.buyer)
      .post('/api/items', {
        sku: `I-${uniq()}`,
        description: 'Fixture item',
        uom: 'EA',
        category: 'Test',
        standardPriceCents,
      })
      .expect(201),
  );
}

/** A fully approved PR with one line per item (requester → submit → approve). */
export async function approvedRequisition(
  t: HttpApp,
  c: Cast,
  lines: { itemId: string; quantity: number; unitPriceCents: number }[],
): Promise<Requisition> {
  const costCenterId = idOf(
    await t
      .as(c.finance)
      .post('/api/cost-centers', { code: `CC-${uniq()}`, name: 'Fixture' })
      .expect(201),
  );
  const draft = await t
    .as(c.requester)
    .post('/api/requisitions', {
      title: 'Fixture requisition',
      justification: 'Integration test',
      costCenterId,
      needByDate: '2099-12-31',
      lines,
    })
    .expect(201);
  await t
    .as(c.requester)
    .post(`/api/requisitions/${idOf(draft)}/submit`)
    .expect(200);
  // Small totals need only L1; a level-3 approver can take any step.
  let pr = (await t.as(c.requester).get(`/api/requisitions/${idOf(draft)}`)).body as Requisition;
  while (pr.status === 'SUBMITTED') {
    pr = (
      await t
        .as(c.approver)
        .post(`/api/requisitions/${pr.id}/decision`, { decision: 'APPROVED' })
        .expect(200)
    ).body as Requisition;
  }
  return pr;
}

/** Awarded RFQ: one supplier bids on every line of the PR and wins. */
export async function awardedRfx(
  t: HttpApp,
  c: Cast,
  clock: TestClock,
  pr: Requisition,
  supplierId: string,
  bid: { unitPriceCents: number; incoterm?: string } = { unitPriceCents: 100 },
): Promise<Rfx> {
  const other = await supplier(t, c, 'DE');
  const rfx = (
    await t
      .as(c.buyer)
      .post('/api/rfx', {
        type: 'RFQ',
        title: 'Fixture RFQ',
        responseDeadline: new Date(clock.now().getTime() + 86_400_000).toISOString(),
        prLineIds: pr.lines.map((l) => l.id),
        supplierIds: [supplierId, other],
      })
      .expect(201)
  ).body as Rfx;
  await t.as(c.buyer).post(`/api/rfx/${rfx.id}/publish`).expect(200);
  await t
    .as(c.buyer)
    .post(`/api/rfx/${rfx.id}/bids`, {
      supplierId,
      incoterm: bid.incoterm ?? 'DAP',
      leadTimeDays: 10,
      validUntil: '2099-12-31',
      lines: rfx.lines.map((l) => ({ rfxLineId: l.id, unitPriceCents: bid.unitPriceCents })),
    })
    .expect(200);
  await t.as(c.buyer).post(`/api/rfx/${rfx.id}/close`).expect(200);
  const evaluated = (await t.as(c.buyer).post(`/api/rfx/${rfx.id}/evaluate`).expect(200))
    .body as Rfx;
  return (
    await t
      .as(c.buyer)
      .post(`/api/rfx/${rfx.id}/award`, {
        awards: evaluated.evaluation!.lines.map((l) => ({
          rfxLineId: l.rfxLineId,
          bidLineId: l.offers[0]!.bidLineId,
        })),
      })
      .expect(200)
  ).body as Rfx;
}
