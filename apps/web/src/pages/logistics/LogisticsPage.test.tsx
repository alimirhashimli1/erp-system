import { screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it } from 'vitest';
import { renderAs } from '../../test/render';
import { LogisticsPage } from './LogisticsPage';

describe('LogisticsPage', () => {
  it('recomputes landed cost when the Incoterm moves freight into the supplier price', async () => {
    renderAs(['BUYER'], <LogisticsPage />);
    // FOB defaults: 10,000 + 1,500 + 100 + 4 % duty on 11,600 (464) + 300 = 12,364
    expect(screen.getByText('€12,364.00')).toBeInTheDocument();

    await userEvent.selectOptions(screen.getByLabelText('Incoterm'), 'CIF');
    // CIF: freight + insurance are inside the price → 10,000 + 400 duty + 300 handling
    expect(screen.getByText('€10,700.00')).toBeInTheDocument();
    expect(screen.getAllByText('in supplier price')).toHaveLength(3);
  });
});
