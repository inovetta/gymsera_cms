import axe from 'axe-core'

/**
 * Runs axe on a rendered container and returns the violations as readable lines.
 * `color-contrast` is skipped: jsdom has no layout or computed theme colors, so it cannot judge
 * it. Contrast is covered at the token level in tests/lib/design-tokens.test.ts.
 */
export async function axeViolations(container: Element): Promise<string[]> {
  const result = await axe.run(container, {
    rules: { 'color-contrast': { enabled: false }, region: { enabled: false } },
  })
  return result.violations.map((v) => `${v.id}: ${v.help} (${v.nodes.map((n) => n.target.join(' ')).join('; ')})`)
}
