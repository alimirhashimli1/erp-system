import { formatCents, type Role } from '@procurestack/shared';
import { useState, type ReactNode } from 'react';
import { errorText } from '../../api/http';
import {
  type CatalogRecord,
  type CatalogResource,
  useCatalogList,
  useSetActive,
} from '../../api/master-data';
import { useAuth } from '../../auth/auth-context';
import { hasAnyRole } from '../../nav';
import { CostCenterForm, ItemForm, SupplierForm } from './forms';

interface Column<R extends CatalogResource> {
  header: string;
  cell: (row: CatalogRecord<R>) => ReactNode;
}

interface TabConfig<R extends CatalogResource> {
  label: string;
  /** Mirrors the API's @Roles on writes, so we don't offer buttons that would 403. */
  writeRoles: readonly Role[];
  columns: Column<R>[];
  form: () => ReactNode;
}

const TABS: { [R in CatalogResource]: TabConfig<R> } = {
  suppliers: {
    label: 'Suppliers',
    writeRoles: ['BUYER', 'ADMIN'],
    columns: [
      { header: 'Code', cell: (s) => s.code },
      { header: 'Name', cell: (s) => s.name },
      { header: 'Country', cell: (s) => s.countryCode },
      { header: 'Email', cell: (s) => s.email },
    ],
    form: () => <SupplierForm />,
  },
  items: {
    label: 'Items',
    writeRoles: ['BUYER', 'ADMIN'],
    columns: [
      { header: 'SKU', cell: (i) => i.sku },
      { header: 'Description', cell: (i) => i.description },
      { header: 'Unit', cell: (i) => i.uom },
      { header: 'Category', cell: (i) => i.category },
      { header: 'Std. price', cell: (i) => formatCents(i.standardPriceCents) },
    ],
    form: () => <ItemForm />,
  },
  'cost-centers': {
    label: 'Cost centers',
    writeRoles: ['FINANCE', 'ADMIN'],
    columns: [
      { header: 'Code', cell: (c) => c.code },
      { header: 'Name', cell: (c) => c.name },
    ],
    form: () => <CostCenterForm />,
  },
};

export function MasterDataPage() {
  const [tab, setTab] = useState<CatalogResource>('suppliers');
  return (
    <section className="card">
      <h1>Master data</h1>
      <div className="tabs" role="tablist">
        {(Object.keys(TABS) as CatalogResource[]).map((key) => (
          <button
            key={key}
            role="tab"
            aria-selected={tab === key}
            className={tab === key ? 'tab active' : 'tab'}
            onClick={() => {
              setTab(key);
            }}
          >
            {TABS[key].label}
          </button>
        ))}
      </div>
      {/* key: reset search state when switching tabs */}
      <CatalogTab key={tab} resource={tab} />
    </section>
  );
}

// eslint-disable-next-line @typescript-eslint/no-unnecessary-type-parameters -- R ties `resource` to its TABS entry so row types line up
function CatalogTab<R extends CatalogResource>({ resource }: { resource: R }) {
  const config = TABS[resource] as TabConfig<R>;
  const { state } = useAuth();
  const [q, setQ] = useState('');
  const [includeInactive, setIncludeInactive] = useState(false);
  const list = useCatalogList(resource, q.trim(), includeInactive);
  const setActive = useSetActive(resource);
  const canWrite =
    state.status === 'authenticated' && hasAnyRole(state.user.roles, config.writeRoles);

  return (
    <>
      <div className="toolbar">
        <input
          type="search"
          placeholder="Search…"
          aria-label="Search"
          value={q}
          onChange={(e) => {
            setQ(e.target.value);
          }}
        />
        <label className="inline">
          <input
            type="checkbox"
            checked={includeInactive}
            onChange={(e) => {
              setIncludeInactive(e.target.checked);
            }}
          />
          Show inactive
        </label>
      </div>

      {list.isError && <p className="form-error">{errorText(list.error)}</p>}
      <div className="table-wrap">
        <table className="table">
          <thead>
            <tr>
              {config.columns.map((c) => (
                <th key={c.header}>{c.header}</th>
              ))}
              <th>Status</th>
              {canWrite && <th />}
            </tr>
          </thead>
          <tbody>
            {list.data?.map((row) => (
              <tr key={row.id} className={row.isActive ? undefined : 'inactive'}>
                {config.columns.map((c) => (
                  <td key={c.header}>{c.cell(row)}</td>
                ))}
                <td>{row.isActive ? 'Active' : 'Inactive'}</td>
                {canWrite && (
                  <td>
                    <button
                      className="secondary small"
                      disabled={setActive.isPending}
                      onClick={() => {
                        setActive.mutate({ id: row.id, isActive: !row.isActive });
                      }}
                    >
                      {row.isActive ? 'Deactivate' : 'Activate'}
                    </button>
                  </td>
                )}
              </tr>
            ))}
            {list.data?.length === 0 && (
              <tr>
                <td colSpan={config.columns.length + 2} className="muted">
                  Nothing found.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      {canWrite && (
        <details className="create">
          <summary>New {config.label.toLowerCase().replace(/s$/, '')}</summary>
          {config.form()}
        </details>
      )}
    </>
  );
}
