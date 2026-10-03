import { zodResolver } from '@hookform/resolvers/zod';
import {
  approvalLevelsFor,
  CreateRequisitionSchema,
  formatCents,
  lineTotalCents,
  parseEuroToCents,
  QuantitySchema,
  type Requisition,
} from '@procurestack/shared';
import { useEffect } from 'react';
import { useFieldArray, useForm, useWatch } from 'react-hook-form';
import { Link, useNavigate, useParams } from 'react-router';
import { z } from 'zod';
import { errorText } from '../../api/http';
import { useCatalogList } from '../../api/master-data';
import {
  useCreateRequisition,
  useDoaMatrix,
  useRequisition,
  useUpdateRequisition,
} from '../../api/requisitions';

/*
 * Form values are strings (what inputs hold); the schema turns them into the API's
 * numbers and cents, then the shared CreateRequisitionSchema has the final say.
 */
const LineFormSchema = z.object({
  itemId: z.string().min(1, 'Pick an item'),
  quantity: z
    .string()
    .transform((v) => Number(v.replace(',', '.')))
    .pipe(QuantitySchema),
  unitPrice: z
    .string()
    .refine((v) => parseEuroToCents(v) !== undefined, 'Amount like 12.50')
    .transform((v) => parseEuroToCents(v) ?? 0),
});

const FormSchema = CreateRequisitionSchema.omit({ lines: true }).extend({
  lines: z.array(LineFormSchema).min(1, 'Add at least one line').max(50),
});
type FormInput = z.input<typeof FormSchema>;
type FormOutput = z.output<typeof FormSchema>;

const emptyLine = { itemId: '', quantity: '1', unitPrice: '' };

const toFormValues = (pr: Requisition): FormInput => ({
  title: pr.title,
  justification: pr.justification,
  costCenterId: pr.costCenter.id,
  needByDate: pr.needByDate,
  lines: pr.lines.map((l) => ({
    itemId: l.itemId,
    quantity: String(l.quantity),
    unitPrice: (l.unitPriceCents / 100).toFixed(2),
  })),
});

const toBody = (v: FormOutput) => ({
  ...v,
  lines: v.lines.map((l) => ({
    itemId: l.itemId,
    quantity: l.quantity,
    unitPriceCents: l.unitPrice,
  })),
});

