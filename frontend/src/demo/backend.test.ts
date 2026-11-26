import { describe, expect, it } from 'vitest'
import type { JobCard, JobSummary, Me, Part, PublicJob, StaffMember, StockMovement } from '../api'
import { DEMO_PASSWORD, DEMO_PHOTO_MAX_BYTES, DemoBackend, imageSize } from './backend'

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

describe('demo backend: parts shelf', () => {
  const shelf = (b: DemoBackend) => b.handle('GET', '/api/parts', undefined).body as Part[]
  const onHand = (b: DemoBackend, sku: string) => shelf(b).find((p) => p.sku === sku)!.onHand
  const partId = (b: DemoBackend, sku: string) => shelf(b).find((p) => p.sku === sku)!.id
  const token = (b: DemoBackend, plate: string) => byPlate(b, plate).publicToken

  it('seeds four parts; the two approved demo jobs already took theirs', () => {
    const b = signedIn()
    expect(shelf(b).map((p) => [p.sku, p.onHand, p.low])).toEqual([
      ['BAT-NS40ZL', 3, false],
      ['BP-MYV-F', 6, false],
      ['IGN-SAGA', 0, true],
      ['OIL-5W30-4', 3, true],
    ])
    const history = b.handle('GET', `/api/parts/${partId(b, 'IGN-SAGA')}/movements`, undefined).body as StockMovement[]
    expect(history.map((m) => [m.change, m.reason, m.jobNumber, m.by])).toEqual([
      [-1, 'TAKEN', 'KK-2026-0003', 'Front desk'],
      [1, 'COUNTED', null, 'Front desk'],
    ])
    expect(byPlate(b, 'PKR 1234').lines.map((l) => l.partSku)).toEqual([null, 'BP-MYV-F', 'OIL-5W30-4'])
  })

  it("the customer's approval takes the quoted parts once; declining takes nothing", () => {
    const b = signedIn()
    const t = token(b, 'PKR 1234')
    const ok = b.handle('POST', `/api/public/jobs/${t}/answer`, { decision: 'APPROVE', quoteVersion: 1 })
    expect(ok.status).toBe(200)
    expect([onHand(b, 'BP-MYV-F'), onHand(b, 'OIL-5W30-4')]).toEqual([5, 2])
    expect(b.handle('POST', `/api/public/jobs/${t}/answer`, { decision: 'APPROVE', quoteVersion: 1 }).status).toBe(409)
    expect(onHand(b, 'BP-MYV-F')).toBe(5)
    const last = (b.handle('GET', `/api/parts/${partId(b, 'BP-MYV-F')}/movements`, undefined).body as StockMovement[])[0]
    expect(last).toMatchObject({ change: -1, reason: 'TAKEN', jobNumber: 'KK-2026-0001', by: null })
  })

  it('a staff approval names the advisor and may take the count below zero', () => {
    const b = signedIn()
    const id = jobs(b).find((j) => j.plate === 'PJM 77')!.id
    const coil = partId(b, 'IGN-SAGA')
    expect(b.handle('POST', `/api/jobs/${id}/lines`, { kind: 'PART', description: 'Coil', quantity: 2, unitPriceSen: 100, taxable: true, partId: coil }).status).toBe(200)
    for (const to of ['INSPECTING', 'QUOTED', 'APPROVED']) expect(b.handle('POST', `/api/jobs/${id}/moves`, { to }).status).toBe(200)
    expect(onHand(b, 'IGN-SAGA')).toBe(-2)
    const last = (b.handle('GET', `/api/parts/${coil}/movements`, undefined).body as StockMovement[])[0]
    expect(last.by).toBe('Farah Demo')
  })

  it('refuses a part on a labour line, an unknown part and a bad part id (server rules)', () => {
    const b = signedIn()
    const id = jobs(b).find((j) => j.plate === 'PJM 77')!.id
    const line = { kind: 'LABOUR', description: 'X', quantity: 1, unitPriceSen: 100, taxable: true, partId: partId(b, 'BP-MYV-F') }
    expect(b.handle('POST', `/api/jobs/${id}/lines`, line)).toEqual({ status: 409, body: { detail: 'Only a part line can take a part from stock.' } })
    expect(b.handle('POST', `/api/jobs/${id}/lines`, { ...line, kind: 'PART', partId: 999 }).status).toBe(404)
    expect(b.handle('POST', `/api/jobs/${id}/lines`, { ...line, kind: 'PART', partId: 0 }).status).toBe(400)
    expect(byPlate(b, 'PJM 77').lines).toEqual([])
  })

  it('only the advisor adds, receives and counts; same checks as the server', () => {
    const b = signedIn()
    const part = { sku: 'wip-14', name: 'Wiper blade', unitPriceSen: 2500, onHand: 2, reorderLevel: 1 }
    const added = b.handle('POST', '/api/parts', part)
    expect(added.status).toBe(201)
    expect(added.body).toMatchObject({ sku: 'WIP-14', onHand: 2, low: false })
    expect(b.handle('POST', '/api/parts', { ...part, sku: 'WIP-14' }).body).toEqual({ detail: 'Some fields need fixing.', fields: { sku: 'this part number is already in stock' } })
    for (const bad of [{ ...part, sku: '../x' }, { ...part, onHand: -1 }, { ...part, name: ' ' }, { ...part, unitPriceSen: 1.5 }]) {
      expect(b.handle('POST', '/api/parts', bad).status).toBe(400)
    }
    const id = (added.body as Part).id
    expect(b.handle('POST', `/api/parts/${id}/receive`, { quantity: 0 }).status).toBe(400)
    expect((b.handle('POST', `/api/parts/${id}/receive`, { quantity: 5 }).body as Part).onHand).toBe(7)
    expect((b.handle('POST', `/api/parts/${id}/count`, { onHand: 6 }).body as Part).onHand).toBe(6)
    expect(b.handle('POST', `/api/parts/${id}/count`, { onHand: 6 }).status).toBe(200)
    const history = b.handle('GET', `/api/parts/${id}/movements`, undefined).body as StockMovement[]
    expect(history.map((m) => [m.change, m.reason])).toEqual([[-1, 'COUNTED'], [5, 'RECEIVED'], [2, 'COUNTED']])

    b.handle('POST', '/api/auth/logout', {})
    b.handle('POST', '/api/auth/login', { username: 'tech', password: DEMO_PASSWORD })
    expect(shelf(b)).toHaveLength(5)
    expect(b.handle('POST', `/api/parts/${id}/receive`, { quantity: 5 }).status).toBe(403)
    expect(b.handle('POST', '/api/parts', { ...part, sku: 'NEW' }).status).toBe(403)
    expect(onHand(b, 'WIP-14')).toBe(6)
  })
})

