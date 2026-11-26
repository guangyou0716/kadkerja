import { screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi } from 'vitest'
import { fakeApi, renderAt, STAFF, TECH } from '../test/render'

const bodyOf = (init: RequestInit | undefined) => JSON.parse(String(init?.body))
const posts = (api: ReturnType<typeof fakeApi>, url: string) =>
  api.mock.calls.filter(([u, i]) => u === url && i?.method === 'POST').map(([, i]) => bodyOf(i))

describe('Staff page', () => {
  it('lists everyone with role and status; my own row has no buttons', async () => {
    fakeApi(() => ({ body: {} }))
    renderAt('/staff')
    const table = await screen.findByRole('table')
    const rows = within(table).getAllByRole('row').slice(1)
    expect(rows.map((r) => r.querySelector('td')?.textContent)).toEqual(['Test Advisor(you)', 'Test Tech', 'Other Tech', 'Left Tech'])
    expect(within(rows[0]).queryByRole('button')).not.toBeInTheDocument()
    expect(within(rows[3]).getByText('Deactivated')).toBeInTheDocument()
    expect(within(rows[3]).getByRole('button', { name: 'Reactivate Left Tech' })).toBeInTheDocument()
    expect(screen.getByRole('link', { name: 'Staff' })).toHaveAttribute('aria-current', 'page')
  })

  it('adds a member of staff, showing a taken username next to the field', async () => {
    const user = userEvent.setup()
    let taken = true
    const api = fakeApi((url, init) => {
      if (url === '/api/staff' && init?.method === 'POST') {
        if (taken) {
          taken = false
          return { status: 409, body: { detail: 'Some fields need fixing.', fields: { username: 'this username is taken' } } }
        }
        return { status: 201, body: { id: 9, username: 'aina', name: 'Aina Test', role: 'TECHNICIAN', active: true } }
      }
      return { body: {} }
    })
    renderAt('/staff')
    await screen.findByRole('table')
    await user.type(screen.getByLabelText('Full name'), 'Aina Test')
    await user.type(screen.getByLabelText('Username'), 'tech')
    await user.type(screen.getByLabelText('First password'), 'a long first password')
    await user.click(screen.getByRole('button', { name: 'Add' }))
    expect(await screen.findByText('this username is taken')).toBeInTheDocument()
    expect(screen.getByLabelText('Username')).toHaveAttribute('aria-invalid', 'true')
    await user.clear(screen.getByLabelText('Username'))
    await user.type(screen.getByLabelText('Username'), 'aina')
    await user.click(screen.getByRole('button', { name: 'Add' }))
    expect(await screen.findByText('Aina Test can now sign in as aina.')).toBeInTheDocument()
    expect(posts(api, '/api/staff').at(-1)).toEqual({ name: 'Aina Test', username: 'aina', role: 'TECHNICIAN', password: 'a long first password' })
    expect(screen.getByLabelText('First password')).toHaveValue('')
  })

  it('deactivates only after confirming; reactivates without asking', async () => {
    const user = userEvent.setup()
    const api = fakeApi((url) =>
      url.endsWith('/deactivate')
        ? { body: { ...STAFF[1], active: false } }
        : url.endsWith('/activate')
          ? { body: { ...STAFF[3], active: true } }
          : { body: {} },
    )
    const confirm = vi.spyOn(window, 'confirm').mockReturnValueOnce(false).mockReturnValueOnce(true)
    renderAt('/staff')
    await user.click(await screen.findByRole('button', { name: 'Deactivate Test Tech' }))
    expect(posts(api, '/api/staff/2/deactivate')).toHaveLength(0)
    await user.click(screen.getByRole('button', { name: 'Deactivate Test Tech' }))
    expect(await screen.findByText('Test Tech is deactivated and signed out.')).toBeInTheDocument()
    expect(posts(api, '/api/staff/2/deactivate')).toHaveLength(1)
    await user.click(screen.getByRole('button', { name: 'Reactivate Left Tech' }))
    expect(await screen.findByText('Left Tech can sign in again.')).toBeInTheDocument()
    expect(confirm).toHaveBeenCalledTimes(2)
    confirm.mockRestore()
  })

  it('sets a new password for someone, with the server check shown on the field', async () => {
    const user = userEvent.setup()
    const api = fakeApi((url, init) => {
      if (url === '/api/staff/3/password') {
        return bodyOf(init).password.length < 12
          ? { status: 400, body: { detail: 'Some fields need fixing.', fields: { password: 'use at least 12 characters' } } }
          : { body: STAFF[2] }
      }
      return { body: {} }
    })
    renderAt('/staff')
    await user.click(await screen.findByRole('button', { name: 'Set password for Other Tech' }))
    const input = screen.getByLabelText('New password for Other Tech')
    await user.type(input, 'short')
    await user.click(screen.getByRole('button', { name: 'Save password' }))
    expect(await screen.findByText('use at least 12 characters')).toBeInTheDocument()
    await user.clear(input)
    await user.type(input, 'a much longer one')
    await user.click(screen.getByRole('button', { name: 'Save password' }))
    expect(await screen.findByText('New password set for Other Tech. Their other sessions are signed out.')).toBeInTheDocument()
    expect(screen.queryByLabelText('New password for Other Tech')).not.toBeInTheDocument()
    expect(posts(api, '/api/staff/3/password').at(-1)).toEqual({ password: 'a much longer one' })
  })

  it('a technician has no staff page and never asks for the list', async () => {
    const api = fakeApi(() => ({ body: [] }), { me: TECH })
    renderAt('/staff')
    expect(await screen.findByText('Only the service advisor manages staff.')).toBeInTheDocument()
    expect(screen.queryByRole('link', { name: 'Staff' })).not.toBeInTheDocument()
    await waitFor(() => expect(api.mock.calls.some(([u]) => u === '/api/staff')).toBe(false))
  })
})
