import { describe, expect, it } from 'vitest'
import type { JobCard, JobSummary, Me, PublicJob, StaffMember } from '../api'
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
    expect(ok.body).toEqual({ id: 2, username: 'tech', name: 'Hafiz Demo', role: 'TECHNICIAN' } satisfies Me)
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

describe('demo backend: technicians', () => {
  const addTech = (b: DemoBackend, active = true) => {
    b.state.staff.push({ id: 3, username: 'tech2', name: 'Other Demo', role: 'TECHNICIAN', active, password: DEMO_PASSWORD })
  }

  it('the seeded technician has two cars and sees only those in my jobs', () => {
    const b = signedIn('tech')
    const mine = b.handle('GET', '/api/jobs?mine=true', undefined).body as JobSummary[]
    expect(mine.map((j) => [j.plate, j.assignedTo?.name])).toEqual([
      ['BKE 5021', 'Hafiz Demo'],
      ['PNG 8810', 'Hafiz Demo'],
    ])
    expect(jobs(b).find((j) => j.plate === 'PKR 1234')?.assignedTo).toBeNull()
  })

  it('the advisor assigns only an active technician, and not on a finished job', () => {
    const b = signedIn()
    addTech(b, false)
    const j = byPlate(b, 'PJM 77')
    const put = (staffId: unknown) => b.handle('PUT', `/api/jobs/${j.id}/assignee`, { staffId })
    for (const id of [1, 3, 99]) expect(put(id)).toMatchObject({ status: 409, body: { detail: 'Pick an active technician.' } })
    expect(put('x').status).toBe(400)
    expect((put(2).body as JobCard).assignedTo).toEqual({ id: 2, name: 'Hafiz Demo' })
    expect((put(null).body as JobCard).assignedTo).toBeNull()
    b.handle('POST', `/api/jobs/${j.id}/moves`, { to: 'CANCELLED' })
    expect(put(2)).toMatchObject({ status: 409, body: { detail: 'A CANCELLED job cannot be reassigned.' } })
  })

  it('a technician cannot assign, list staff, or work on another technician\'s car', () => {
    const b = signedIn()
    addTech(b)
    const received = byPlate(b, 'PJM 77')
    b.handle('PUT', `/api/jobs/${received.id}/assignee`, { staffId: 3 })
    b.handle('POST', '/api/auth/login', { username: 'tech', password: DEMO_PASSWORD })
    expect(b.handle('GET', '/api/staff', undefined).status).toBe(403)
    expect(b.handle('PUT', `/api/jobs/${received.id}/assignee`, { staffId: 2 }).status).toBe(403)
    expect(b.handle('POST', `/api/jobs/${received.id}/moves`, { to: 'INSPECTING' })).toMatchObject({
      status: 403,
      body: { detail: 'This job is assigned to Other Demo. Ask the service advisor to reassign it.' },
    })
    expect(b.handle('POST', `/api/jobs/${received.id}/lines`, { kind: 'PART', description: 'x', quantity: 1, unitPriceSen: 1, taxable: true }).status).toBe(403)
  })

  it('a technician who starts an unassigned car takes it; a refused move does not', () => {
    const b = signedIn('tech')
    const received = byPlate(b, 'PJM 77')
    expect(b.handle('POST', `/api/jobs/${received.id}/moves`, { to: 'CANCELLED' }).status).toBe(403)
    expect(card(b, received.id).assignedTo).toBeNull()
    const started = b.handle('POST', `/api/jobs/${received.id}/moves`, { to: 'INSPECTING' }).body as JobCard
    expect(started.assignedTo).toEqual({ id: 2, name: 'Hafiz Demo' })
  })

  it('the staff list is active people first and has no passwords', () => {
    const b = signedIn()
    addTech(b, false)
    const list = b.handle('GET', '/api/staff', undefined).body as StaffMember[]
    expect(list.map((s) => [s.username, s.active])).toEqual([
      ['advisor', true],
      ['tech', true],
      ['tech2', false],
    ])
    expect(JSON.stringify(list)).not.toMatch(/password/i)
  })

  it('a deactivated account cannot sign in and is signed out', () => {
    const b = signedIn('tech')
    b.state.staff[1].active = false
    expect(b.handle('GET', '/api/auth/me', undefined).status).toBe(401)
    expect(b.handle('POST', '/api/auth/login', { username: 'tech', password: DEMO_PASSWORD })).toEqual({
      status: 401,
      body: { detail: 'Wrong username or password.' },
    })
  })
})

