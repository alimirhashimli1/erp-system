import type { Requisition } from '@procurestack/shared';
import { screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { Route, Routes } from 'react-router';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { mockApi, renderAs, sentBody } from '../../test/render';
import { RequisitionDetailPage } from './RequisitionDetailPage';
import { RequisitionFormPage } from './RequisitionFormPage';

const ME = '00000000-0000-4000-8000-000000000001'; // renderAs() user id
const OTHER = '00000000-0000-4000-8000-000000000002';
const ITEM = '00000000-0000-4000-8000-0000000000aa';
const CC = '00000000-0000-4000-8000-0000000000cc';

const doa = [
  { level: 1, name: 'Team lead', maxAmountCents: 500_000 },
  { level: 2, name: 'Head of department', maxAmountCents: 5_000_000 },
  { level: 3, name: 'CFO', maxAmountCents: null },
];

const pr = (overrides: Partial<Requisition> = {}): Requisition => ({
  id: '00000000-0000-4000-8000-0000000000f1',
  number: 'PR-000042',
  status: 'SUBMITTED',
  title: 'Spare pumps',
  justification: 'Line 3 down',
  requester: { id: OTHER, fullName: 'Rita Requester' },
  costCenter: { id: CC, code: 'CC-2000', name: 'Maintenance' },
  needByDate: '2099-01-31',
  totalCents: 2_910_000,
  requiredLevels: 2,
  pendingLevel: 1,
  approvalRound: 1,
  version: 2,
  submittedAt: '2026-10-01T10:00:00.000Z',
  decidedAt: null,
  createdAt: '2026-10-01T09:00:00.000Z',
  lines: [],
  approvals: [],
  ...overrides,
});

const renderDetail = (roles: Parameters<typeof renderAs>[0], data: Requisition) => {
  mockApi({ [`GET /api/requisitions/${data.id}`]: data, 'GET /api/doa-levels': doa });
  renderAs(
    roles,
    <Routes>
      <Route path="/requisitions/:id" element={<RequisitionDetailPage />} />
    </Routes>,
    `/requisitions/${data.id}`,
  );
};

describe('Requisition screens', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('previews the total and the DoA route while typing, and sends cents', async () => {
    const spy = mockApi({
      'GET /api/items': [
        {
          id: ITEM,
          sku: 'PUMP-HYD-20',
          description: 'Hydraulic pump',
          uom: 'EA',
          category: 'Spare parts',
          standardPriceCents: 48_500,
          isActive: true,
        },
      ],
      'GET /api/cost-centers': [{ id: CC, code: 'CC-2000', name: 'Maintenance', isActive: true }],
      'GET /api/doa-levels': doa,
      'POST /api/requisitions': () => ({ status: 201, body: pr({ status: 'DRAFT' }) }),
    });
    renderAs(['REQUESTER'], <RequisitionFormPage />);

    await userEvent.type(screen.getByLabelText('Title'), 'Spare pumps');
    await userEvent.selectOptions(await screen.findByLabelText('Cost center'), CC);
    await userEvent.type(screen.getByLabelText('Need by'), '2099-01-31');
    await userEvent.type(screen.getByLabelText('Business justification'), 'Line 3 down');
    await userEvent.selectOptions(screen.getByLabelText('Line 1 item'), ITEM);
    // Price was pre-filled from the item's standard price.
    expect(screen.getByLabelText('Line 1 price')).toHaveValue('485.00');
    await userEvent.clear(screen.getByLabelText('Line 1 quantity'));
    await userEvent.type(screen.getByLabelText('Line 1 quantity'), '60');

    expect(screen.getByText('€29,100.00', { selector: 'strong' })).toBeInTheDocument();
    expect(screen.getByText(/Needs 2 approval levels/)).toHaveTextContent(
      'Team lead → Head of department',
    );

    await userEvent.click(screen.getByRole('button', { name: 'Save draft' }));
    expect(sentBody(spy, 'POST')).toMatchObject({
      costCenterId: CC,
      lines: [{ itemId: ITEM, quantity: 60, unitPriceCents: 48_500 }],
    });
  });

  it('offers the decision form to an approver on someone else’s pending PR', async () => {
    renderDetail(['APPROVER'], pr());
    expect(await screen.findByText('Your decision — level 1')).toBeInTheDocument();
    // Reject/return stay disabled until a comment explains why.
    expect(screen.getByRole('button', { name: 'Reject' })).toBeDisabled();
  });

  it('never offers approval of your own PR, but offers owner actions', async () => {
    renderDetail(
      ['REQUESTER', 'APPROVER'],
      pr({ status: 'DRAFT', requester: { id: ME, fullName: 'Me' }, pendingLevel: null }),
    );
    expect(await screen.findByRole('button', { name: 'Submit for approval' })).toBeInTheDocument();
    expect(screen.queryByText(/Your decision/)).not.toBeInTheDocument();
  });
});
