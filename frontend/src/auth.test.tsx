import { screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it } from 'vitest'
import { ADVISOR, fakeApi, job, renderAt, TECH } from './test/render'

const headersOf = (init: RequestInit | undefined) => (init?.headers ?? {}) as Record<string, string>

describe('staff sign-in', () => {
  it('shows the sign-in form until signed in, then the board', async () => {
    const user = userEvent.setup()
    let signedIn = false
    const api = fakeApi(
      (url, init) => {
        if (url === '/api/auth/login') {
          const { password } = JSON.parse(String(init?.body))
          if (password !== 'right') return { status: 401, body: { detail: 'Wrong username or password.' } }
          signedIn = true
          return { body: ADVISOR }
        }
        return { body: [] }
      },
      { me: null },
    )
    renderAt('/')
    expect(await screen.findByRole('heading', { name: 'Staff sign-in' })).toBeInTheDocument()
    expect(screen.queryByRole('navigation', { name: 'Main' })).not.toBeInTheDocument()
    await user.type(screen.getByLabelText('Username'), 'advisor')
    await user.type(screen.getByLabelText('Password'), 'wrong')
    await user.click(screen.getByRole('button', { name: 'Sign in' }))
    expect(await screen.findByRole('alert')).toHaveTextContent('Wrong username or password.')
    await user.clear(screen.getByLabelText('Password'))
    await user.type(screen.getByLabelText('Password'), 'right')
    await user.click(screen.getByRole('button', { name: 'Sign in' }))
    expect(await screen.findByText('Test Advisor · Service advisor')).toBeInTheDocument()
    expect(signedIn).toBe(true)
    // Sign-in is a change too: it carries the CSRF token.
    const [, init] = api.mock.calls.find(([u]) => u === '/api/auth/login')!
    expect(headersOf(init)['X-XSRF-TOKEN']).toBe('test-csrf')
  })

  it('sends the CSRF token with staff changes but not with the customer link', async () => {
    const user = userEvent.setup()
    const api = fakeApi((url, init) =>
      init?.method === 'POST' && url.endsWith('/lines') ? { body: job() } : { body: job() },
    )
    renderAt('/jobs/7')
    await screen.findByRole('heading', { name: 'PKR 1234' })
    await user.type(screen.getByLabelText('Description'), 'Oil')
    await user.type(screen.getByLabelText('Unit price (RM)'), '10')
    await user.click(screen.getByRole('button', { name: 'Add line' }))
    await waitFor(() => expect(api.mock.calls.some(([u, i]) => u === '/api/jobs/7/lines' && i?.method === 'POST')).toBe(true))
    const [, init] = api.mock.calls.find(([u, i]) => u === '/api/jobs/7/lines' && i?.method === 'POST')!
    expect(headersOf(init)['X-XSRF-TOKEN']).toBe('test-csrf')
  })

  it('goes back to the sign-in form when the session has ended', async () => {
    let expired = false
    fakeApi(
      (url) => (url === '/api/jobs' && expired ? { status: 401, body: { detail: 'Please sign in to continue.' } } : { body: [] }),
    )
    renderAt('/')
    expect(await screen.findByText('Test Advisor · Service advisor')).toBeInTheDocument()
    // The session ends on the server: the next call gets 401 and /me says so too.
    expired = true
    fakeApi(
      (url) => (url === '/api/jobs' ? { status: 401, body: { detail: 'Please sign in to continue.' } } : { body: [] }),
      { me: null },
    )
    window.dispatchEvent(new Event('kadkerja:signed-out'))
    expect(await screen.findByRole('heading', { name: 'Staff sign-in' })).toBeInTheDocument()
  })

  it('signs out', async () => {
    const user = userEvent.setup()
    let out = false
    const api = fakeApi(
      (url) => {
        if (url === '/api/auth/logout') {
          out = true
          // From now on the server no longer knows this browser.
          fakeApi(() => ({ body: [] }), { me: null })
          return { status: 204, body: null }
        }
        return { body: [] }
      },
    )
    renderAt('/')
    await user.click(await screen.findByRole('button', { name: 'Sign out' }))
    expect(await screen.findByRole('heading', { name: 'Staff sign-in' })).toBeInTheDocument()
    expect(out).toBe(true)
    expect(api.mock.calls.some(([u, i]) => u === '/api/auth/logout' && i?.method === 'POST')).toBe(true)
    expect(screen.queryByText('Test Advisor · Service advisor')).not.toBeInTheDocument()
  })
})

describe('technician', () => {
  it('has no check-in and no customer link, and sees only workshop moves', async () => {
    fakeApi(() => ({ body: job({ status: 'APPROVED', next: ['IN_PROGRESS'] }) }), { me: TECH })
    renderAt('/jobs/7')
    expect(await screen.findByRole('heading', { name: 'PKR 1234' })).toBeInTheDocument()
    expect(screen.getByText('Test Tech · Technician')).toBeInTheDocument()
    expect(screen.queryByRole('link', { name: 'Check in a car' })).not.toBeInTheDocument()
    expect(screen.queryByRole('heading', { name: 'Customer link' })).not.toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Start repair' })).toBeInTheDocument()
  })

  it('leaves quote answers and cancelling to the advisor', async () => {
    fakeApi(() => ({ body: job({ status: 'QUOTED', next: ['APPROVED', 'DECLINED', 'INSPECTING', 'CANCELLED'] }) }), {
      me: TECH,
    })
    renderAt('/jobs/7')
    expect(await screen.findByText('The next step is for the service advisor.')).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Cancel job' })).not.toBeInTheDocument()
  })

  it('is told check-in is for the advisor', async () => {
    fakeApi(() => ({ body: [] }), { me: TECH })
    renderAt('/check-in')
    expect(await screen.findByText('Only the service advisor checks in cars.')).toBeInTheDocument()
  })
})
