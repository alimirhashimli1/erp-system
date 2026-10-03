import { zodResolver } from '@hookform/resolvers/zod';
import {
  CreateCostCenterSchema,
  CreateItemSchema,
  CreateSupplierSchema,
  parseEuroToCents,
  UOM_LABELS,
  UOMS,
} from '@procurestack/shared';
import { useForm, type FieldErrors } from 'react-hook-form';
import { z } from 'zod';
import { errorText } from '../../api/http';
import { useCreateCatalogRecord } from '../../api/master-data';

const FieldError = ({ errors, name }: { errors: FieldErrors; name: string }) => {
  const message = errors[name]?.message;
  return typeof message === 'string' ? <p className="field-error">{message}</p> : null;
};

/** Shared footer: submit button + server error (e.g. 409 duplicate code). */
function Submit({ pending, error }: { pending: boolean; error: unknown }) {
  return (
    <div className="form-actions">
      <button type="submit" disabled={pending}>
        {pending ? 'Saving…' : 'Create'}
      </button>
      {error ? (
        <p className="form-error" role="alert">
          {errorText(error)}
        </p>
      ) : null}
    </div>
  );
}

export function SupplierForm() {
  const create = useCreateCatalogRecord('suppliers');
  const { register, handleSubmit, reset, formState } = useForm({
    resolver: zodResolver(CreateSupplierSchema),
  });
  const { errors } = formState;
  return (
    <form
      className="form-grid"
      noValidate
      onSubmit={(e) =>
        void handleSubmit((v) =>
          create.mutateAsync(v).then(() => {
            reset();
          }),
        )(e)
      }
    >
      <label>
        Code <input {...register('code')} placeholder="SUP-0010" />
        <FieldError errors={errors} name="code" />
      </label>
      <label>
        Name <input {...register('name')} />
        <FieldError errors={errors} name="name" />
      </label>
      <label>
        Country <input {...register('countryCode')} placeholder="DE" maxLength={2} />
        <FieldError errors={errors} name="countryCode" />
      </label>
      <label>
        Email <input type="email" {...register('email')} />
        <FieldError errors={errors} name="email" />
      </label>
      <Submit pending={create.isPending} error={create.error} />
    </form>
  );
}

/** Users type euros; the API takes integer cents (ADR 0005). */
const ItemFormSchema = CreateItemSchema.omit({ standardPriceCents: true }).extend({
  price: z
    .string()
    .refine((v) => parseEuroToCents(v) !== undefined, 'Amount like 12.50')
    .transform((v) => parseEuroToCents(v) ?? 0),
});

export function ItemForm() {
  const create = useCreateCatalogRecord('items');
  const { register, handleSubmit, reset, formState } = useForm({
    resolver: zodResolver(ItemFormSchema),
    defaultValues: { uom: 'EA' as const },
  });
  const { errors } = formState;
  return (
    <form
      className="form-grid"
      noValidate
      onSubmit={(e) =>
        void handleSubmit(({ price, ...rest }) =>
          create.mutateAsync({ ...rest, standardPriceCents: price }).then(() => {
            reset();
          }),
        )(e)
      }
    >
      <label>
        SKU <input {...register('sku')} placeholder="BOLT-M8" />
        <FieldError errors={errors} name="sku" />
      </label>
      <label>
        Description <input {...register('description')} />
        <FieldError errors={errors} name="description" />
      </label>
      <label>
        Unit
        <select {...register('uom')}>
          {UOMS.map((u) => (
            <option key={u} value={u}>
              {u} ({UOM_LABELS[u]})
            </option>
          ))}
        </select>
      </label>
      <label>
        Category <input {...register('category')} />
        <FieldError errors={errors} name="category" />
      </label>
      <label>
        Standard price (€) <input inputMode="decimal" {...register('price')} />
        <FieldError errors={errors} name="price" />
      </label>
      <Submit pending={create.isPending} error={create.error} />
    </form>
  );
}

export function CostCenterForm() {
  const create = useCreateCatalogRecord('cost-centers');
  const { register, handleSubmit, reset, formState } = useForm({
    resolver: zodResolver(CreateCostCenterSchema),
  });
  const { errors } = formState;
  return (
    <form
      className="form-grid"
      noValidate
      onSubmit={(e) =>
        void handleSubmit((v) =>
          create.mutateAsync(v).then(() => {
            reset();
          }),
        )(e)
      }
    >
      <label>
        Code <input {...register('code')} placeholder="CC-4100" />
        <FieldError errors={errors} name="code" />
      </label>
      <label>
        Name <input {...register('name')} />
        <FieldError errors={errors} name="name" />
      </label>
      <Submit pending={create.isPending} error={create.error} />
    </form>
  );
}
