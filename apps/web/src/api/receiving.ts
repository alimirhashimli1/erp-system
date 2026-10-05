import {
  GoodsReceiptListSchema,
  GoodsReceiptSchema,
  type PostGoodsReceiptInput,
} from '@procurestack/shared';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { apiFetch } from './http';

const KEY = 'goods-receipts';

export const useGoodsReceipts = (poId?: string) =>
  useQuery({
    queryKey: [KEY, 'list', poId],
    queryFn: () =>
      apiFetch(`/goods-receipts${poId ? `?poId=${poId}` : ''}`, {
        schema: GoodsReceiptListSchema,
      }),
  });

export function usePostGoodsReceipt() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (body: PostGoodsReceiptInput) =>
      apiFetch('/goods-receipts', { method: 'POST', body, schema: GoodsReceiptSchema }),
    // A receipt changes the PO's received quantities and status too.
    onSuccess: () =>
      Promise.all([
        qc.invalidateQueries({ queryKey: [KEY] }),
        qc.invalidateQueries({ queryKey: ['purchase-orders'] }),
      ]),
  });
}
