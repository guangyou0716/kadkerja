import { screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi } from 'vitest'
import { fakeApi, job, renderAt } from '../test/render'

async function fill(user: ReturnType<typeof userEvent.setup>) {
  await user.type(screen.getByLabelText('Name'), 'Test Customer')
  await user.type(screen.getByLabelText('Phone'), '012-0000001')
  await user.type(screen.getByLabelText('Plate'), 'pkr1234')
  await user.type(screen.getByLabelText('Make'), 'Perodua')
  await user.type(screen.getByLabelText('Model'), 'Myvi')
  await user.type(screen.getByLabelText('Complaint'), 'Brakes squeak')
}

describe('CheckInPage', () => {
  it('checks the car in and opens its job card', async () => {
    const user = userEvent.setup()
    const api = fakeApi((_url, init) => (init?.method === 'POST' ? { status: 201, body: job() } : { body: job() }))
    renderAt('/check-in')
    await fill(user)
    await user.type(screen.getByLabelText('Mileage (km)'), '84210')
    await user.click(screen.getByRole('button', { name: 'Check in' }))
    expect(await screen.findByRole('heading', { name: 'PKR 1234' })).toBeInTheDocument()
    const [, init] = api.mock.calls.find(([u, i]) => u === '/api/jobs' && i?.method === 'POST')!
    expect(JSON.parse(String(init?.body))).toEqual({
      customerName: 'Test Customer',
      phone: '012-0000001',
      plate: 'pkr1234',
      make: 'Perodua',
      model: 'Myvi',
      mileageKm: 84210,
      complaint: 'Brakes squeak',
    })
  })

  it('shows the server message next to each field', async () => {
    const user = userEvent.setup()
    fakeApi(() => ({
      status: 400,
      body: {
        title: 'Check the form',
        detail: 'Some fields need fixing.',
        fields: { phone: 'use a Malaysian phone number like 012-3456789', complaint: 'must not be blank' },
      },
    }))
    renderAt('/check-in')
    await user.click(screen.getByRole('button', { name: 'Check in' }))
    expect(await screen.findByText('use a Malaysian phone number like 012-3456789')).toBeInTheDocument()
    expect(screen.getByLabelText('Phone')).toHaveAttribute('aria-invalid', 'true')
    expect(screen.getByLabelText('Phone')).toHaveAccessibleDescription('use a Malaysian phone number like 012-3456789')
    expect(screen.getByLabelText('Complaint')).toHaveAttribute('aria-invalid', 'true')
    expect(screen.getByLabelText('Name')).toHaveAttribute('aria-invalid', 'false')
    expect(screen.getByRole('alert')).toHaveTextContent('Some fields need fixing.')
  })

  it('a car with an open job card is refused with the reason', async () => {
    const user = userEvent.setup()
    fakeApi(() => ({ status: 409, body: { detail: 'PKR 1234 already has an open job card; finish or cancel it first.' } }))
    renderAt('/check-in')
    await fill(user)
    await user.click(screen.getByRole('button', { name: 'Check in' }))
    expect(await screen.findByRole('alert')).toHaveTextContent('already has an open job card')
  })

  it('says when the server cannot be reached', async () => {
    const user = userEvent.setup()
    vi.stubGlobal('fetch', vi.fn(async () => { throw new TypeError('Failed to fetch') }))
    renderAt('/check-in')
    await fill(user)
    await user.click(screen.getByRole('button', { name: 'Check in' }))
    expect(await screen.findByRole('alert')).toHaveTextContent('Cannot reach the server')
  })
})
