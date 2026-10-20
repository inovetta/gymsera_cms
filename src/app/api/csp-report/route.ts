import { NextResponse } from 'next/server'

// CSP violation reports (SEC-14). The policy is Report-Only for now: this endpoint only logs one short
// line per report so the violations can be read before the policy is enforced. It stores nothing and
// reads at most 8 KB.
const MAX_BYTES = 8 * 1024
const FIELDS = [
  'document-uri', 'documentURL', 'violated-directive', 'effective-directive', 'effectiveDirective',
  'blocked-uri', 'blockedURL', 'source-file', 'sourceFile', 'line-number', 'lineNumber', 'disposition',
]

const pick = (source: Record<string, unknown>) => {
  const out: Record<string, string> = {}
  for (const key of FIELDS) {
    const value = source[key]
    if (value !== undefined && value !== null) out[key] = String(value).slice(0, 300)
  }
  return out
}

export async function POST(request: Request) {
  try {
    const text = (await request.text()).slice(0, MAX_BYTES)
    const parsed = JSON.parse(text)
    // `report-uri` sends { "csp-report": {...} }; the Reporting API sends an array of { body: {...} }.
    const reports: Record<string, unknown>[] = Array.isArray(parsed)
      ? parsed.map((r) => r?.body ?? {})
      : [parsed['csp-report'] ?? {}]
    for (const report of reports.slice(0, 5)) {
      console.warn('[csp-report]', JSON.stringify(pick(report)))
    }
  } catch {
    // Malformed report: nothing to log.
  }
  return new NextResponse(null, { status: 204 })
}
