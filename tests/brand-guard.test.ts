import { describe, it, expect } from 'vitest'
import fs from 'node:fs'
import path from 'node:path'

// Phase 7 P8, owner decision R-72 (D1, BUG-06): the product is "GymsEra", one spelling everywhere,
// metadata and copy included. Fails if "Gymsera", "Gyms Era", "GymConnect" or "Gym Connect" appears
// in src/ or public/. Identifiers and hosts (gymsera.com, GymseraLogo) do not match.
const BANNED = /\bGymsera\b|\bGyms Era\b|GymConnect|Gym Connect/
const ROOT = path.resolve(__dirname, '..')

const files = (dir: string): string[] =>
  !fs.existsSync(dir)
    ? []
    : fs.readdirSync(dir, { withFileTypes: true }).flatMap((e) => {
        const p = path.join(dir, e.name)
        if (e.isDirectory()) return e.name === 'node_modules' ? [] : files(p)
        return /\.(tsx?|jsx?|json|html|md|txt|webmanifest)$/.test(e.name) ? [p] : []
      })

describe('R-72: one product name, GymsEra', () => {
  it('no banned spelling in src/ or public/', () => {
    const hits: string[] = []
    for (const f of [...files(path.join(ROOT, 'src')), ...files(path.join(ROOT, 'public'))]) {
      fs.readFileSync(f, 'utf8').split('\n').forEach((line, i) => {
        if (BANNED.test(line)) hits.push(`${path.relative(ROOT, f)}:${i + 1}: ${line.trim()}`)
      })
    }
    expect(hits).toEqual([])
  })

  it('the guard catches each banned spelling and lets identifiers through', () => {
    for (const s of ['Gymsera', 'Welcome to Gyms Era', 'GymConnect', 'Gym Connect']) expect(BANNED.test(s)).toBe(true)
    for (const s of ['GymsEra', 'GymseraLogo', 'https://gymsera.com', 'gymsera_cms']) expect(BANNED.test(s)).toBe(false)
  })
})
