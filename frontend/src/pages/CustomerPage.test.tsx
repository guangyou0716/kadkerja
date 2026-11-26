import { screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi } from 'vitest'
import { fakeApi, publicJob, renderAt } from '../test/render'

const TOKEN = 'TestTokenTestTokenTest01'
const bodyOf = (init: RequestInit | undefined) => JSON.parse(String(init?.body))

describe('CustomerPage (no login)', () => {
  it('shows progress and the quote without the staff navigation', async () => {
    fakeApi(() => ({ body: publicJob() }))
    renderAt(`/t/${TOKEN}`)
    expect(await screen.findByRole('heading', { name: 'Your quote is ready' })).toBeInTheDocument()
    expect(screen.getByText('PKR 1234')).toBeInTheDocument()
    expect(screen.getByTestId('public-total')).toHaveTextContent('RM 203.58')
    expect(screen.getByText('(version 2)')).toBeInTheDocument()
    expect(screen.queryByRole('navigation', { name: 'Main' })).not.toBeInTheDocument()
    const progress = screen.getByRole('list', { name: 'Progress' })
    expect(progress.querySelector('[aria-current="step"]')).toHaveTextContent('Quote')
  })

  it('approves after confirming, sending the quote version the page showed', async () => {
    const user = userEvent.setup()
    const api = fakeApi((_url, init) =>
      init?.method === 'POST'
        ? {
            body: publicJob({
              status: 'APPROVED',
              canAnswer: false,
              timeline: [...publicJob().timeline, { status: 'APPROVED', at: '2026-11-26T03:05:00Z', by: 'CUSTOMER' }],
            }),
          }
        : { body: publicJob() },
    )
    renderAt(`/t/${TOKEN}`)
    await user.click(await screen.findByRole('button', { name: 'Approve' }))
    expect(screen.getByText(/Approve RM 203.58 for the 2 items above/)).toBeInTheDocument()
    await user.click(screen.getByRole('button', { name: 'Yes, approve' }))
    expect(await screen.findByRole('heading', { name: /Quote approved/ })).toBeInTheDocument()
    expect(screen.getByText('(by you)')).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Approve' })).not.toBeInTheDocument()
    const [url, init] = api.mock.calls.find(([, i]) => i?.method === 'POST')!
    expect(url).toBe(`/api/public/jobs/${TOKEN}/answer`)
    expect(bodyOf(init)).toEqual({ decision: 'APPROVE', quoteVersion: 2 })
  })

  it('declines with a reason, and Back cancels without sending', async () => {
    const user = userEvent.setup()
    const api = fakeApi((_url, init) =>
      init?.method === 'POST' ? { body: publicJob({ status: 'DECLINED', canAnswer: false }) } : { body: publicJob() },
    )
    renderAt(`/t/${TOKEN}`)
    await user.click(await screen.findByRole('button', { name: 'Approve' }))
    await user.click(screen.getByRole('button', { name: 'Back' }))
    await user.click(screen.getByRole('button', { name: 'Decline' }))
    await user.type(screen.getByLabelText('Reason (optional)'), 'Will do it later')
    await user.click(screen.getByRole('button', { name: 'Yes, decline' }))
    expect(await screen.findByRole('heading', { name: /Quote declined/ })).toBeInTheDocument()
    const posts = api.mock.calls.filter(([, i]) => i?.method === 'POST')
    expect(posts).toHaveLength(1)
    expect(bodyOf(posts[0][1])).toEqual({ decision: 'DECLINE', quoteVersion: 2, note: 'Will do it later' })
  })

  it('when the quote changed meanwhile, says so and shows the new quote', async () => {
    const user = userEvent.setup()
    let gets = 0
    fakeApi((_url, init) => {
      if (init?.method === 'POST') {
        return {
          status: 409,
          body: { detail: 'The workshop changed the quote after you opened it. Check the new quote and answer again.' },
        }
      }
      gets++
      return { body: gets === 1 ? publicJob() : publicJob({ quoteVersion: 3, totalSen: 30000 }) }
    })
    renderAt(`/t/${TOKEN}`)
    await user.click(await screen.findByRole('button', { name: 'Approve' }))
    await user.click(screen.getByRole('button', { name: 'Yes, approve' }))
    expect(await screen.findByRole('alert')).toHaveTextContent('The quote has changed or was already answered')
    await waitFor(() => expect(screen.getByTestId('public-total')).toHaveTextContent('RM 300.00'))
    expect(screen.getByText('(version 3)')).toBeInTheDocument()
  })

  it('hides the quote until it is sent and explains an expired link', async () => {
    fakeApi(() => ({ body: publicJob({ status: 'INSPECTING', quoteVisible: false, canAnswer: false, lines: [] }) }))
    renderAt(`/t/${TOKEN}`)
    expect(await screen.findByRole('heading', { name: 'We are checking your car' })).toBeInTheDocument()
    expect(screen.queryByRole('heading', { name: /Quote/ })).not.toBeInTheDocument()
  })

  it('explains an unknown or expired link', async () => {
    fakeApi(() => ({ status: 404, body: { detail: 'This link is not valid or has expired.' } }))
    renderAt('/t/AAAAAAAAAAAAAAAAAAAAAAAA')
    expect(await screen.findByRole('alert')).toHaveTextContent('ask the workshop for a new link')
  })
})

describe('CustomerPage refresh while confirming', () => {
  it('closes the confirmation when a newer quote arrives', async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true })
    const user = userEvent.setup({ advanceTimers: vi.advanceTimersByTime })
    let version = 2
    fakeApi(() => ({ body: publicJob({ quoteVersion: version }) }))
    renderAt(`/t/${TOKEN}`)
    await user.click(await screen.findByRole('button', { name: 'Approve' }))
    expect(screen.getByRole('button', { name: 'Yes, approve' })).toBeInTheDocument()
    version = 3
    // The page's refresh every 30 s.
    await vi.advanceTimersByTimeAsync(30_000)
    expect(await screen.findByText('(version 3)')).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Yes, approve' })).not.toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Approve' })).toBeInTheDocument()
    vi.useRealTimers()
  })

  it('shows the workshop photos by their key through this link, and none when there are none', async () => {
    const user = userEvent.setup()
    const api = fakeApi((url) =>
      url.includes('/photos/')
        ? { body: {} }
        : {
            body: publicJob({
              photos: [
                { key: 'KeyKeyKeyKeyKey1', stage: 'BEFORE', caption: 'Worn pads' },
                { key: 'KeyKeyKeyKeyKey2', stage: 'AFTER', caption: null },
              ],
            }),
          },
    )
    const first = renderAt(`/t/${TOKEN}`)
    const before = await screen.findByRole('list', { name: 'Before the repair' })
    expect(within(before).getAllByRole('button')).toHaveLength(1)
    expect(screen.getByRole('list', { name: 'After the repair' })).toBeInTheDocument()
    await waitFor(() =>
      expect(api.mock.calls.some(([u]) => u === `/api/public/jobs/${TOKEN}/photos/KeyKeyKeyKeyKey1`)).toBe(true),
    )
    await user.click(screen.getByRole('button', { name: 'Open photo 1: Worn pads' }))
    expect(screen.getByRole('dialog', { name: 'Before the repair' })).toHaveTextContent('Worn pads')
    await user.click(screen.getByRole('button', { name: 'Close' }))
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
    first.unmount()

    fakeApi(() => ({ body: publicJob() }))
    renderAt(`/t/${TOKEN}`)
    await screen.findByRole('heading', { name: 'Your quote is ready' })
    expect(screen.queryByRole('heading', { name: 'Photos from the workshop' })).not.toBeInTheDocument()
  })
})

