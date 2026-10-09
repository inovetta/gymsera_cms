import { describe, it, expect, vi, afterEach } from 'vitest'
import { citiesApi, parseCities } from '@/lib/api/cities'
import apiClient from '@/lib/api/client'

const sampleCities = [
  { id: 1, name: 'Lahore', isActive: true, createdAt: '2026-01-01' },
  { id: 2, name: 'Karachi', isActive: true, createdAt: '2026-01-01' },
]

afterEach(() => {
  apiClient.defaults.adapter = undefined
  vi.restoreAllMocks()
})

describe('Cities parsing (NEW-46f)', () => {
  it('parseCities extracts cities whether given an array or { cities: [...] }', () => {
    expect(parseCities(sampleCities)).toEqual(sampleCities)
    expect(parseCities({ cities: sampleCities })).toEqual(sampleCities)
    expect(parseCities(null)).toEqual([])
    expect(parseCities(undefined)).toEqual([])
    expect(parseCities({})).toEqual([])
  })

  it('citiesApi.getCities normalizes { cities: [...] } response into a flat array', async () => {
    apiClient.defaults.adapter = async (config) => {
      return {
        data: { success: true, data: { cities: sampleCities } },
        status: 200,
        statusText: 'OK',
        headers: {},
        config,
      }
    }

    const res = await citiesApi.getCities()
    expect(Array.isArray(res.data)).toBe(true)
    expect(res.data).toEqual(sampleCities)
  })

  it('citiesApi.getCities handles direct array response', async () => {
    apiClient.defaults.adapter = async (config) => {
      return {
        data: { success: true, data: sampleCities },
        status: 200,
        statusText: 'OK',
        headers: {},
        config,
      }
    }

    const res = await citiesApi.getCities()
    expect(Array.isArray(res.data)).toBe(true)
    expect(res.data).toEqual(sampleCities)
  })
})
