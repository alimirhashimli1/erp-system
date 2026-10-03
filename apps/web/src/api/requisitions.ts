import {
  type CreateRequisition,
  type Decision,
  DoaMatrixSchema,
  type PrStatus,
  RequisitionSchema,
  type RequisitionListQuery,
  RequisitionSummaryListSchema,
  type UpdateRequisition,
} from '@procurestack/shared';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { apiFetch } from './http';

const KEY = 'requisitions';

export function useRequisitions(scope: RequisitionListQuery['scope'], status?: PrStatus) {
  const params = new URLSearchParams({ scope });
  if (status) params.set('status', status);
  return useQuery({
    queryKey: [KEY, 'list', scope, status],
    queryFn: () =>
      apiFetch(`/requisitions?${params.toString()}`, { schema: RequisitionSummaryListSchema }),
  });
}

export function useRequisition(id: string | undefined) {
  return useQuery({
    queryKey: [KEY, 'one', id],
    queryFn: () => apiFetch(`/requisitions/${id ?? ''}`, { schema: RequisitionSchema }),
    enabled: id !== undefined,
  });
}

export function useDoaMatrix() {
  return useQuery({
    queryKey: ['doa-levels'],
    queryFn: () => apiFetch('/doa-levels', { schema: DoaMatrixSchema }),
    staleTime: Infinity, // reference data, changes only with a migration
  });
}

/** Every PR mutation returns the updated PR; refresh lists and seed the detail cache. */
function usePrMutation<V>(
  request: (vars: V) => { path: string; method: 'POST' | 'PUT'; body?: unknown },
) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (vars: V) => {
      const { path, method, body } = request(vars);
      return apiFetch(path, { method, body, schema: RequisitionSchema });
    },
    onSuccess: (pr) => {
      qc.setQueryData([KEY, 'one', pr.id], pr);
      return qc.invalidateQueries({ queryKey: [KEY, 'list'] });
    },
  });
}

export const useCreateRequisition = () =>
  usePrMutation((body: CreateRequisition) => ({ path: '/requisitions', method: 'POST', body }));

export const useUpdateRequisition = (id: string) =>
  usePrMutation((body: UpdateRequisition) => ({
    path: `/requisitions/${id}`,
    method: 'PUT',
    body,
  }));

export const usePrAction = (id: string) =>
  usePrMutation((action: 'submit' | 'cancel') => ({
    path: `/requisitions/${id}/${action}`,
    method: 'POST',
  }));

export const useDecision = (id: string) =>
  usePrMutation((body: Decision) => ({
    path: `/requisitions/${id}/decision`,
    method: 'POST',
    body,
  }));