describe('demo backend: photos', () => {
  // A 1x1 PNG and a tiny JPEG header (made up, not real photos).
  const PNG_1x1 = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg=='
  const jpegHeader = (w: number, h: number) =>
    new Uint8Array([0xff, 0xd8, 0xff, 0xe0, 0x00, 0x04, 0x00, 0x00, 0xff, 0xc0, 0x00, 0x11, 0x08, h >> 8, h & 0xff, w >> 8, w & 0xff, 0x03, 0, 0, 0, 0])
  const photo = (stage = 'BEFORE', dataUrl = PNG_1x1, caption?: string) => ({ stage, dataUrl, caption })
  const plateId = (b: DemoBackend, plate: string) => jobs(b).find((j) => j.plate === plate)!.id

  it('reads the size of a PNG or JPEG and nothing else', () => {
    const png = Uint8Array.from(atob(PNG_1x1.split(',')[1]), (c) => c.charCodeAt(0))
    expect(imageSize(png)).toEqual({ width: 1, height: 1 })
    expect(imageSize(jpegHeader(1600, 1200))).toEqual({ width: 1600, height: 1200 })
    expect(imageSize(new TextEncoder().encode('<svg onload=alert(1)>'))).toBeNull()
    expect(imageSize(new Uint8Array([0xff, 0xd8, 0xff]))).toBeNull()
  })

  it('adds, lists, shows and removes a photo; the customer sees it by key only on their own link', () => {
    const b = signedIn()
    const id = plateId(b, 'PNG 8810')
    const added = b.handle('POST', `/api/jobs/${id}/photos`, photo('BEFORE', PNG_1x1, ' Air-con vent '))
    expect(added.status).toBe(201)
    expect(added.body).toMatchObject({ stage: 'BEFORE', width: 1, height: 1, caption: 'Air-con vent', by: 'Farah Demo' })
    const p = added.body as { id: number; publicKey: string }
    expect(p.publicKey).toMatch(/^[A-Za-z0-9_-]{16}$/)
    expect(b.handle('GET', `/api/jobs/${id}/photos`, undefined).body).toHaveLength(1)
    expect(JSON.stringify(b.handle('GET', `/api/jobs/${id}/photos`, undefined).body)).not.toContain('data:')
    expect(b.handle('GET', `/api/jobs/${id}/photos/${p.id}`, undefined)).toEqual({ status: 200, image: PNG_1x1 })
    const other = plateId(b, 'PKR 1234')
    expect(b.handle('GET', `/api/jobs/${other}/photos/${p.id}`, undefined).status).toBe(404)

    const token = card(b, id).publicToken
    const pub = b.handle('GET', `/api/public/jobs/${token}`, undefined).body as PublicJob
    expect(pub.photos).toEqual([{ key: p.publicKey, stage: 'BEFORE', caption: 'Air-con vent' }])
    expect(b.handle('GET', `/api/public/jobs/${token}/photos/${p.publicKey}`, undefined).image).toBe(PNG_1x1)
    expect(b.handle('GET', `/api/public/jobs/${card(b, other).publicToken}/photos/${p.publicKey}`, undefined).status).toBe(404)

    expect(b.handle('DELETE', `/api/jobs/${id}/photos/${p.id}`, undefined).status).toBe(204)
    expect(b.handle('GET', `/api/jobs/${id}/photos`, undefined).body).toEqual([])
  })

  it('follows the server rules: after photos once the repair started, 12 at most, finished jobs locked', () => {
    const b = signedIn()
    const inspecting = plateId(b, 'PNG 8810')
    expect(b.handle('POST', `/api/jobs/${inspecting}/photos`, photo('AFTER'))).toEqual({
      status: 409,
      body: { detail: 'After photos can be added once the repair has started (now INSPECTING).' },
    })
    const repairing = plateId(b, 'BKE 5021')
    expect(b.handle('POST', `/api/jobs/${repairing}/photos`, photo('AFTER')).status).toBe(201)
    for (let i = 1; i < 12; i++) expect(b.handle('POST', `/api/jobs/${repairing}/photos`, photo()).status).toBe(201)
    expect(b.handle('POST', `/api/jobs/${repairing}/photos`, photo()).body).toEqual({ detail: 'A job card can have at most 12 photos. Remove one first.' })
    const ready = plateId(b, 'WXY 3388')
    b.handle('POST', `/api/jobs/${ready}/moves`, { to: 'COLLECTED' })
    expect(b.handle('POST', `/api/jobs/${ready}/photos`, photo()).status).toBe(409)
  })

  it('refuses what is not a photo, a long caption, and photos too big for browser storage', () => {
    const b = signedIn()
    const id = plateId(b, 'PNG 8810')
    expect(b.handle('POST', `/api/jobs/${id}/photos`, photo('BEFORE', 'data:image/svg+xml;base64,' + btoa('<svg onload=alert(1)>'))).body).toEqual({
      detail: 'Some fields need fixing.',
      fields: { file: 'use a JPEG or PNG photo' },
    })
    expect(b.handle('POST', `/api/jobs/${id}/photos`, photo('BEFORE', '')).status).toBe(400)
    expect(b.handle('POST', `/api/jobs/${id}/photos`, photo('SIDEWAYS')).status).toBe(400)
    expect(b.handle('POST', `/api/jobs/${id}/photos`, photo('BEFORE', PNG_1x1, 'x'.repeat(201))).status).toBe(400)
    const big = new Uint8Array(DEMO_PHOTO_MAX_BYTES + 1)
    big.set(jpegHeader(100, 100))
    let raw = ''
    for (const byte of big) raw += String.fromCharCode(byte)
    const res = b.handle('POST', `/api/jobs/${id}/photos`, photo('BEFORE', 'data:image/jpeg;base64,' + btoa(raw)))
    expect(res.status).toBe(413)
    expect(b.handle('GET', `/api/jobs/${id}/photos`, undefined).body).toEqual([])
  })

  it("a technician cannot add or remove photos on another technician's car", () => {
    const b = signedIn()
    const id = plateId(b, 'PJM 77')
    b.handle('PUT', `/api/jobs/${id}/assignee`, { staffId: null })
    const p = b.handle('POST', `/api/jobs/${id}/photos`, photo()).body as { id: number }
    b.handle('POST', '/api/staff', { username: 'tech2', name: 'Other Demo', role: 'TECHNICIAN', password: 'a long password 1' })
    const other = (b.handle('GET', '/api/staff', undefined).body as StaffMember[]).find((s) => s.username === 'tech2')!
    b.handle('PUT', `/api/jobs/${id}/assignee`, { staffId: other.id })
    b.handle('POST', '/api/auth/logout', {})
    b.handle('POST', '/api/auth/login', { username: 'tech', password: DEMO_PASSWORD })
    expect(b.handle('POST', `/api/jobs/${id}/photos`, photo()).status).toBe(403)
    expect(b.handle('DELETE', `/api/jobs/${id}/photos/${p.id}`, undefined).status).toBe(403)
    expect(b.handle('GET', `/api/jobs/${id}/photos/${p.id}`, undefined).status).toBe(200)
  })
})

