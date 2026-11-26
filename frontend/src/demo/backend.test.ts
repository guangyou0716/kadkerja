import { describe, expect, it } from 'vitest'
import type { JobCard, JobSummary, Me, PublicJob } from '../api'
import { DEMO_PASSWORD, DemoBackend } from './backend'

const NOW = new Date('2026-11-27T02:00:00Z')

function signedIn(username = 'advisor') {
  const b = DemoBackend.seeded(() => NOW)
  expect(b.handle('POST', '/api/auth/login', { username, password: DEMO_PASSWORD }).status).toBe(200)
  return b
}
const jobs = (b: DemoBackend) => b.handle('GET', '/api/jobs', undefined).body as JobSummary[]
const card = (b: DemoBackend, id: number) => b.handle('GET', `/api/jobs/${id}`, undefined).body as JobCard
const byPlate = (b: DemoBackend, plate: string) => card(b, jobs(b).find((j) => j.plate === plate)!.id)

describe('demo backend: sign-in', () => {
  it('asks for sign-in, refuses a wrong password, accepts the published demo logins', () => {
    const b = DemoBackend.seeded(() => NOW)
    expect(b.handle('GET', '/api/auth/me', undefined).status).toBe(401)
    expect(b.handle('GET', '/api/jobs', undefined).status).toBe(401)
    const wrong = b.handle('POST', '/api/auth/login', { username: 'advisor', password: 'nope' })
    expect(wrong).toEqual({ status: 401, body: { detail: 'Wrong username or password.' } })
    const ok = b.handle('POST', '/api/auth/login', { username: 'tech', password: DEMO_PASSWORD })
    expect(ok.body).toEqual({ username: 'tech', name: 'Hafiz Demo', role: 'TECHNICIAN' } satisfies Me)
    expect(b.handle('POST', '/api/auth/logout', {}).status).toBe(204)
    expect(b.handle('GET', '/api/auth/me', undefined).status).toBe(401)
  })
})

describe('demo backend: seed', () => {
  it('has five made-up cars at different steps, newest first', () => {
    const list = jobs(signedIn())
    expect(list.map((j) => [j.number, j.plate, j.status])).toEqual([
      ['KK-2026-0005', 'WXY 3388', 'READY'],
      ['KK-2026-0004', 'PJM 77', 'RECEIVED'],
      ['KK-2026-0003', 'BKE 5021', 'IN_PROGRESS'],
      ['KK-2026-0002', 'PNG 8810', 'INSPECTING'],
      ['KK-2026-0001', 'PKR 1234', 'QUOTED'],
    ])
    expect(list.every((j) => j.customer.endsWith(' Demo'))).toBe(true)
  })

  it('totals the quote with 8% SST on taxable lines only', () => {
    const b = signedIn()
    expect(byPlate(b, 'PKR 1234')).toMatchObject({ quoteVersion: 1, subtotalSen: 30300, taxSen: 2424, totalSen: 32724 })
    expect(byPlate(b, 'WXY 3388')).toMatchObject({ subtotalSen: 26000, taxSen: 1840, totalSen: 27840 })
  })
})

