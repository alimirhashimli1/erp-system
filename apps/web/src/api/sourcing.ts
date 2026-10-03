import {
  type Award,
  type CreateRfx,
  OpenPrLineListSchema,
  RfxSchema,
  RfxSummaryListSchema,
  type SubmitBidInput,
} from '@procurestack/shared';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { apiFetch } from './http';

const KEY = 'rfx';

export const useOpenPrLines = (enabled: boolean) =>
  useQuery({
    queryKey: ['sourcing', 'open-pr-lines'],
    queryFn: () => apiFetch('/sourcing/open-pr-lines', { schema: OpenPrLineListSchema }),
    enabled,
  });

export const useRfxList = () =>
  useQuery({
    queryKey: [KEY, 'list'],
    queryFn: () => apiFetch('/rfx', { schema: RfxSummaryListSchema }),
  });

export function useRfx(id: string) {
  return useQuery({
    queryKey: [KEY, 'one', id],
    queryFn: () => apiFetch(`/rfx/${id}`, { schema: RfxSchema }),
    // While published, (simulated) supplier responses arrive in the background.
    refetchInterval: (q) => (q.state.data?.status === 'PUBLISHED' ? 4_000 : false),
  });
}

function useRfxMutation<V>(request: (vars: V) => { path: string; body?: unknown }) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (vars: V) => {
      const { path, body } = request(vars);
      return apiFetch(path, { method: 'POST', body, schema: RfxSchema });
    },
    onSuccess: async (rfx) => {
      qc.setQueryData([KEY, 'one', rfx.id], rfx);
      await qc.invalidateQueries({ queryKey: [KEY, 'list'] });
      await qc.invalidateQueries({ queryKey: ['sourcing'] });
    },
  });
}

export const useCreateRfx = () => useRfxMutation((body: CreateRfx) => ({ path: '/rfx', body }));

export const useRfxAction = (id: string) =>
  useRfxMutation((action: 'publish' | 'close' | 'evaluate' | 'cancel') => ({
    path: `/rfx/${id}/${action}`,
  }));

export const useSubmitBid = (id: string) =>
  useRfxMutation((body: SubmitBidInput) => ({ path: `/rfx/${id}/bids`, body }));

export const useAward = (id: string) =>
  useRfxMutation((body: Award) => ({ path: `/rfx/${id}/award`, body }));
