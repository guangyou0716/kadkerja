import { screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import type { JobSummary } from '../api'
import { renderAt } from '../test/render'
import { installDemo, resetDemo, STORAGE_KEY } from './install'

// The whole staff app and the customer page, running on the in-browser backend.
const realFetch = window.fetch

beforeEach(() => {
  window.localStorage.clear()
  installDemo(window.localStorage)
})
afterEach(() => {
  window.fetch = realFetch
  window.localStorage.clear()
})

async function signIn(username: string) {
  const user = userEvent.setup()
  await user.type(await screen.findByLabelText('Username'), username)
  await user.type(screen.getByLabelText('Password'), 'demo-kadkerja')
  await user.click(screen.getByRole('button', { name: 'Sign in' }))
  return user
}

describe('browser demo (whole app on the in-browser backend)', () => {
  it('signs in as the advisor and shows the seeded board', async () => {
    renderAt('/')
    await signIn('advisor')
    expect(await screen.findByText('Farah Demo · Service advisor')).toBeInTheDocument()
    const waiting = screen.getByRole('region', { name: 'Waiting for customer' })
    expect(within(waiting).getByText('PKR 1234')).toBeInTheDocument()
  })

  it('opens a job card and the customer approves on the link page', async () => {
    const { unmount } = renderAt('/jobs/1')
    await signIn('advisor')
    expect(await screen.findByRole('heading', { name: 'PKR 1234' })).toBeInTheDocument()
    const token = JSON.parse(window.localStorage.getItem(STORAGE_KEY)!).jobs[0].publicToken as string
    unmount()

    const user = userEvent.setup()
    renderAt(`/t/${token}`)
    expect(await screen.findByRole('heading', { name: 'Your quote is ready' })).toBeInTheDocument()
    expect(screen.getByTestId('public-total')).toHaveTextContent('RM 327.24')
    await user.click(screen.getByRole('button', { name: 'Approve' }))
    await user.click(screen.getByRole('button', { name: 'Yes, approve' }))
    expect(await screen.findByRole('heading', { name: /Quote approved/ })).toBeInTheDocument()
    const list = (await (await fetch('/api/jobs')).json()) as JobSummary[]
    expect(list.find((j) => j.plate === 'PKR 1234')?.status).toBe('APPROVED')
  })

  it('a wrong password shows the same message as the server', async () => {
    const user = userEvent.setup()
    renderAt('/')
    await user.type(await screen.findByLabelText('Username'), 'tech')
    await user.type(screen.getByLabelText('Password'), 'wrong')
    await user.click(screen.getByRole('button', { name: 'Sign in' }))
    expect(await screen.findByText('Wrong username or password.')).toBeInTheDocument()
  })

  it('throws away a saved demo from an older version or a damaged save and starts again', async () => {
    const old = { version: 1, seq: 0, signedIn: 'advisor', customers: [], vehicles: [], jobs: [] }
    for (const saved of [JSON.stringify(old), JSON.stringify({ ...old, version: 2 }), '{not json']) {
      window.localStorage.setItem(STORAGE_KEY, saved)
      expect((await fetch('/api/auth/me')).status).toBe(401)
      const state = JSON.parse(window.localStorage.getItem(STORAGE_KEY)!)
      expect(state.version).toBe(2)
      expect(state.jobs).toHaveLength(5)
      expect(state.staff.map((s: { username: string }) => s.username)).toEqual(['advisor', 'tech'])
    }
  })

  it('the technician finds their cars under My jobs', async () => {
    renderAt('/my-jobs')
    await signIn('tech')
    const todo = await screen.findByRole('region', { name: 'To work on' })
    expect(within(todo).getByText('BKE 5021')).toBeInTheDocument()
    expect(within(todo).getByText('PNG 8810')).toBeInTheDocument()
    expect(screen.getByText('2 to work on · 0 waiting · 0 finished')).toBeInTheDocument()
  })

  it('reset throws the changes away and brings back the sample cars', async () => {
    await fetch('/api/auth/login', { method: 'POST', body: JSON.stringify({ username: 'advisor', password: 'demo-kadkerja' }) })
    await fetch('/api/jobs/4/moves', { method: 'POST', body: JSON.stringify({ to: 'CANCELLED' }) })
    expect(JSON.parse(window.localStorage.getItem(STORAGE_KEY)!).jobs[3].status).toBe('CANCELLED')
    resetDemo(window.localStorage)
    expect(window.localStorage.getItem(STORAGE_KEY)).toBeNull()
    expect((await fetch('/api/auth/me')).status).toBe(401)
    expect(JSON.parse(window.localStorage.getItem(STORAGE_KEY)!).jobs[3].status).toBe('RECEIVED')
  })
})
