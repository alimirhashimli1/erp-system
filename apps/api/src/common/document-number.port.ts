export type DocumentType = 'PR' | 'RFX' | 'PO' | 'GR' | 'INV';

/** Port: next human-readable number (e.g. `PR-000042`). Call inside a UnitOfWork. */
export interface DocumentNumberGenerator {
  next(type: DocumentType): Promise<string>;
}

export const DOCUMENT_NUMBERS = Symbol('DOCUMENT_NUMBERS');
