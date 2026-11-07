import { describe, it, expect } from 'vitest'
import apiClient from '@/lib/api/client'
import { plansApi } from '@/lib/api/plans'

/**
 * P11 (B), NEW-227: `POST /membership-plans/:id/poster` reads the file from the multipart field
 * `image` (gymsera_be `src/routes/membership-plans.routes.js`: `upload.image('image')`; any other
 * field is refused by multer). `uploadPlanPoster` sent it as `poster`.
 * Uses the real client with a capturing adapter, so the body is the one axios really sends.
 */
describe('NEW-227: plansApi.uploadPlanPoster', () => {
  it('posts the file as the multipart field "image" to /membership-plans/:id/poster', async () => {
    let seen: { url: string; method?: string; data: unknown } | null = null
    const original = apiClient.defaults.adapter
    apiClient.defaults.adapter = async (config) => {
      seen = { url: apiClient.getUri(config), method: config.method, data: config.data }
      return {
        data: { success: true, data: { posterUrl: 'https://img.example.test/plans/posters/plan-1.jpg' } },
        status: 200,
        statusText: 'OK',
        headers: {},
        config,
      }
    }
    const file = new File([new Uint8Array([0xff, 0xd8, 0xff])], 'poster.jpg', { type: 'image/jpeg' })
    try {
      await plansApi.uploadPlanPoster('plan-1', file)
    } finally {
      apiClient.defaults.adapter = original
    }

    expect(seen!.method).toBe('post')
    expect(seen!.url).toMatch(/\/membership-plans\/plan-1\/poster$/)
    expect(seen!.data).toBeInstanceOf(FormData)
    const form = seen!.data as FormData
    expect(form.get('image')).toBeInstanceOf(File)
    expect((form.get('image') as File).name).toBe('poster.jpg')
    expect(form.has('poster')).toBe(false)
    expect([...form.keys()]).toEqual(['image'])
  })
})
