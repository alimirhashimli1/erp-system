import {
  CostCenterListSchema,
  CostCenterSchema,
  type CreateCostCenter,
  type CreateItem,
  type CreateSupplier,
  ItemListSchema,
  ItemSchema,
  SupplierListSchema,
  SupplierSchema,
} from '@procurestack/shared';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import type { z } from 'zod';
import { apiFetch } from './http';

/** Resource config: one place maps a REST path to its list/record schemas. */
const RESOURCES = {
  suppliers: { list: SupplierListSchema, one: SupplierSchema },
  items: { list: ItemListSchema, one: ItemSchema },
  'cost-centers': { list: CostCenterListSchema, one: CostCenterSchema },
} as const;

export type CatalogResource = keyof typeof RESOURCES;
export type CatalogRecord<R extends CatalogResource> = z.output<(typeof RESOURCES)[R]['one']>;

export interface CreateBodies {
  suppliers: CreateSupplier;
  items: CreateItem;
  'cost-centers': CreateCostCenter;
}

const listPath = (resource: CatalogResource, q: string, includeInactive: boolean) => {
  const params = new URLSearchParams();
  if (q) params.set('q', q);
  if (includeInactive) params.set('includeInactive', 'true');
  const qs = params.toString();
  return `/${resource}${qs ? `?${qs}` : ''}`;
};

export function useCatalogList<R extends CatalogResource>(
  resource: R,
  q = '',
  includeInactive = false,
) {
  return useQuery({
    queryKey: ['catalog', resource, q, includeInactive],
    queryFn: () =>
      apiFetch(listPath(resource, q, includeInactive), {
        schema: RESOURCES[resource].list,
      }) as Promise<CatalogRecord<R>[]>,
  });
}

export function useCreateCatalogRecord<R extends CatalogResource>(resource: R) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (body: CreateBodies[R]) =>
      apiFetch(`/${resource}`, { method: 'POST', body, schema: RESOURCES[resource].one }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['catalog', resource] }),
  });
}

export function useSetActive(resource: CatalogResource) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, isActive }: { id: string; isActive: boolean }) =>
      apiFetch(`/${resource}/${id}`, {
        method: 'PATCH',
        body: { isActive },
        schema: RESOURCES[resource].one,
      }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['catalog', resource] }),
  });
}
