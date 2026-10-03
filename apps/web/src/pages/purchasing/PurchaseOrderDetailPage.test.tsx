import type { PurchaseOrder } from '@procurestack/shared';
import { screen } from '@testing-library/react';
import { Route, Routes } from 'react-router';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { mockApi, renderAs } from '../../test/render';
import { PurchaseOrderDetailPage } from './PurchaseOrderDetailPage';

const uuid = (n: number) => `00000000-0000-4000-8000-${String(n).padStart(12, '0')}`;

const po = (overrides: Partial<PurchaseOrder> = {}): PurchaseOrder => ({
  id: uuid(1),
  number: 'PO-000003',
  status: 'DRAFT',
  supplier: { id: uuid(2), code: 'SUP-0001', name: 'Rhein Fasteners GmbH', countryCode: 'DE' },
  totalCents: 4_200,
  incoterm: 'DAP',
  namedPlace: 'Hamburg plant',
  expectedDeliveryDate: null,
  createdAt: '2026-10-01T10:00:00.000Z',
  rfx: { id: uuid(3), number: 'RFX-000002' },
  buyer: { id: uuid(4), fullName: 'Bea Buyer' },
  leadTimeDays: 10,
  version: 1,
  issuedAt: null,
  acknowledgedAt: null,
  closedAt: null,
  cancelReason: null,
  lines: [
    {
      id: uuid(5),
      lineNo: 1,
      prLineId: uuid(6),
      prNumber: 'PR-000009',
      itemId: uuid(7),
      sku: 'PUMP-HYD-20',
      description: 'Hydraulic pump',
      uom: 'EA',
      quantity: 4,
      unitPriceCents: 1_050,
      lineTotalCents: 4_200,
      receivedQuantity: 0,
      invoicedQuantity: 0,
    },
  ],
  ...overrides,
});

const render = (roles: Parameters<typeof renderAs>[0], data: PurchaseOrder) => {
  mockApi({ [`GET /api/purchase-orders/${data.id}`]: data });
  renderAs(
    roles,
    <Routes>
      <Route path="/purchase-orders/:id" element={<PurchaseOrderDetailPage />} />
    </Routes>,
    `/purchase-orders/${data.id}`,
  );
};

describe('PurchaseOrderDetailPage', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('offers issue and cancel to a buyer on a draft', async () => {
    render(['BUYER'], po());
    expect(await screen.findByRole('button', { name: 'Issue to supplier' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Cancel PO' })).toBeDisabled(); // reason first
  });

  it('shows the warehouse the order but no buyer actions', async () => {
    render(['WAREHOUSE'], po({ status: 'ISSUED' }));
    expect(await screen.findByText('PR-000009')).toBeInTheDocument();
    expect(screen.queryByRole('button')).not.toBeInTheDocument();
  });

  it('offers a short-close on a partially received PO', async () => {
    render(['BUYER'], po({ status: 'PARTIALLY_RECEIVED' }));
    expect(await screen.findByRole('button', { name: /Short-close/ })).toBeInTheDocument();
  });
});