export function RequisitionFormPage() {
  const { id } = useParams();
  const navigate = useNavigate();
  const existing = useRequisition(id);
  const items = useCatalogList('items');
  const costCenters = useCatalogList('cost-centers');
  const doa = useDoaMatrix();
  const create = useCreateRequisition();
  const update = useUpdateRequisition(id ?? '');
  const mutation = id ? update : create;

  const { register, control, handleSubmit, reset, setValue, getValues, formState } = useForm<
    FormInput,
    unknown,
    FormOutput
  >({
    resolver: zodResolver(FormSchema),
    defaultValues: {
      title: '',
      justification: '',
      costCenterId: '',
      needByDate: '',
      lines: [emptyLine],
    },
  });
  const { fields, append, remove } = useFieldArray({ control, name: 'lines' });
  const lines = useWatch({ control, name: 'lines' });
  const { errors } = formState;

  useEffect(() => {
    if (existing.data) reset(toFormValues(existing.data));
  }, [existing.data, reset]);

  // Live preview with the same helpers the API uses for the stored total and DoA routing.
  const totalCents = lines.reduce((sum, l) => {
    const qty = Number(l.quantity.replace(',', '.'));
    const price = parseEuroToCents(l.unitPrice);
    return Number.isFinite(qty) && qty > 0 && price !== undefined
      ? sum + lineTotalCents(qty, price)
      : sum;
  }, 0);
  const levels = doa.data ? approvalLevelsFor(totalCents, doa.data) : null;

  const onItemChange = (index: number, itemId: string) => {
    const item = items.data?.find((i) => i.id === itemId);
    if (item && !getValues(`lines.${index}.unitPrice`)) {
      setValue(`lines.${index}.unitPrice`, (item.standardPriceCents / 100).toFixed(2));
    }
  };

  const onSubmit = async (values: FormOutput) => {
    const pr = id
      ? await update.mutateAsync({ ...toBody(values), version: existing.data?.version ?? 0 })
      : await create.mutateAsync(toBody(values));
    void navigate(`/requisitions/${pr.id}`);
  };

  if (id && existing.isPending) return <p className="muted">Loading…</p>;

  return (
    <section className="card">
      <div className="page-head">
        <h1>{id ? `Edit ${existing.data?.number ?? ''}` : 'New purchase requisition'}</h1>
        <Link to={id ? `/requisitions/${id}` : '/requisitions'}>Back</Link>
      </div>

      <form noValidate onSubmit={(e) => void handleSubmit(onSubmit)(e)}>
        <div className="form-grid">
          <label>
            Title <input {...register('title')} />
            {errors.title && <p className="field-error">{errors.title.message}</p>}
          </label>
          <label>
            Cost center
            <select {...register('costCenterId')}>
              <option value="">Select…</option>
              {costCenters.data?.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.code} — {c.name}
                </option>
              ))}
            </select>
            {errors.costCenterId && <p className="field-error">Pick a cost center</p>}
          </label>
          <label>
            Need by <input type="date" {...register('needByDate')} />
            {errors.needByDate && <p className="field-error">Pick a date</p>}
          </label>
          <label className="span-all">
            Business justification <textarea rows={3} {...register('justification')} />
            {errors.justification && <p className="field-error">{errors.justification.message}</p>}
          </label>
        </div>

        <h2 className="section-title">Lines</h2>
        <div className="table-wrap">
          <table className="table">
            <thead>
              <tr>
                <th>Item</th>
                <th>Quantity</th>
                <th>Est. unit price (€)</th>
                <th className="num">Line total</th>
                <th />
              </tr>
            </thead>
            <tbody>
              {fields.map((field, index) => {
                const line = lines[index];
                const qty = Number(line?.quantity.replace(',', '.'));
                const price = parseEuroToCents(line?.unitPrice ?? '');
                const uom = items.data?.find((i) => i.id === line?.itemId)?.uom;
                const lineErrors = errors.lines?.[index];
                return (
                  <tr key={field.id}>
                    <td>
                      <select
                        aria-label={`Line ${String(index + 1)} item`}
                        {...register(`lines.${index}.itemId`, {
                          onChange: (e: { target: { value: string } }) => {
                            onItemChange(index, e.target.value);
                          },
                        })}
                      >
                        <option value="">Select…</option>
                        {items.data?.map((i) => (
                          <option key={i.id} value={i.id}>
                            {i.sku} — {i.description}
                          </option>
                        ))}
                      </select>
                      {lineErrors?.itemId && (
                        <p className="field-error">{lineErrors.itemId.message}</p>
                      )}
                    </td>
                    <td>
                      <input
                        aria-label={`Line ${String(index + 1)} quantity`}
                        inputMode="decimal"
                        className="narrow"
                        {...register(`lines.${index}.quantity`)}
                      />{' '}
                      <span className="muted small">{uom}</span>
                      {lineErrors?.quantity && (
                        <p className="field-error">{lineErrors.quantity.message}</p>
                      )}
                    </td>
                    <td>
                      <input
                        aria-label={`Line ${String(index + 1)} price`}
                        inputMode="decimal"
                        className="narrow"
                        {...register(`lines.${index}.unitPrice`)}
                      />
                      {lineErrors?.unitPrice && (
                        <p className="field-error">{lineErrors.unitPrice.message}</p>
                      )}
                    </td>
                    <td className="num">
                      {qty > 0 && price !== undefined
                        ? formatCents(lineTotalCents(qty, price))
                        : '—'}
                    </td>
                    <td>
                      {fields.length > 1 && (
                        <button
                          type="button"
                          className="secondary small"
                          onClick={() => {
                            remove(index);
                          }}
                        >
                          Remove
                        </button>
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
        <button
          type="button"
          className="secondary small"
          onClick={() => {
            append(emptyLine);
          }}
        >
          Add line
        </button>

        <div className="summary-bar">
          <span>
            Total <strong>{formatCents(totalCents)}</strong>
          </span>
          {levels !== null && (
            <span className="muted">
              Needs {levels} approval level{levels > 1 ? 's' : ''} (
              {doa.data
                ?.filter((l) => l.level <= levels)
                .map((l) => l.name)
                .join(' → ')}
              )
            </span>
          )}
        </div>

        <div className="form-actions">
          <button type="submit" disabled={mutation.isPending}>
            {mutation.isPending ? 'Saving…' : 'Save draft'}
          </button>
          {mutation.error && (
            <p className="form-error" role="alert">
              {errorText(mutation.error)}
            </p>
          )}
        </div>
      </form>
    </section>
  );
}
