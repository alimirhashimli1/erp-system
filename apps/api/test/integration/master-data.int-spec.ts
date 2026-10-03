import { createHttpApp, type HttpApp, type TestUser, uniq } from './http-app';

describe('Master data (HTTP + Postgres)', () => {
  let t: HttpApp;
  let buyer: TestUser;
  let finance: TestUser;
  let requester: TestUser;

  beforeAll(async () => {
    t = await createHttpApp();
    [buyer, finance, requester] = await Promise.all([
      t.user(['BUYER']),
      t.user(['FINANCE']),
      t.user(['REQUESTER']),
    ]);
  });

  afterAll(() => t.close());

  const supplierBody = (code = `SUP-${uniq()}`) => ({
    code,
    name: 'Acme Fasteners GmbH',
    countryCode: 'de',
    email: 'sales@acme.example',
  });

  it('lets a buyer create a supplier, normalizes input, and audits it', async () => {
    const res = await t.as(buyer).post('/api/suppliers', supplierBody()).expect(201);
    expect(res.body).toMatchObject({ countryCode: 'DE', isActive: true });

    const audit = await t.prisma.auditLog.findFirst({
      where: { entityType: 'Supplier', entityId: (res.body as { id: string }).id },
    });
    expect(audit).toMatchObject({ action: 'SUPPLIER_CREATED', actorId: buyer.id });
  });

  it('returns 409 with a stable code on a duplicate supplier code', async () => {
    const body = supplierBody();
    await t.as(buyer).post('/api/suppliers', body).expect(201);
    const res = await t.as(buyer).post('/api/suppliers', body).expect(409);
    expect(res.body).toMatchObject({ code: 'SUPPLIER_EXISTS' });
  });

  it('forbids a requester from creating suppliers but lets them read', async () => {
    await t.as(requester).post('/api/suppliers', supplierBody()).expect(403);
    await t.as(requester).get('/api/suppliers').expect(200);
  });

  it('enforces data ownership: cost centers belong to finance, not procurement', async () => {
    const body = { code: `CC-${uniq()}`, name: 'Maintenance' };
    await t.as(buyer).post('/api/cost-centers', body).expect(403);
    await t.as(finance).post('/api/cost-centers', body).expect(201);
  });

  it('stores money as exact cents and audits before/after on update', async () => {
    const sku = `SKU-${uniq()}`;
    const created = await t
      .as(buyer)
      .post('/api/items', {
        sku,
        description: 'M8 hex bolt',
        uom: 'EA',
        category: 'Fasteners',
        standardPriceCents: 9_007_199_254_740_991, // Number.MAX_SAFE_INTEGER survives BIGINT
      })
      .expect(201);
    const id = (created.body as { id: string }).id;
    expect(created.body).toMatchObject({ standardPriceCents: 9_007_199_254_740_991 });

    await t.as(buyer).patch(`/api/items/${id}`, { standardPriceCents: 42 }).expect(200);
    const audit = await t.prisma.auditLog.findFirstOrThrow({
      where: { entityId: id, action: 'ITEM_UPDATED' },
    });
    expect(audit.before).toMatchObject({ standardPriceCents: 9_007_199_254_740_991 });
    expect(audit.after).toMatchObject({ standardPriceCents: 42 });
  });

  it('hides inactive records by default and finds them on request', async () => {
    const created = await t.as(buyer).post('/api/suppliers', supplierBody()).expect(201);
    const { id, code } = created.body as { id: string; code: string };
    await t.as(buyer).patch(`/api/suppliers/${id}`, { isActive: false }).expect(200);

    const active = await t.as(buyer).get(`/api/suppliers?q=${code}`).expect(200);
    expect(active.body).toEqual([]);
    const all = await t.as(buyer).get(`/api/suppliers?q=${code}&includeInactive=true`).expect(200);
    expect(all.body).toHaveLength(1);
  });

  it('returns 404 for unknown ids and 400 for malformed ones', async () => {
    const res = await t
      .as(buyer)
      .get('/api/items/00000000-0000-4000-8000-000000000000')
      .expect(404);
    expect(res.body).toMatchObject({ code: 'ITEM_NOT_FOUND' });
    await t.as(buyer).get('/api/items/not-a-uuid').expect(400);
  });
});
