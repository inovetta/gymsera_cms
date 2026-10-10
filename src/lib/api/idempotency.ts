/**
 * One Idempotency-Key per user intent (spec §11.2, REL-01).
 *
 * Money endpoints answer 400 `idempotency_key_required` without the header
 * (`gymsera_be/src/middleware/idempotency.js:51-58`): POST /payments, POST /payments/:id/refund,
 * POST /host/payouts. Create the key when the dialog opens (or the form is first submitted) and
 * reuse it for a retry of the SAME request, so a double click or a lost response cannot record
 * the money twice. A different amount or reason is a different intent: make a new key.
 */
export function newIdempotencyKey(): string {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
    return crypto.randomUUID()
  }
  // Older browsers: still unique enough for a 24 h replay window.
  return `${Date.now().toString(36)}-${Math.random().toString(36).slice(2)}-${Math.random().toString(36).slice(2)}`
}

export const idempotencyHeaders = (key: string) => ({ 'Idempotency-Key': key })
