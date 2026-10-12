import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import path from 'node:path'
// @ts-expect-error plain ESM script without types
import { buildCss } from '../../scripts/generate-tokens.mjs'

const root = path.resolve(__dirname, '../..')
const tokens = JSON.parse(readFileSync(path.join(root, 'design/design-tokens.json'), 'utf8'))

function luminance(hex: string): number {
  const c = [1, 3, 5]
    .map((i) => parseInt(hex.slice(i, i + 2), 16) / 255)
    .map((v) => (v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4))
  return 0.2126 * c[0] + 0.7152 * c[1] + 0.0722 * c[2]
}
function ratio(a: string, b: string): number {
  const [hi, lo] = [luminance(a), luminance(b)].sort((x, y) => y - x)
  return (hi + 0.05) / (lo + 0.05)
}

describe('design tokens (spec §2.4)', () => {
  it('has the generated CSS committed and up to date', () => {
    const committed = readFileSync(path.join(root, 'src/styles/tokens.css'), 'utf8')
    expect(committed).toBe(buildCss(tokens))
  })

  it.each(['light', 'dark'] as const)('every declared role pair meets its contrast minimum in %s', (mode) => {
    const failures = (tokens.contrast as [string, string, number][])
      .map(([fg, bg, min]) => ({ fg, bg, min, got: ratio(tokens.color[fg][mode], tokens.color[bg][mode]) }))
      .filter((p) => p.got < p.min)
      .map((p) => `${p.fg} on ${p.bg}: ${p.got.toFixed(2)} < ${p.min}`)
    expect(failures).toEqual([])
  })

  it('defines the four role colors from the mobile Team & Access chips', () => {
    expect(Object.keys(tokens.color)).toEqual(
      expect.arrayContaining(['roleOwner', 'roleManager', 'roleDesk', 'roleTrainer'])
    )
  })
})