describe('demo backend: staff management', () => {
  const NEW = 'a brand new passphrase'
  const add = (b: DemoBackend, over: Record<string, unknown> = {}) =>
    b.handle('POST', '/api/staff', { username: ' Tech.Two ', name: 'New Demo', role: 'TECHNICIAN', password: NEW, ...over })

  it('the advisor adds someone who can then sign in with that password', () => {
    const b = signedIn()
    const created = add(b)
    expect(created).toEqual({ status: 201, body: { id: 3, username: 'tech.two', name: 'New Demo', role: 'TECHNICIAN', active: true } })
    expect(b.handle('POST', '/api/auth/login', { username: 'tech.two', password: NEW }).status).toBe(200)
    expect(b.handle('POST', '/api/auth/login', { username: 'tech.two', password: DEMO_PASSWORD }).status).toBe(401)
  })

  it('checks new accounts like the server', () => {
    const b = signedIn()
    expect(add(b, { username: 'TECH' })).toEqual({ status: 409, body: { detail: 'Some fields need fixing.', fields: { username: 'this username is taken' } } })
    expect(add(b, { username: 'new1', password: 'too short' }).body).toMatchObject({ fields: { password: 'use at least 12 characters' } })
    expect(add(b, { username: 'new2', password: '密'.repeat(30) }).body).toMatchObject({ fields: { password: 'use at most 72 bytes (about 72 letters)' } })
    expect(add(b, { username: 'no spaces' }).status).toBe(400)
    expect(add(b, { username: 'new3', role: 'OWNER' }).status).toBe(400)
    b.handle('POST', '/api/auth/login', { username: 'tech', password: DEMO_PASSWORD })
    expect(add(b, { username: 'new4' }).status).toBe(403)
    expect(b.state.staff).toHaveLength(2)
  })

  it('deactivating signs them out, hands back open jobs only, and reactivating lets them in', () => {
    const b = signedIn()
    const done = byPlate(b, 'PJM 77')
    b.handle('PUT', `/api/jobs/${done.id}/assignee`, { staffId: 2 })
    b.handle('POST', `/api/jobs/${done.id}/moves`, { to: 'CANCELLED' })
    expect(b.handle('POST', '/api/staff/2/deactivate', {}).body).toMatchObject({ active: false })
    expect(byPlate(b, 'BKE 5021').assignedTo).toBeNull()
    expect(card(b, done.id).assignedTo).toEqual({ id: 2, name: 'Hafiz Demo' })
    expect(b.handle('POST', '/api/auth/login', { username: 'tech', password: DEMO_PASSWORD }).status).toBe(401)
    b.handle('POST', '/api/auth/login', { username: 'advisor', password: DEMO_PASSWORD })
    expect(b.handle('POST', '/api/staff/2/activate', {}).body).toMatchObject({ active: true })
    expect(b.handle('POST', '/api/auth/login', { username: 'tech', password: DEMO_PASSWORD }).status).toBe(200)
  })

  it('nobody deactivates themselves or sets their own password here; another advisor can be deactivated', () => {
    const b = signedIn()
    expect(b.handle('POST', '/api/staff/1/deactivate', {})).toMatchObject({ status: 409, body: { detail: 'You cannot deactivate your own account.' } })
    expect(b.handle('POST', '/api/staff/1/password', { password: NEW })).toMatchObject({
      status: 409,
      body: { detail: 'Use "Change my password" for your own account.' },
    })
    expect(b.handle('POST', '/api/staff/99/deactivate', {}).status).toBe(404)
    add(b, { username: 'boss2', role: 'ADVISOR' })
    b.handle('POST', '/api/auth/login', { username: 'boss2', password: NEW })
    expect(b.handle('POST', '/api/staff/1/deactivate', {}).body).toMatchObject({ username: 'advisor', active: false })
    // boss2 is now the only active advisor; the advisor who was just deactivated is signed out.
    expect(b.handle('POST', '/api/auth/login', { username: 'advisor', password: DEMO_PASSWORD }).status).toBe(401)
  })

  it('the advisor sets a new password; I change my own with the current one', () => {
    const b = signedIn()
    expect(b.handle('POST', '/api/staff/2/password', { password: 'short' }).body).toMatchObject({ fields: { password: 'use at least 12 characters' } })
    expect(b.handle('POST', '/api/staff/2/password', { password: NEW }).status).toBe(200)
    expect(b.handle('POST', '/api/auth/login', { username: 'tech', password: DEMO_PASSWORD }).status).toBe(401)
    expect(b.handle('POST', '/api/auth/login', { username: 'tech', password: NEW }).status).toBe(200)
    const change = (currentPassword: string, newPassword: string) => b.handle('POST', '/api/auth/password', { currentPassword, newPassword })
    expect(change('wrong one!!!', 'another passphrase').body).toMatchObject({ fields: { currentPassword: 'this is not your current password' } })
    expect(change(NEW, NEW).body).toMatchObject({ fields: { newPassword: 'choose a password different from the current one' } })
    expect(change(NEW, 'another passphrase').status).toBe(204)
    expect(b.handle('GET', '/api/auth/me', undefined).status).toBe(200)
    expect(b.handle('POST', '/api/auth/login', { username: 'tech', password: 'another passphrase' }).status).toBe(200)
    expect(JSON.stringify(b.handle('GET', '/api/staff', undefined))).not.toContain('passphrase')
  })
})
