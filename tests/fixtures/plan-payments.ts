// P9c item D: what GET /host/plan-payments answers for a host who may pay by bank transfer.
export const PLAN_PAYMENT_OVERVIEW = {
  plans: [
    { id: 'bp-1', branchCount: 1, currency: 'PKR', cycles: [{ cycle: 'MONTHLY', months: 1, amount: 2000, currency: 'PKR' }, { cycle: 'YEARLY', months: 12, amount: 20000, currency: 'PKR' }] },
    { id: 'bp-3', branchCount: 3, currency: 'PKR', cycles: [{ cycle: 'MONTHLY', months: 1, amount: 4990, currency: 'PKR' }, { cycle: 'YEARLY', months: 12, amount: 49900, currency: 'PKR' }] },
  ],
  methods: [{ key: 'BANK_TRANSFER', label: 'Bank transfer', requiresProof: true, available: true, instructions: null }],
  requests: [],
  pending: null,
  blocked: null,
  canSubmit: true,
}
