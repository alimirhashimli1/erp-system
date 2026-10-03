import {
  type AcknowledgePo,
  type CancelPo,
  type CreatePosFromRfx,
  type PoStatus,
  PurchaseOrderListSchema,
  PurchaseOrderSchema,
  PurchaseOrderSummaryListSchema,
} from '@procurestack/shared';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { apiFetch } from './http';

const KEY = 'purchase-orders';

export const usePurchaseOrders = (status?: PoStatus) =>
  useQuery({
    queryKey: [KEY, 'list', status],
    queryFn: () =>
      apiFetch(`/purchase-orders${status ? `?status=${status}` : ''}`, {
        schema: PurchaseOrderSummaryListSchema,
      }),
  });

export const usePurchaseOrder = (id: string) =>
  useQuery({
    queryKey: [KEY, 'one', id],
    queryFn: () => apiFetch(`/purchase-orders/${id}`, { schema: PurchaseOrderSchema }),
  });

export function useCreatePosFromRfx(rfxId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (body: CreatePosFromRfx) =>
      apiFetch(`/purchase-orders/from-rfx/${rfxId}`, {
        method: 'POST',
        body,
        schema: PurchaseOrderListSchema,
      }),
    onSuccess: () => qc.invalidateQueries({ queryKey: [KEY] }),
  });
}

type PoAction =
  | { action: 'issue' | 'close' }
  | { action: 'acknowledge'; body: AcknowledgePo }
  | { action: 'cancel'; body: CancelPo };

export function usePoAction(id: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (a: PoAction) =>
      apiFetch(`/purchase-orders/${id}/${a.action}`, {
        method: 'POST',
        body: 'body' in a ? a.body : undefined,
        schema: PurchaseOrderSchema,
      }),
    onSuccess: async (po) => {
      qc.setQueryData([KEY, 'one', po.id], po);
      await qc.invalidateQueries({ queryKey: [KEY, 'list'] });
    },
  });
}
