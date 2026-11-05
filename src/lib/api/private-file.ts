import apiClient from './client'

/**
 * Private files (KYC documents, payment proofs) are served only by authenticated API routes
 * (decision R-27; Phase 7 P9c item A), so the CMS fetches them with the signed-in client as a
 * Blob and shows an object URL — never a plain link, which would carry no token.
 *
 * The API names these routes with their full path (`/api/v1/payments/<id>/proof`). The client's
 * baseURL already ends in `/api/v1`, and axios appends a `/`-leading path to it, so the prefix is
 * removed here (NEW-222: the admin KYC viewer requested `/api/v1/api/v1/...` and got 404).
 */
export const toClientPath = (apiPath: string): string => apiPath.replace(/^\/api\/v1(?=\/)/, '')

export async function fetchPrivateFile(apiPath: string): Promise<Blob> {
  const { data } = await apiClient.get(toClientPath(apiPath), { responseType: 'blob' })
  return data
}