describe('demo backend: job flow', () => {
  it('checks in a car, quotes it, and the customer approves through the link', () => {
    const b = signedIn()
    const created = b.handle('POST', '/api/jobs', {
      customerName: 'Nurul Demo', phone: '019-0000006', plate: 'vbn 4455', make: 'Proton', model: 'X50', complaint: 'Noise from the front left wheel.',
    })
    expect(created.status).toBe(201)
    const job = created.body as JobCard
    expect(job).toMatchObject({ number: 'KK-2026-0006', status: 'RECEIVED', next: ['INSPECTING', 'CANCELLED'], vehicle: { plate: 'VBN 4455' } })

    expect(b.handle('POST', `/api/jobs/${job.id}/moves`, { to: 'INSPECTING' }).status).toBe(200)
    expect(b.handle('POST', `/api/jobs/${job.id}/moves`, { to: 'QUOTED' })).toMatchObject({
      status: 409, body: { detail: 'Add at least one quote line before sending the quote.' },
    })
    b.handle('POST', `/api/jobs/${job.id}/lines`, { kind: 'PART', description: 'Wheel bearing', quantity: 1, unitPriceSen: 15000, taxable: true })
    const quoted = b.handle('POST', `/api/jobs/${job.id}/moves`, { to: 'QUOTED', note: 'Bearing worn' }).body as JobCard
    expect(quoted).toMatchObject({ status: 'QUOTED', quoteVersion: 1, totalSen: 16200 })

    const link = `/api/public/jobs/${quoted.publicToken}`
    const seen = b.handle('GET', link, undefined).body as PublicJob
    expect(seen).toMatchObject({ status: 'QUOTED', canAnswer: true, quoteVisible: true, totalSen: 16200 })
    const approved = b.handle('POST', `${link}/answer`, { decision: 'APPROVE', quoteVersion: 1 }).body as PublicJob
    expect(approved).toMatchObject({ status: 'APPROVED', canAnswer: false })
    expect(approved.timeline.at(-1)).toMatchObject({ status: 'APPROVED', by: 'CUSTOMER' })
    expect(b.handle('POST', `${link}/answer`, { decision: 'DECLINE', quoteVersion: 1 })).toMatchObject({
      status: 409, body: { detail: 'This quote has already been answered (APPROVED).' },
    })
  })

  it('refuses an answer to a quote that has been redone since the page loaded', () => {
    const b = signedIn()
    const j = byPlate(b, 'PKR 1234')
    b.handle('POST', `/api/jobs/${j.id}/moves`, { to: 'INSPECTING' })
    b.handle('POST', `/api/jobs/${j.id}/moves`, { to: 'QUOTED' })
    const res = b.handle('POST', `/api/public/jobs/${j.publicToken}/answer`, { decision: 'APPROVE', quoteVersion: 1 })
    expect(res).toMatchObject({ status: 409, body: { detail: expect.stringContaining('changed the quote') } })
  })

  it('locks the quote once sent and refuses moves the flow does not allow', () => {
    const b = signedIn()
    const j = byPlate(b, 'PKR 1234')
    expect(b.handle('POST', `/api/jobs/${j.id}/lines`, { kind: 'LABOUR', description: 'Extra', quantity: 1, unitPriceSen: 100, taxable: false }).status).toBe(409)
    expect(b.handle('POST', `/api/jobs/${j.id}/moves`, { to: 'READY' })).toMatchObject({ status: 409, body: { detail: 'A job that is QUOTED cannot move to READY.' } })
  })

  it('lets the technician make only the technician moves', () => {
    const b = signedIn('tech')
    const quoted = byPlate(b, 'PKR 1234')
    expect(b.handle('POST', `/api/jobs/${quoted.id}/moves`, { to: 'APPROVED' }).status).toBe(403)
    const received = byPlate(b, 'PJM 77')
    expect(b.handle('POST', `/api/jobs/${received.id}/moves`, { to: 'INSPECTING' }).status).toBe(200)
    expect(b.handle('POST', '/api/jobs', {}).status).toBe(403)
    expect(b.handle('POST', `/api/jobs/${received.id}/link`, {}).status).toBe(403)
  })

  it('checks the form like the server and refuses a second open job for the same car', () => {
    const b = signedIn()
    const bad = b.handle('POST', '/api/jobs', { customerName: '', phone: '12345', plate: 'PKR-1234', make: 'Perodua', model: 'Myvi', complaint: 'x' })
    expect(bad).toMatchObject({
      status: 400,
      body: { fields: { customerName: 'must not be blank', phone: expect.stringContaining('Malaysian'), plate: expect.stringContaining('letters') } },
    })
    const again = b.handle('POST', '/api/jobs', { customerName: 'Aiman Demo', phone: '0120000001', plate: 'PKR1234', make: 'Perodua', model: 'Myvi', complaint: 'Again' })
    expect(again).toMatchObject({ status: 409, body: { detail: 'PKR 1234 already has an open job card; finish or cancel it first.' } })
  })
})

describe('demo backend: customer link', () => {
  it('shows no name, phone, ids or staff notes, and no draft quote', () => {
    const b = signedIn()
    const inspecting = byPlate(b, 'PNG 8810')
    b.handle('POST', `/api/jobs/${inspecting.id}/lines`, { kind: 'LABOUR', description: 'Gas top-up', quantity: 1, unitPriceSen: 8000, taxable: true })
    const draft = b.handle('GET', `/api/public/jobs/${inspecting.publicToken}`, undefined).body as PublicJob
    expect(draft).toMatchObject({ quoteVisible: false, lines: [], totalSen: 0, canAnswer: false })
    const text = JSON.stringify(draft)
    expect(text).not.toContain('Mei Ling')
    expect(text).not.toContain('012-0000002')
    expect(text).not.toContain('Bay 2')
    expect(text).not.toMatch(/"id"/)
  })

  it('a new link replaces the old one at once; unknown links are 404', () => {
    const b = signedIn()
    const j = byPlate(b, 'PKR 1234')
    const fresh = b.handle('POST', `/api/jobs/${j.id}/link`, {}).body as JobCard
    expect(fresh.publicToken).toMatch(/^[A-Za-z0-9_-]{24}$/)
    expect(fresh.publicToken).not.toBe(j.publicToken)
    expect(b.handle('GET', `/api/public/jobs/${j.publicToken}`, undefined)).toEqual({ status: 404, body: { detail: 'This link is not valid or has expired.' } })
    expect(b.handle('GET', `/api/public/jobs/${fresh.publicToken}`, undefined).status).toBe(200)
  })
})
