import type { GoodsReceipt, PurchaseOrder } from '@procurestack/shared';
import { CLOCK } from '../../src/common/clock';
import { type Cast, cast, issuedPo, item, supplier, TestClock } from './fixtures';
import { createHttpApp, type HttpApp } from './http-app';

describe('Goods receipts (HTTP + Postgres)', () => {
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

  const receive = (po: PurchaseOrder, received: number, rejected = 0, reason?: string) =>
    t.as(c.warehouse).post('/api/goods-receipts', {
      poId: po.id,
      deliveryNote: 'DN-4711',
      lines: [
        {
          poLineId: po.lines[0]!.id,
          receivedQuantity: received,
          rejectedQuantity: rejected,
          ...(reason ? { rejectionReason: reason } : {}),
        },
      ],
    });

  const fetchPo = async (id: string) =>
    (await t.as(c.buyer).get(`/api/purchase-orders/${id}`).expect(200)).body as PurchaseOrder;

  it('partial then final receipt moves the PO to RECEIVED, audited', async () => {
    const po = await issuedPo(t, c, clock, de, [
      { itemId: await item(t, c, 500), quantity: 10, unitPriceCents: 500 },
    ]);

    const gr = (await receive(po, 6, 1, 'dented').expect(201)).body as GoodsReceipt;
    expect(gr).toMatchObject({
      number: expect.any(String) as string,
      po: { id: po.id },
      receivedBy: { id: c.warehouse.id },
      lines: [{ receivedQuantity: 6, rejectedQuantity: 1, acceptedQuantity: 5 }],
    });
    let after = await fetchPo(po.id);
    expect(after).toMatchObject({ status: 'PARTIALLY_RECEIVED', lines: [{ receivedQuantity: 5 }] });

    await receive(po, 5).expect(201);
    after = await fetchPo(po.id);
    expect(after).toMatchObject({ status: 'RECEIVED', lines: [{ receivedQuantity: 10 }] });

    const audits = await t.prisma.auditLog.findMany({
      where: { action: 'GR_POSTED', actorId: c.warehouse.id },
    });
    expect(audits.length).toBeGreaterThanOrEqual(2);

    const list = (await t.as(c.finance).get(`/api/goods-receipts?poId=${po.id}`).expect(200))
      .body as GoodsReceipt[];
    expect(list).toHaveLength(2);
  });

  it('refuses over-delivery and receipts on a fully received PO', async () => {
    const po = await issuedPo(t, c, clock, de, [
      { itemId: await item(t, c, 500), quantity: 2, unitPriceCents: 500 },
    ]);
    expect((await receive(po, 3).expect(422)).body).toMatchObject({ code: 'GR_OVER_DELIVERY' });
    await receive(po, 3, 1, 'over-delivery').expect(201);
    expect((await receive(po, 1).expect(409)).body).toMatchObject({ code: 'GR_PO_NOT_OPEN' });
  });

  it('only the warehouse posts, and a buyer-warehouse cannot receive own PO (SoD)', async () => {
    const po = await issuedPo(t, c, clock, de, [
      { itemId: await item(t, c, 500), quantity: 2, unitPriceCents: 500 },
    ]);
    await t
      .as(c.buyer)
      .post('/api/goods-receipts', {
        poId: po.id,
        deliveryNote: 'DN',
        lines: [{ poLineId: po.lines[0]!.id, receivedQuantity: 1 }],
      })
      .expect(403);

    const dual = await t.user(['BUYER', 'WAREHOUSE']);
    const own = await issuedPo(t, { ...c, buyer: dual }, clock, de, [
      { itemId: await item(t, c, 500), quantity: 2, unitPriceCents: 500 },
    ]);
    const res = await t
      .as(dual)
      .post('/api/goods-receipts', {
        poId: own.id,
        deliveryNote: 'DN',
        lines: [{ poLineId: own.lines[0]!.id, receivedQuantity: 1 }],
      })
      .expect(403);
    expect(res.body).toMatchObject({ code: 'GR_SOD_BUYER_RECEIVER' });
  });

  it('receipts are immutable at the database level', async () => {
    const gr = await t.prisma.goodsReceipt.findFirstOrThrow();
    await expect(
      t.prisma.goodsReceipt.update({ where: { id: gr.id }, data: { deliveryNote: 'forged' } }),
    ).rejects.toThrow();
  });
});
