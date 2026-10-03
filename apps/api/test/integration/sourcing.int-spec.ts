import type { OpenPrLine, Requisition, Rfx } from '@procurestack/shared';
import { CLOCK } from '../../src/common/clock';
import { SourcingService } from '../../src/modules/sourcing/application/sourcing.service';
import { approvedRequisition, type Cast, cast, item, supplier, TestClock } from './fixtures';
import { createHttpApp, type HttpApp } from './http-app';

const DAY = 86_400_000;

describe('Sourcing / RFx (HTTP + Postgres)', () => {
  const clock = new TestClock();
  let t: HttpApp;
  let c: Cast;
  let de: string;
  let cn: string;
  let pr: Requisition;

  beforeAll(async () => {
    t = await createHttpApp((b) => b.overrideProvider(CLOCK).useValue(clock));
    c = await cast(t);
    [de, cn] = await Promise.all([supplier(t, c, 'DE'), supplier(t, c, 'CN')]);
    const bolt = await item(t, c, 12);
    pr = await approvedRequisition(t, c, [{ itemId: bolt, quantity: 10_000, unitPriceCents: 12 }]);
  });

  afterAll(() => t.close());

  const deadline = () => new Date(clock.now().getTime() + 7 * DAY).toISOString();
  const createRfq = (prLineIds: string[], supplierIds = [de, cn]) =>
    t.as(c.buyer).post('/api/rfx', {
      type: 'RFQ',
      title: 'M8 bolts 2027',
      responseDeadline: deadline(),
      prLineIds,
      supplierIds,
    });

  it('runs a sealed RFQ end to end and awards on landed cost, not unit price', async () => {
    const backlog = (await t.as(c.buyer).get('/api/sourcing/open-pr-lines').expect(200))
      .body as OpenPrLine[];
    const prLineId = pr.lines[0]!.id;
    expect(backlog.map((l) => l.prLineId)).toContain(prLineId);

    const rfx = (await createRfq([prLineId]).expect(201)).body as Rfx;
    expect(rfx.status).toBe('DRAFT');
    expect(rfx.number).toMatch(/^RFX-\d{6}$/);
    // The PR line is claimed: no second event can source it.
    const dup = await createRfq([prLineId]).expect(422);
    expect(dup.body).toMatchObject({ code: 'RFX_PR_LINE_UNAVAILABLE' });

    await t.as(c.buyer).post(`/api/rfx/${rfx.id}/publish`).expect(200);
    const lineId = rfx.lines[0]!.id;
    // DE: €0.12 delivered. CN: €0.09 FOB + freight/insurance/duty/handling → dearer landed.
    await t
      .as(c.buyer)
      .post(`/api/rfx/${rfx.id}/bids`, {
        supplierId: de,
        incoterm: 'DAP',
        leadTimeDays: 10,
        validUntil: '2099-12-31',
        lines: [{ rfxLineId: lineId, unitPriceCents: 12 }],
      })
      .expect(200);
    const sealed = (
      await t
        .as(c.buyer)
        .post(`/api/rfx/${rfx.id}/bids`, {
          supplierId: cn,
          incoterm: 'FOB',
          leadTimeDays: 45,
          validUntil: '2099-12-31',
          freightCents: 15_000,
          insuranceCents: 500,
          dutyRateBps: 450,
          destinationHandlingCents: 25_000,
          lines: [{ rfxLineId: lineId, unitPriceCents: 9 }],
        })
        .expect(200)
    ).body as Rfx;
    // Sealed bids: nobody sees prices before the close.
    expect(sealed).toMatchObject({ sealed: true, bids: [], evaluation: null, respondedCount: 2 });

    // After the deadline: late bids bounce, the deadline job closes the event.
    clock.advance(8 * DAY);
    const late = await t
      .as(c.buyer)
      .post(`/api/rfx/${rfx.id}/bids`, {
        supplierId: de,
        incoterm: 'DAP',
        leadTimeDays: 5,
        validUntil: '2099-12-31',
        lines: [{ rfxLineId: lineId, unitPriceCents: 1 }],
      })
      .expect(422);
    expect(late.body).toMatchObject({ code: 'RFX_LATE_BID' });
    await t.moduleRef.get(SourcingService).closeIfDue(rfx.id);

    const closed = (await t.as(c.buyer).get(`/api/rfx/${rfx.id}`).expect(200)).body as Rfx;
    expect(closed.status).toBe('CLOSED');
    const offers = closed.evaluation!.lines[0]!.offers;
    expect(offers.map((o) => [o.supplier.id, o.landedCents, o.rank])).toEqual([
      [de, 120_000, 1],
      [cn, 135_248, 2],
    ]);

    await t.as(c.buyer).post(`/api/rfx/${rfx.id}/evaluate`).expect(200);
    const toCn = { awards: [{ rfxLineId: lineId, bidLineId: offers[1]!.bidLineId }] };
    const noReason = await t.as(c.buyer).post(`/api/rfx/${rfx.id}/award`, toCn).expect(422);
    expect(noReason.body).toMatchObject({ code: 'RFX_AWARD_JUSTIFICATION_REQUIRED' });

    const awarded = (
      await t
        .as(c.buyer)
        .post(`/api/rfx/${rfx.id}/award`, {
          ...toCn,
          justification: 'Second source to de-risk the EU supplier capacity',
        })
        .expect(200)
    ).body as Rfx;
    expect(awarded.lines[0]!.awardedBidLineId).toBe(offers[1]!.bidLineId);

    const prLine = await t.prisma.prLine.findUniqueOrThrow({ where: { id: prLineId } });
    expect(prLine.sourcingStatus).toBe('AWARDED');
    const audit = await t.prisma.auditLog.findMany({
      where: { entityId: rfx.id },
      orderBy: { seq: 'asc' },
    });
    expect(audit.map((a) => a.action)).toEqual([
      'RFX_CREATED',
      'RFX_PUBLISHED',
      'RFX_BID_RECORDED',
      'RFX_BID_RECORDED',
      'RFX_CLOSED',
      'RFX_EVALUATED',
      'RFX_AWARDED',
    ]);
    // The deadline close was done by the system, not a person.
    expect(audit.find((a) => a.action === 'RFX_CLOSED')?.actorId).toBeNull();
    expect(audit.at(-1)?.metadata).toMatchObject({ deviations: [{ chosenRank: 2 }] });
  });

  it('lets simulated suppliers respond (demo job handler) and is idempotent', async () => {
    const extra = await approvedRequisition(t, c, [
      { itemId: await item(t, c, 500), quantity: 20, unitPriceCents: 500 },
    ]);
    const rfx = (await createRfq([extra.lines[0]!.id]).expect(201)).body as Rfx;
    await t.as(c.buyer).post(`/api/rfx/${rfx.id}/publish`).expect(200);

    const sourcing = t.moduleRef.get(SourcingService);
    for (const s of [de, cn]) {
      await sourcing.simulateSupplierResponse(rfx.id, s);
      await sourcing.simulateSupplierResponse(rfx.id, s); // retried job: no second bid
    }
    const after = await t.prisma.rfxInvitation.findMany({ where: { rfxId: rfx.id } });
    expect(after.every((i) => i.status !== 'INVITED')).toBe(true);
    const bids = await t.prisma.rfxBid.findMany({ where: { rfxId: rfx.id } });
    expect(bids.every((b) => b.source === 'SIMULATED')).toBe(true);
    expect(bids.length).toBe(after.filter((i) => i.status === 'RESPONDED').length);
  });

  it('cancelling releases the PR lines back to the backlog', async () => {
    const extra = await approvedRequisition(t, c, [
      { itemId: await item(t, c, 100), quantity: 1, unitPriceCents: 100 },
    ]);
    const prLineId = extra.lines[0]!.id;
    const rfx = (await createRfq([prLineId]).expect(201)).body as Rfx;
    await t.as(c.buyer).post(`/api/rfx/${rfx.id}/cancel`).expect(200);
    const backlog = (await t.as(c.buyer).get('/api/sourcing/open-pr-lines')).body as OpenPrLine[];
    expect(backlog.map((l) => l.prLineId)).toContain(prLineId);
  });

  it('enforces competition and RBAC', async () => {
    const extra = await approvedRequisition(t, c, [
      { itemId: await item(t, c, 100), quantity: 1, unitPriceCents: 100 },
    ]);
    const single = (await createRfq([extra.lines[0]!.id], [de]).expect(201)).body as Rfx;
    const res = await t.as(c.buyer).post(`/api/rfx/${single.id}/publish`).expect(422);
    expect(res.body).toMatchObject({ code: 'RFX_TOO_FEW_SUPPLIERS' });

    await t.as(c.requester).get('/api/rfx').expect(403);
    await t.as(c.finance).get('/api/rfx').expect(200);
    await t.as(c.finance).post(`/api/rfx/${single.id}/cancel`).expect(403);
  });
});
