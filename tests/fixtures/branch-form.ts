import { fireEvent, within, waitFor } from '@testing-library/react'
import { vi } from 'vitest'
import { hostApi } from '@/lib/api/host'
import { pickPlace } from './places'

/** Three uploaded photo URLs (enterprise D8: a branch needs at least 3). */
export const PHOTO_URLS = ['https://cdn.example.test/p1.jpg', 'https://cdn.example.test/p2.jpg', 'https://cdn.example.test/p3.jpg']

/** Stage uploads through POST /host/businesses/staging-images (spy; call in beforeEach). */
export const fakeStagingUploads = () => vi.spyOn(hostApi, 'uploadStagingImages').mockResolvedValue(PHOTO_URLS)

const image = (n: number) => new File(['x'], `p${n}.jpg`, { type: 'image/jpeg' })

/** Add the three photos in a dialog (the photo input is labelled "Photos"). */
export const addPhotos = async (dialog: HTMLElement) => {
  fireEvent.change(within(dialog).getByLabelText(/^photos/i), { target: { files: [image(1), image(2), image(3)] } })
  await within(dialog).findByText(/3 of 3 photos added/i)
}

/**
 * Fill the shared Add Branch dialog: name, city and area through /places, the address typed by
 * hand, three photos and the first plan. The business is left as the dialog chose it.
 */
export const fillAddBranch = async (dialog: HTMLElement, opts: { name?: string; area?: boolean } = {}) => {
  fireEvent.change(within(dialog).getByLabelText(/^branch name/i), { target: { value: opts.name ?? 'New One' } })
  await pickPlace('City', 'Lah', /Lahore/, dialog)
  if (opts.area !== false) await pickPlace('Area', 'Gul', /Gulberg/, dialog)
  fireEvent.change(within(dialog).getByLabelText('Address'), { target: { value: '12 Mall Road' } })
  await addPhotos(dialog)
  fireEvent.change(within(dialog).getByLabelText(/first plan/i), { target: { value: 'Monthly' } })
  fireEvent.change(within(dialog).getByLabelText(/^price/i), { target: { value: '3000' } })
  await waitFor(() => expect(within(dialog).queryByTestId('add-branch-missing')).toBeNull())
}
