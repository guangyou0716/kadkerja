import { screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it } from 'vitest'
import { fakeApi, renderAt, TECH } from '../test/render'

const passwordCalls = (api: ReturnType<typeof fakeApi>) =>
  api.mock.calls.filter(([u, i]) => u === '/api/auth/password' && i?.method === 'POST').map(([, i]) => JSON.parse(String(i?.body)))

async function fill(user: ReturnType<typeof userEvent.setup>, current: string, next: string, again: string) {
  for (const [label, value] of [
    ['Current password', current],
    ['New password', next],
    ['New password again', again],
  ]) {
    await user.clear(screen.getByLabelText(label))
    await user.type(screen.getByLabelText(label), value)
  }
  await user.click(screen.getByRole('button', { name: 'Change password' }))
}

describe('My password', () => {
  it('checks the repeat here, the current password on the server, then changes it', async () => {
    const user = userEvent.setup()
    const api = fakeApi(
      (url, init) => {
        if (url !== '/api/auth/password') return { body: {} }
        return JSON.parse(String(init?.body)).currentPassword === 'my old password'
          ? { status: 204, body: null }
          : { status: 400, body: { detail: 'Some fields need fixing.', fields: { currentPassword: 'this is not your current password' } } }
      },
      { me: TECH },
    )
    renderAt('/account')
    expect(await screen.findByRole('heading', { name: 'My password' })).toBeInTheDocument()
    expect(screen.getByRole('link', { name: 'My password' })).toHaveAttribute('aria-current', 'page')

    await fill(user, 'my old password', 'new passphrase 1', 'new passphrase 2')
    expect(screen.getByText('the two new passwords are not the same')).toBeInTheDocument()
    expect(passwordCalls(api)).toHaveLength(0)

    await fill(user, 'not my password', 'new passphrase 1', 'new passphrase 1')
    expect(await screen.findByText('this is not your current password')).toBeInTheDocument()
    expect(screen.getByLabelText('Current password')).toHaveAttribute('aria-invalid', 'true')

    await fill(user, 'my old password', 'new passphrase 1', 'new passphrase 1')
    expect(await screen.findByText('Password changed. Other devices are signed out.')).toBeInTheDocument()
    expect(passwordCalls(api).at(-1)).toEqual({ currentPassword: 'my old password', newPassword: 'new passphrase 1' })
    expect(screen.getByLabelText('New password')).toHaveValue('')
  })
})
