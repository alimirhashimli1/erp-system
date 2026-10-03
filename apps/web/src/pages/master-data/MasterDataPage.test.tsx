import { screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { mockApi, renderAs, sentBody } from '../../test/render';
import { MasterDataPage } from './MasterDataPage';

const supplier = {
  id: '00000000-0000-4000-8000-000000000010',
  code: 'SUP-0001',
  name: 'Acme Fasteners GmbH',
  countryCode: 'DE',
  email: 'sales@acme.example',
  isActive: true,
};

describe('MasterDataPage', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('lists suppliers but offers no create/deactivate actions to a requester', async () => {
    mockApi({ 'GET /api/suppliers': [supplier] });
    renderAs(['REQUESTER'], <MasterDataPage />);

    expect(await screen.findByText('Acme Fasteners GmbH')).toBeInTheDocument();
    expect(screen.queryByText('New supplier')).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Deactivate' })).not.toBeInTheDocument();
  });

  it('sends the item price to the API in integer cents', async () => {
    const fetchSpy = mockApi({
      'GET /api/suppliers': [],
      'GET /api/items': [],
      'POST /api/items': (body) => ({
        status: 201,
        body: { ...(body as object), id: supplier.id, isActive: true },
      }),
    });
    renderAs(['BUYER'], <MasterDataPage />);

    await userEvent.click(screen.getByRole('tab', { name: 'Items' }));
    await userEvent.click(await screen.findByText('New item'));
    await userEvent.type(screen.getByLabelText('SKU'), 'bolt-m8');
    await userEvent.type(screen.getByLabelText('Description'), 'M8 hex bolt');
    await userEvent.type(screen.getByLabelText('Category'), 'Fasteners');
    await userEvent.type(screen.getByLabelText('Standard price (€)'), '0,35');
    await userEvent.click(screen.getByRole('button', { name: 'Create' }));

    expect(sentBody(fetchSpy, 'POST')).toEqual({
      sku: 'BOLT-M8',
      description: 'M8 hex bolt',
      uom: 'EA',
      category: 'Fasteners',
      standardPriceCents: 35,
    });
  });
});
