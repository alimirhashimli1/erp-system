import type { OpenPrLine, PurchaseOrder, Rfx } from '@procurestack/shared';
import { CLOCK } from '../../src/common/clock';
import {
  approvedRequisition,
  awardedRfx,
  type Cast,
  cast,
  item,
  supplier,
  TestClock,
} from './fixtures';
import { createHttpApp, type HttpApp } from './http-app';

describe('Purchase orders (HTTP + Postgres)', () => {
  const clock = new TestClock();
  let t: HttpApp;
  let c: Cast;
  let de: string;

  beforeAll(async () => {
    t = await createHttpApp((b) => b.overrideProvider(CLOCK).useValue(clock));
    c = await cast(t);
    de = await supplier(t, c, 'DE');
  });

  afterAll(() => t.close());

  const createPos = (rfx: Rfx) =>
    t.as(c.buyer).post(`/api/purchase-orders/from-rfx/${rfx.id}`, { namedPlace: 'Hamburg plant' });

  it('creates, issues, acknowledges a PO traced back to the PR and the award', async () => {
    const pr = await approvedRequisition(t, c, [
      { itemId: await item(t, c, 1_000), quantity: 4, unitPriceCents: 1_000 },
    ]);
    const rfx = await awardedRfx(t, c, clock, pr, de, { unitPriceCents: 1_050 });

    const [po] = (await createPos(rfx).expect(201)).body as PurchaseOrder[];
    expect(po).toMatchObject({
      status: 'DRAFT',
      totalCents: 4_200,
      incoterm: 'DAP',
      supplier: { id: de },
      rfx: { id: rfx.id },
      lines: [{ prLineId: pr.lines[0]!.id, prNumber: pr.number, quantity: 4 }],
    });
    // The award is consumed: a second run has nothing left to order.
    const again = await createPos(rfx).expect(409);
    expect(again.body).toMatchObject({ code: 'PO_NOTHING_TO_ORDER' });

    const issued = (await t.as(c.buyer).post(`/api/purchase-orders/${po!.id}/issue`).expect(200))
      .body as PurchaseOrder;
    expect(issued.status).toBe('ISSUED');
    expect(issued.expectedDeliveryDate).toMatch(/^\d{4}-\d{2}-\d{2}$/);
    const audit = await t.prisma.auditLog.findFirstOrThrow({
      where: { entityId: po!.id, action: 'PO_ISSUED' },
    });
    expect(audit).toMatchObject({ actorId: c.buyer.id, after: { totalCents: 4_200 } });

    const acked = (
      await t
        .as(c.buyer)
        .post(`/api/purchase-orders/${po!.id}/acknowledge`, { confirmedDeliveryDate: '2099-03-01' })
        .expect(200)
    ).body as PurchaseOrder;
    expect(acked).toMatchObject({ status: 'ACKNOWLEDGED', expectedDeliveryDate: '2099-03-01' });
  });

  it('cancelling frees the PR line, which can be sourced and ordered again', async () => {
    const pr = await approvedRequisition(t, c, [
      { itemId: await item(t, c, 500), quantity: 2, unitPriceCents: 500 },
    ]);
    const prLineId = pr.lines[0]!.id;
    const [po] = (
      await createPos(await awardedRfx(t, c, clock, pr, de, { unitPriceCents: 500 })).expect(201)
    ).body as PurchaseOrder[];
    await t
      .as(c.buyer)
      .post(`/api/purchase-orders/${po!.id}/cancel`, { reason: 'Supplier went bankrupt' })
      .expect(200);

    const backlog = (await t.as(c.buyer).get('/api/sourcing/open-pr-lines')).body as OpenPrLine[];
    expect(backlog.map((l) => l.prLineId)).toContain(prLineId);

    // Second PO for the same PR line is allowed because the first is no longer live.
    const rfx2 = await awardedRfx(t, c, clock, pr, await supplier(t, c, 'PL'), {
      unitPriceCents: 520,
    });
    const [po2] = (await createPos(rfx2).expect(201)).body as PurchaseOrder[];
    expect(po2!.lines[0]!.prLineId).toBe(prLineId);
    const live = await t.prisma.poLine.count({ where: { activePrLineId: prLineId } });
    expect(live).toBe(1);
  });

  it('enforces SoD: a buyer cannot issue a PO for goods they requested themselves', async () => {
    const dual = await t.user(['REQUESTER', 'BUYER']);
    const pr = await approvedRequisition(
      t,
      c,
      [{ itemId: await item(t, c, 100), quantity: 1, unitPriceCents: 100 }],
      dual,
    );
    const [po] = (await createPos(await awardedRfx(t, c, clock, pr, de)).expect(201))
      .body as PurchaseOrder[];
    const res = await t.as(dual).post(`/api/purchase-orders/${po!.id}/issue`).expect(403);
    expect(res.body).toMatchObject({ code: 'PO_SOD_REQUESTER_ISSUER' });
  });

  it('refuses to issue a PO more than 10 % above the approved PR value', async () => {
    const pr = await approvedRequisition(t, c, [
      { itemId: await item(t, c, 100), quantity: 10, unitPriceCents: 100 },
    ]);
    const [po] = (
      await createPos(await awardedRfx(t, c, clock, pr, de, { unitPriceCents: 111 })).expect(201)
    ).body as PurchaseOrder[];
    const res = await t.as(c.buyer).post(`/api/purchase-orders/${po!.id}/issue`).expect(422);
    expect(res.body).toMatchObject({ code: 'PO_EXCEEDS_APPROVED_BUDGET' });
  });

  it('lets the warehouse read POs but not change them', async () => {
    const list = await t.as(c.warehouse).get('/api/purchase-orders').expect(200);
    const first = (list.body as { id: string }[])[0]!;
    await t.as(c.warehouse).post(`/api/purchase-orders/${first.id}/close`).expect(403);
    await t.as(c.requester).get('/api/purchase-orders').expect(403);
  });
});
