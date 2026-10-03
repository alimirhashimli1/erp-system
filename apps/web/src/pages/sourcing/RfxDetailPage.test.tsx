import type { Offer, Rfx } from '@procurestack/shared';
import { screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { Route, Routes } from 'react-router';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { mockApi, renderAs, sentBody } from '../../test/render';
import { RfxDetailPage } from './RfxDetailPage';

const uuid = (n: number) => `00000000-0000-4000-8000-${String(n).padStart(12, '0')}`;
const DE = { id: uuid(1), code: 'SUP-DE', name: 'Rhein GmbH', countryCode: 'DE' };
const CN = { id: uuid(2), code: 'SUP-CN', name: 'Shenzhen Co', countryCode: 'CN' };
const LINE = uuid(10);

const offer = (
  supplier: typeof DE,
  rank: number,
  landedCents: number,
  bidLineId: string,
): Offer => ({
  bidId: uuid(20 + rank),
  bidLineId,
  supplier,
  incoterm: rank === 1 ? 'DAP' : 'FOB',
  leadTimeDays: 10,
  unitPriceCents: 12,
  goodsCents: 120_000,
  extrasCents: landedCents - 120_000,
  landedCents,
  landedPerUnitCents: Math.round(landedCents / 10_000),
  rank,
  expired: false,
});

const rfx = (overrides: Partial<Rfx> = {}): Rfx => ({
  id: uuid(99),
  number: 'RFX-000007',
  type: 'RFQ',
  title: 'Bolts',
  status: 'EVALUATED',
  buyer: { id: uuid(50), fullName: 'Bea Buyer' },
  responseDeadline: '2026-10-08T12:00:00.000Z',
  invitedCount: 2,
  respondedCount: 2,
  createdAt: '2026-10-01T12:00:00.000Z',
  version: 5,
  publishedAt: null,
  closedAt: null,
  evaluatedAt: null,
  awardedAt: null,
  awardJustification: null,
  sealed: false,
  lines: [
    {
      id: LINE,
      lineNo: 1,
      prLineId: uuid(11),
      prNumber: 'PR-000001',
      itemId: uuid(12),
      sku: 'BOLT',
      description: 'Bolt',
      uom: 'EA',
      quantity: 10_000,
      awardedBidLineId: null,
    },
  ],
  invitations: [],
  bids: [],
  evaluation: {
    lines: [
      {
        rfxLineId: LINE,
        offers: [offer(DE, 1, 120_000, uuid(31)), offer(CN, 2, 135_248, uuid(32))],
      },
    ],
  },
  ...overrides,
});

const render = (data: Rfx) => {
  const spy = mockApi({
    [`GET /api/rfx/${data.id}`]: data,
    [`POST /api/rfx/${data.id}/award`]: () => ({ body: { ...data, status: 'AWARDED' } }),
  });
  renderAs(
    ['BUYER'],
    <Routes>
      <Route path="/sourcing/rfx/:id" element={<RfxDetailPage />} />
    </Routes>,
    `/sourcing/rfx/${data.id}`,
  );
  return spy;
};

describe('RfxDetailPage', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('defaults the award to the best landed cost and asks for no justification', async () => {
    const spy = render(rfx());
    expect(await screen.findByText('€1,352.48')).toBeInTheDocument();
    expect(screen.queryByLabelText(/Justification/)).not.toBeInTheDocument();
    await userEvent.click(screen.getByRole('button', { name: 'Award' }));
    expect(sentBody(spy, 'POST')).toEqual({ awards: [{ rfxLineId: LINE, bidLineId: uuid(31) }] });
  });

  it('requires a justification when the buyer picks a dearer offer', async () => {
    const spy = render(rfx());
    await userEvent.click(await screen.findByLabelText('Award to Shenzhen Co'));
    await userEvent.type(screen.getByLabelText(/Justification/), 'Dual sourcing');
    await userEvent.click(screen.getByRole('button', { name: 'Award' }));
    expect(sentBody(spy, 'POST')).toEqual({
      awards: [{ rfxLineId: LINE, bidLineId: uuid(32) }],
      justification: 'Dual sourcing',
    });
  });

  it('explains sealed bids while the event is open', async () => {
    render(rfx({ status: 'PUBLISHED', sealed: true, evaluation: null }));
    expect(await screen.findByText(/Bids are sealed/)).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: 'Record a supplier bid' })).toBeInTheDocument();
  });
});
