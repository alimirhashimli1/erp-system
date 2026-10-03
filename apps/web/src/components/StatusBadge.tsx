/** Colour family per document status, shared by every document type. */
const TONE: Record<string, 'neutral' | 'info' | 'ok' | 'warn' | 'bad'> = {
  DRAFT: 'neutral',
  SUBMITTED: 'info',
  PUBLISHED: 'info',
  ISSUED: 'info',
  ACKNOWLEDGED: 'info',
  PENDING: 'info',
  CLOSED: 'neutral',
  EVALUATED: 'info',
  RETURNED: 'warn',
  EXCEPTION: 'warn',
  PARTIALLY_RECEIVED: 'warn',
  APPROVED: 'ok',
  AWARDED: 'ok',
  RECEIVED: 'ok',
  MATCHED: 'ok',
  RESOLVED: 'ok',
  APPROVED_FOR_PAYMENT: 'ok',
  PAID: 'ok',
  REJECTED: 'bad',
  CANCELLED: 'bad',
};

export function StatusBadge({ status }: { status: string }) {
  return (
    <span className={`pill pill-${TONE[status] ?? 'neutral'}`}>
      {status.toLowerCase().replace(/_/g, ' ')}
    </span>
  );
}
