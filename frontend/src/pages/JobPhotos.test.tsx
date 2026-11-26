import { screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi } from 'vitest'
import type { Photo } from '../api'
import { fakeApi, job, renderAt, TECH } from '../test/render'

const PHOTOS: Photo[] = [
  { id: 41, publicKey: 'AAAAAAAAAAAAAAA1', stage: 'BEFORE', width: 1600, height: 1200, sizeBytes: 200_000, caption: 'Dent on the door', at: '2026-11-27T01:00:00Z', by: 'Test Advisor' },
  { id: 42, publicKey: 'AAAAAAAAAAAAAAA2', stage: 'BEFORE', width: 1600, height: 1200, sizeBytes: 210_000, caption: null, at: '2026-11-27T01:05:00Z', by: 'Test Tech' },
]
const png = () => new File([new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0, 0])], 'dent.png', { type: 'image/png' })

describe('Job photos', () => {
  it('shows before and after photos; opening one shows the caption and who added it', async () => {
    const user = userEvent.setup()
    const api = fakeApi(() => ({ body: job() }), { photos: PHOTOS })
    renderAt('/jobs/7')
    const before = await screen.findByRole('list', { name: 'Before photos' })
    expect(within(before).getAllByRole('button')).toHaveLength(2)
    expect(screen.getByText('No after photos yet.')).toBeInTheDocument()
    expect(screen.getByText(/2 of 12/)).toBeInTheDocument()
    // Each picture is fetched like the API (session cookie, works in the browser demo).
    await waitFor(() => expect(api.mock.calls.some(([u]) => u === '/api/jobs/7/photos/41')).toBe(true))
    await user.click(screen.getByRole('button', { name: 'Open before photo 1: Dent on the door' }))
    const dialog = screen.getByRole('dialog', { name: 'Before photo' })
    expect(within(dialog).getByText('Dent on the door')).toBeInTheDocument()
    expect(within(dialog).getByText(/Added by Test Advisor/)).toBeInTheDocument()
    await user.keyboard('{Escape}')
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
  })

  it('removes a photo only after confirming', async () => {
    const user = userEvent.setup()
    const api = fakeApi((_url, init) => (init?.method === 'DELETE' ? { status: 204, body: null } : { body: job() }), { photos: PHOTOS })
    const confirm = vi.spyOn(window, 'confirm').mockReturnValueOnce(false).mockReturnValueOnce(true)
    renderAt('/jobs/7')
    await user.click(await screen.findByRole('button', { name: 'Open before photo 2' }))
    await user.click(screen.getByRole('button', { name: 'Remove photo' }))
    expect(api.mock.calls.some(([, i]) => i?.method === 'DELETE')).toBe(false)
    await user.click(screen.getByRole('button', { name: 'Remove photo' }))
    await waitFor(() => expect(api.mock.calls.some(([u, i]) => u === '/api/jobs/7/photos/42' && i?.method === 'DELETE')).toBe(true))
    expect(confirm).toHaveBeenCalledTimes(2)
    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument())
  })

  it('uploads a photo as multipart with the stage and caption and the CSRF header', async () => {
    const user = userEvent.setup()
    const api = fakeApi((url, init) =>
      url === '/api/jobs/7/photos' && init?.method === 'POST' ? { status: 201, body: PHOTOS[0] } : { body: job() },
    )
    renderAt('/jobs/7')
    await user.upload(await screen.findByLabelText('Photo'), png())
    await user.type(screen.getByLabelText('Caption (optional)'), 'Dent on the door')
    await user.click(screen.getByRole('button', { name: 'Add photo' }))
    await waitFor(() => expect(api.mock.calls.some(([u, i]) => u === '/api/jobs/7/photos' && i?.method === 'POST')).toBe(true))
    const [, init] = api.mock.calls.find(([u, i]) => u === '/api/jobs/7/photos' && i?.method === 'POST')!
    const form = init!.body as FormData
    expect(form.get('stage')).toBe('BEFORE')
    expect(form.get('caption')).toBe('Dent on the door')
    expect(form.get('file')).toBeInstanceOf(Blob)
    const headers = init!.headers as Record<string, string>
    expect(headers['X-XSRF-TOKEN']).toBe('test-csrf')
    // The browser sets the multipart boundary itself.
    expect(headers['Content-Type']).toBeUndefined()
  })

  it('refuses a file that is not a JPEG or PNG without calling the server, and shows the server\'s reason', async () => {
    const user = userEvent.setup({ applyAccept: false })
    const api = fakeApi((url, init) =>
      url === '/api/jobs/7/photos' && init?.method === 'POST'
        ? { status: 413, body: { detail: 'Some fields need fixing.', fields: { file: 'this photo is too big (at most 4 MB)' } } }
        : { body: job() },
    )
    renderAt('/jobs/7')
    await user.upload(await screen.findByLabelText('Photo'), new File(['<svg/>'], 'x.svg', { type: 'image/svg+xml' }))
    await user.click(screen.getByRole('button', { name: 'Add photo' }))
    expect(await screen.findByText('Use a JPEG or PNG photo.')).toBeInTheDocument()
    expect(api.mock.calls.some(([u, i]) => u === '/api/jobs/7/photos' && i?.method === 'POST')).toBe(false)
    await user.upload(screen.getByLabelText('Photo'), png())
    await user.click(screen.getByRole('button', { name: 'Add photo' }))
    expect(await screen.findByText('this photo is too big (at most 4 MB)')).toBeInTheDocument()
    expect(screen.getByLabelText('Photo')).toHaveAttribute('aria-invalid', 'true')
  })

  it('offers after photos only once the repair has started', async () => {
    fakeApi(() => ({ body: job() }))
    const first = renderAt('/jobs/7')
    expect(await screen.findByRole('radio', { name: /After the repair/ })).toBeDisabled()
    expect(screen.getByRole('radio', { name: 'Before the repair' })).toBeChecked()
    first.unmount()
    fakeApi(() => ({ body: job({ status: 'IN_PROGRESS', next: ['READY'] }) }))
    renderAt('/jobs/7')
    expect(await screen.findByRole('radio', { name: 'After the repair' })).toBeChecked()
  })

  it('a finished job, someone else\'s car or a full job card has no upload form', async () => {
    fakeApi(() => ({ body: job({ status: 'COLLECTED', next: [] }) }), { photos: PHOTOS })
    const a = renderAt('/jobs/7')
    await screen.findByRole('list', { name: 'Before photos' })
    expect(screen.queryByRole('form', { name: 'Add a photo' })).not.toBeInTheDocument()
    a.unmount()
    fakeApi(() => ({ body: job({ assignedTo: { id: 3, name: 'Other Tech' } }) }), { me: TECH, photos: PHOTOS })
    const b = renderAt('/jobs/7')
    await screen.findByRole('list', { name: 'Before photos' })
    expect(screen.queryByRole('form', { name: 'Add a photo' })).not.toBeInTheDocument()
    b.unmount()
    const twelve = Array.from({ length: 12 }, (_, i) => ({ ...PHOTOS[0], id: 100 + i }))
    fakeApi(() => ({ body: job() }), { photos: twelve })
    renderAt('/jobs/7')
    expect(await screen.findByText('This job card has 12 photos. Remove one to add another.')).toBeInTheDocument()
    expect(screen.queryByRole('form', { name: 'Add a photo' })).not.toBeInTheDocument()
  })
})
