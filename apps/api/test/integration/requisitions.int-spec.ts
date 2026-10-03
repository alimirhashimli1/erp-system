import type { Requisition } from '@procurestack/shared';
import { createHttpApp, type HttpApp, type TestUser, uniq } from './http-app';

describe('Purchase requisitions (HTTP + Postgres)', () => {
  let t: HttpApp;
  let rita: TestUser; // requester
  let otherRequester: TestUser;
  let lead: TestUser; // approval level 1
  let head: TestUser; // approval level 2
  let buyer: TestUser;
  let costCenterId: string;
  let pumpId: string; // €485.00 each
  let boltId: string; // €0.12 each

  beforeAll(async () => {
    t = await createHttpApp();
    [rita, otherRequester, lead, head, buyer] = await Promise.all([
      t.user(['REQUESTER']),
      t.user(['REQUESTER']),
      t.user(['APPROVER'], 1),
      t.user(['APPROVER'], 2),
      t.user(['BUYER']),
    ]);
    const finance = await t.user(['FINANCE']);
    costCenterId = (
      (await t.as(finance).post('/api/cost-centers', { code: `CC-${uniq()}`, name: 'Maint' }))
        .body as { id: string }
    ).id;
    const item = async (standardPriceCents: number) =>
      (
        (
          await t.as(buyer).post('/api/items', {
            sku: `SKU-${uniq()}`,
            description: 'Test item',
            uom: 'EA',
            category: 'Test',
            standardPriceCents,
          })
        ).body as { id: string }
      ).id;
    [pumpId, boltId] = await Promise.all([item(48_500), item(12)]);
  });

  afterAll(() => t.close());

  const draft = (quantity: number, itemId = pumpId) => ({
    title: 'Spare hydraulic pumps',
    justification: 'Line 3 pump failed twice this month',
    costCenterId,
    needByDate: '2099-01-31',
    lines: [{ itemId, quantity, unitPriceCents: 48_500 }],
  });

  const createDraft = async (quantity: number) =>
    (await t.as(rita).post('/api/requisitions', draft(quantity)).expect(201)).body as Requisition;

  const submit = async (id: string) =>
    (await t.as(rita).post(`/api/requisitions/${id}/submit`).expect(200)).body as Requisition;

  const decide = (u: TestUser, id: string, decision: string, comment?: string) =>
    t.as(u).post(`/api/requisitions/${id}/decision`, { decision, comment });

  it('creates a numbered draft with exact totals and snapshotted lines', async () => {
    const pr = await createDraft(2.5);
    expect(pr).toMatchObject({
      status: 'DRAFT',
      totalCents: 121_250, // 2.5 × €485.00
      requiredLevels: 0,
      pendingLevel: null,
      lines: [{ lineNo: 1, description: 'Test item', uom: 'EA', quantity: 2.5 }],
    });
    expect(pr.number).toMatch(/^PR-\d{6}$/);
  });

  it('routes a €29,100 PR through two levels with distinct approvers (DoA + SoD)', async () => {
    const pr = await submit((await createDraft(60)).id); // 60 × €485 = €29,100 → level 2
    expect(pr).toMatchObject({ status: 'SUBMITTED', requiredLevels: 2, pendingLevel: 1 });

    // Level-1 approver may not take level 2 afterwards; level 1 alone isn't enough.
    const afterL1 = (await decide(lead, pr.id, 'APPROVED').expect(200)).body as Requisition;
    expect(afterL1).toMatchObject({ status: 'SUBMITTED', pendingLevel: 2 });
    const denied = await decide(lead, pr.id, 'APPROVED').expect(403);
    expect(denied.body).toMatchObject({ code: 'PR_DUPLICATE_APPROVER' });

    const final = (await decide(head, pr.id, 'APPROVED').expect(200)).body as Requisition;
    expect(final).toMatchObject({ status: 'APPROVED', pendingLevel: null });
    expect(final.approvals.map((a) => [a.level, a.approver.id])).toEqual([
      [1, lead.id],
      [2, head.id],
    ]);

    const actions = await t.prisma.auditLog.findMany({
      where: { entityId: pr.id },
      orderBy: { seq: 'asc' },
      select: { action: true },
    });
    expect(actions.map((a) => a.action)).toEqual([
      'PR_SUBMITTED',
      'PR_LEVEL_APPROVED',
      'PR_APPROVED',
    ]);
  });

  it('blocks insufficient authority and self-approval', async () => {
    const big = await submit((await createDraft(60)).id);
    await decide(lead, big.id, 'APPROVED').expect(200);
    const res = await decide(
      await t.user(['APPROVER'], 1), // another team lead: not enough for level 2
      big.id,
      'APPROVED',
    ).expect(403);
    expect(res.body).toMatchObject({ code: 'PR_INSUFFICIENT_AUTHORITY' });

    // A person who is both requester and approver still can't approve their own PR.
    const dual = await t.user(['REQUESTER', 'APPROVER'], 3);
    const own = (await t.as(dual).post('/api/requisitions', draft(1)).expect(201))
      .body as Requisition;
    await t.as(dual).post(`/api/requisitions/${own.id}/submit`).expect(200);
    const self = await decide(dual, own.id, 'APPROVED').expect(403);
    expect(self.body).toMatchObject({ code: 'PR_SELF_APPROVAL' });
  });

  it('returns for rework, then a resubmission starts a fresh approval round', async () => {
    const pr = await submit((await createDraft(60)).id);
    await decide(lead, pr.id, 'APPROVED').expect(200);
    await decide(head, pr.id, 'RETURNED').expect(400); // comment required
    const returned = (await decide(head, pr.id, 'RETURNED', 'Split by quarter').expect(200))
      .body as Requisition;
    expect(returned.status).toBe('RETURNED');

    // Edit down to €970 → only level 1 needed now.
    const edited = (
      await t
        .as(rita)
        .put(`/api/requisitions/${pr.id}`, { ...draft(2), version: returned.version })
        .expect(200)
    ).body as Requisition;
    const resubmitted = await submit(edited.id);
    expect(resubmitted).toMatchObject({ requiredLevels: 1, approvalRound: 2, pendingLevel: 1 });
    // The level-1 approval from round 1 does not carry over; the same lead may approve again.
    await decide(lead, pr.id, 'APPROVED').expect(200);
  });

  it('rejects a stale edit (optimistic locking)', async () => {
    const pr = await createDraft(1);
    await t
      .as(rita)
      .put(`/api/requisitions/${pr.id}`, { ...draft(2), version: pr.version })
      .expect(200);
    const stale = await t
      .as(rita)
      .put(`/api/requisitions/${pr.id}`, { ...draft(3), version: pr.version })
      .expect(409);
    expect(stale.body).toMatchObject({ code: 'STALE_WRITE' });
  });

  it('applies row-level visibility: requesters see only their own PRs (404, not 403)', async () => {
    const pr = await createDraft(1);
    await t.as(otherRequester).get(`/api/requisitions/${pr.id}`).expect(404);
    const list = await t.as(otherRequester).get('/api/requisitions?scope=all').expect(200);
    expect((list.body as Requisition[]).some((r) => r.id === pr.id)).toBe(false);
    await t.as(buyer).get(`/api/requisitions/${pr.id}`).expect(200);
    await t.as(otherRequester).post(`/api/requisitions/${pr.id}/cancel`).expect(404);
  });

  it('builds the approver inbox from the DoA rules', async () => {
    const small = await submit((await createDraft(1)).id);
    const inbox = await t.as(lead).get('/api/requisitions?scope=awaiting-my-approval').expect(200);
    expect((inbox.body as Requisition[]).map((r) => r.id)).toContain(small.id);
    const ritaInbox = await t.as(rita).get('/api/requisitions?scope=awaiting-my-approval');
    expect(ritaInbox.body).toEqual([]);
  });

  it('refuses inactive master data and terminal-state transitions', async () => {
    await t.as(buyer).patch(`/api/items/${boltId}`, { isActive: false }).expect(200);
    const res = await t.as(rita).post('/api/requisitions', draft(1, boltId)).expect(422);
    expect(res.body).toMatchObject({ code: 'PR_ITEM_INVALID' });

    const pr = await createDraft(1);
    await t.as(rita).post(`/api/requisitions/${pr.id}/cancel`).expect(200);
    const again = await t.as(rita).post(`/api/requisitions/${pr.id}/submit`).expect(409);
    expect(again.body).toMatchObject({ code: 'INVALID_TRANSITION' });
  });

  it('only lets approvers decide and only requesters create', async () => {
    const pr = await submit((await createDraft(1)).id);
    await decide(buyer, pr.id, 'APPROVED').expect(403);
    await t.as(buyer).post('/api/requisitions', draft(1)).expect(403);
  });

  it('exposes the DoA matrix', async () => {
    const res = await t.as(rita).get('/api/doa-levels').expect(200);
    expect(res.body).toEqual([
      { level: 1, name: 'Team lead', maxAmountCents: 500_000 },
      { level: 2, name: 'Head of department', maxAmountCents: 5_000_000 },
      { level: 3, name: 'CFO', maxAmountCents: null },
    ]);
  });
});
