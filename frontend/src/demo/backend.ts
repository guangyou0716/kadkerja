/**
 * An in-browser stand-in for the kadkerja API, used only by the browser demo build
 * (`npm run build:demo`). It answers the same /api paths with the same JSON shapes and follows the
 * same workshop rules as the Spring Boot server (status moves, technician limits, quote editing,
 * quote versions, the customer's stale-quote guard), so the real pages run unchanged.
 *
 * It is NOT security: everything lives in the visitor's own browser. The real server does sign-in,
 * CSRF, rate limits and link expiry; here they are skipped or simplified.
 */
import type { Actor, CheckIn, Decision, JobCard, JobSummary, LineKind, Me, NewLine, PublicJob, Role } from '../api'
import { STATUSES, type JobStatus } from '../status'

/** Published demo sign-ins (same as the server's demo profile). */
export const DEMO_PASSWORD = 'demo-kadkerja'
export const DEMO_STAFF: (Me & { role: Role })[] = [
  { username: 'advisor', name: 'Farah Demo', role: 'ADVISOR' },
  { username: 'tech', name: 'Hafiz Demo', role: 'TECHNICIAN' },
]
const WORKSHOP = 'Demo Auto Workshop (browser demo)'
const SST_RATE = 8

interface Line {
  id: number
  kind: LineKind
  description: string
  quantity: number
  unitPriceSen: number
  taxable: boolean
}
interface Event {
  from: JobStatus | null
  to: JobStatus
  at: string
  note: string | null
  by: Actor
}
interface Job {
  id: number
  status: JobStatus
  complaint: string
  mileageKm: number | null
  createdAt: string
  vehicleId: number
  customerId: number
  quoteVersion: number
  publicToken: string
  lines: Line[]
  events: Event[]
}
interface Vehicle {
  id: number
  plate: string
  make: string
  model: string
  year: number | null
  ownerId: number
}
interface Customer {
  id: number
  name: string
  phone: string
}

/** Everything the demo remembers (saved as JSON in localStorage). */
export interface DemoState {
  version: 1
  seq: number
  signedIn: string | null
  customers: Customer[]
  vehicles: Vehicle[]
  jobs: Job[]
}

export interface DemoResponse {
  status: number
  body?: unknown
}

const NEXT: Record<JobStatus, JobStatus[]> = {
  RECEIVED: ['INSPECTING', 'CANCELLED'],
  INSPECTING: ['QUOTED', 'CANCELLED'],
  QUOTED: ['APPROVED', 'DECLINED', 'INSPECTING', 'CANCELLED'],
  APPROVED: ['IN_PROGRESS'],
  IN_PROGRESS: ['READY'],
  DECLINED: ['READY'],
  READY: ['COLLECTED'],
  COLLECTED: [],
  CANCELLED: [],
}
const TECH_MOVES = ['RECEIVED>INSPECTING', 'APPROVED>IN_PROGRESS', 'IN_PROGRESS>READY']
const quoteEditable = (s: JobStatus) => s === 'RECEIVED' || s === 'INSPECTING'

class Problem extends Error {
  readonly status: number
  readonly fields: Record<string, string>
  constructor(status: number, detail: string, fields: Record<string, string> = {}) {
    super(detail)
    this.status = status
    this.fields = fields
  }
}

/** 18 random bytes as 24 URL-safe characters, like the server's link tokens. */
export function newToken(): string {
  const bytes = crypto.getRandomValues(new Uint8Array(18))
  return btoa(String.fromCharCode(...bytes)).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '')
}

export function normalizePlate(plate: string): string {
  return plate
    .replace(/\s+/g, '')
    .toUpperCase()
    .replace(/(?<=[A-Z])(?=[0-9])|(?<=[0-9])(?=[A-Z])/g, ' ')
}

const digits = (phone: string) => phone.replace(/\D/g, '')
const tax = (sen: number, rate: number) => Math.floor((sen * rate + 50) / 100)
const lineSubtotal = (l: Line) => l.quantity * l.unitPriceSen
const lineTax = (l: Line) => (l.taxable ? tax(lineSubtotal(l), SST_RATE) : 0)

export class DemoBackend {
  state: DemoState
  private readonly now: () => Date

  constructor(state: DemoState, now: () => Date = () => new Date()) {
    this.state = state
    this.now = now
  }

  /** A fresh demo workshop: two staff, five cars at different steps. Names and numbers are made up. */
  static seeded(now: () => Date = () => new Date()): DemoBackend {
    const b = new DemoBackend({ version: 1, seq: 0, signedIn: null, customers: [], vehicles: [], jobs: [] }, now)
    const ago = (minutes: number) => new Date(now().getTime() - minutes * 60_000).toISOString()
    const staffMove = (id: number, to: JobStatus, at: string, note: string | null = null) => b.move(id, to, note, 'ADVISOR', at)

    const a = b.checkIn(
      { customerName: 'Aiman Demo', phone: '012-0000001', plate: 'PKR 1234', make: 'Perodua', model: 'Myvi', year: 2019, mileageKm: 84210, complaint: 'Squeaking brakes at low speed; service due.' },
      ago(180),
    )
    b.addLine(a.id, { kind: 'LABOUR', description: 'Brake inspection and service', quantity: 1, unitPriceSen: 6000, taxable: true })
    b.addLine(a.id, { kind: 'PART', description: 'Front brake pads (set)', quantity: 1, unitPriceSen: 12800, taxable: true })
    b.addLine(a.id, { kind: 'PART', description: 'Engine oil 5W-30, 4 L', quantity: 1, unitPriceSen: 11500, taxable: true })
    staffMove(a.id, 'INSPECTING', ago(170))
    staffMove(a.id, 'QUOTED', ago(120), 'Pads at 2 mm; oil change due.')

    const m = b.checkIn(
      { customerName: 'Mei Ling Demo', phone: '012-0000002', plate: 'PNG 8810', make: 'Honda', model: 'City', year: 2021, mileageKm: 40500, complaint: 'Air-con not cold.' },
      ago(150),
    )
    staffMove(m.id, 'INSPECTING', ago(140), 'Bay 2')

    const k = b.checkIn(
      { customerName: 'Kumar Demo', phone: '012-0000003', plate: 'BKE 5021', make: 'Proton', model: 'Saga', year: 2016, mileageKm: 132900, complaint: 'Engine light on.' },
      ago(300),
    )
    b.addLine(k.id, { kind: 'LABOUR', description: 'Diagnostic scan', quantity: 1, unitPriceSen: 5000, taxable: true })
    b.addLine(k.id, { kind: 'PART', description: 'Ignition coil', quantity: 1, unitPriceSen: 18000, taxable: true })
    staffMove(k.id, 'INSPECTING', ago(290))
    staffMove(k.id, 'QUOTED', ago(250))
    staffMove(k.id, 'APPROVED', ago(240), 'Approved by phone.')
    staffMove(k.id, 'IN_PROGRESS', ago(200))

    b.checkIn(
      { customerName: 'Siti Demo', phone: '012-0000004', plate: 'PJM 77', make: 'Toyota', model: 'Vios', year: 2018, mileageKm: 98000, complaint: 'Tyre rotation and alignment.' },
      ago(30),
    )

    const w = b.checkIn(
      { customerName: 'Wong Demo', phone: '012-0000005', plate: 'WXY 3388', make: 'Perodua', model: 'Axia', year: 2015, mileageKm: 151200, complaint: 'Battery flat in the morning.' },
      ago(420),
    )
    b.addLine(w.id, { kind: 'PART', description: 'Battery NS40ZL', quantity: 1, unitPriceSen: 23000, taxable: true })
    b.addLine(w.id, { kind: 'LABOUR', description: 'Charging system test', quantity: 1, unitPriceSen: 3000, taxable: false })
    staffMove(w.id, 'INSPECTING', ago(410))
    staffMove(w.id, 'QUOTED', ago(390))
    staffMove(w.id, 'APPROVED', ago(380), 'Approved on WhatsApp.')
    staffMove(w.id, 'IN_PROGRESS', ago(370))
    staffMove(w.id, 'READY', ago(330))
    return b
  }

  // ---- HTTP-shaped entry point ----

  /** Answers one API request the way the server would. */
  handle(method: string, url: string, body: unknown): DemoResponse {
    const path = url.split('?')[0]
    try {
      return this.route(method.toUpperCase(), path, (body ?? {}) as Record<string, unknown>)
    } catch (e) {
      if (e instanceof Problem) {
        return { status: e.status, body: { detail: e.message, ...(Object.keys(e.fields).length ? { fields: e.fields } : {}) } }
      }
      throw e
    }
  }

  private route(method: string, path: string, body: Record<string, unknown>): DemoResponse {
    if (method === 'GET' && path === '/api/auth/csrf') return { status: 200, body: { headerName: 'X-XSRF-TOKEN', token: 'browser-demo' } }
    if (method === 'POST' && path === '/api/auth/login') return { status: 200, body: this.login(String(body.username ?? ''), String(body.password ?? '')) }

    let m = /^\/api\/public\/jobs\/([^/]+)(\/answer)?$/.exec(path)
    if (m) {
      const token = decodeURIComponent(m[1])
      if (method === 'GET' && !m[2]) return { status: 200, body: this.publicJob(token) }
      if (method === 'POST' && m[2]) {
        return { status: 200, body: this.answer(token, body.decision as Decision, Number(body.quoteVersion), body.note as string | undefined) }
      }
    }

    // Everything else needs a signed-in member of staff.
    const me = this.me()
    if (method === 'GET' && path === '/api/auth/me') return { status: 200, body: me }
    if (method === 'POST' && path === '/api/auth/logout') {
      this.state.signedIn = null
      return { status: 204 }
    }
    if (path === '/api/jobs') {
      if (method === 'GET') return { status: 200, body: this.list() }
      if (method === 'POST') {
        if (me.role !== 'ADVISOR') throw new Problem(403, 'Only the service advisor checks in cars.')
        return { status: 201, body: this.view(this.checkIn(validCheckIn(body))) }
      }
    }
    m = /^\/api\/jobs\/(\d+)(?:\/(lines|moves|link)(?:\/(\d+))?)?$/.exec(path)
    if (m) {
      const id = Number(m[1])
      const [, , what, lineId] = m
      if (!what && method === 'GET') return { status: 200, body: this.view(this.find(id)) }
      if (what === 'lines' && !lineId && method === 'POST') return { status: 200, body: this.view(this.addLine(id, validLine(body))) }
      if (what === 'lines' && lineId && method === 'DELETE') return { status: 200, body: this.view(this.removeLine(id, Number(lineId))) }
      if (what === 'moves' && method === 'POST') {
        const to = body.to as JobStatus
        if (!STATUSES.includes(to)) throw new Problem(400, 'Some fields need fixing.', { to: 'must not be null' })
        const note = typeof body.note === 'string' ? body.note : null
        if (note && note.length > 500) throw new Problem(400, 'Some fields need fixing.', { note: 'size must be between 0 and 500' })
        return { status: 200, body: this.view(this.move(id, to, note, me.role)) }
      }
      if (what === 'link' && method === 'POST') {
        if (me.role !== 'ADVISOR') throw new Problem(403, 'Only the service advisor can make a new customer link.')
        const job = this.find(id)
        job.publicToken = newToken()
        return { status: 200, body: this.view(job) }
      }
    }
    throw new Problem(404, 'Not found.')
  }

  // ---- staff ----

  private login(username: string, password: string): Me {
    const user = DEMO_STAFF.find((s) => s.username === username.trim())
    if (!user || password !== DEMO_PASSWORD) throw new Problem(401, 'Wrong username or password.')
    this.state.signedIn = user.username
    return user
  }

  private me(): Me {
    const user = DEMO_STAFF.find((s) => s.username === this.state.signedIn)
    if (!user) throw new Problem(401, 'Please sign in to continue.')
    return user
  }

  // ---- jobs ----

  checkIn(input: CheckIn, at: string = this.now().toISOString()): Job {
    const plate = normalizePlate(input.plate)
    let vehicle = this.state.vehicles.find((v) => v.plate === plate)
    if (vehicle) {
      const owner = this.customer(vehicle.ownerId)
      if (digits(owner.phone) === digits(input.phone)) {
        owner.name = input.customerName
        owner.phone = input.phone
      } else {
        vehicle.ownerId = this.addCustomer(input).id
      }
      const vid = vehicle.id
      if (this.state.jobs.some((j) => j.vehicleId === vid && NEXT[j.status].length > 0)) {
        throw new Problem(409, `${plate} already has an open job card; finish or cancel it first.`)
      }
    } else {
      vehicle = { id: ++this.state.seq, plate, make: input.make, model: input.model, year: input.year ?? null, ownerId: this.addCustomer(input).id }
      this.state.vehicles.push(vehicle)
    }
    const job: Job = {
      id: this.state.jobs.reduce((max, j) => Math.max(max, j.id), 0) + 1,
      status: 'RECEIVED',
      complaint: input.complaint,
      mileageKm: input.mileageKm ?? null,
      createdAt: at,
      vehicleId: vehicle.id,
      customerId: vehicle.ownerId,
      quoteVersion: 0,
      publicToken: newToken(),
      lines: [],
      events: [{ from: null, to: 'RECEIVED', at, note: null, by: 'STAFF' }],
    }
    this.state.jobs.push(job)
    return job
  }

  addLine(id: number, line: NewLine): Job {
    const job = this.find(id)
    requireEditable(job)
    job.lines.push({ id: ++this.state.seq, ...line, description: line.description.trim() })
    return job
  }

  private removeLine(id: number, lineId: number): Job {
    const job = this.find(id)
    requireEditable(job)
    const before = job.lines.length
    job.lines = job.lines.filter((l) => l.id !== lineId)
    if (job.lines.length === before) throw new Problem(404, `This job card has no quote line ${lineId}.`)
    return job
  }

  move(id: number, to: JobStatus, note: string | null, role: Role, at: string = this.now().toISOString()): Job {
    const job = this.find(id)
    if (role !== 'ADVISOR' && !TECH_MOVES.includes(`${job.status}>${to}`)) {
      throw new Problem(403, `A technician cannot move a job from ${job.status} to ${to}; the service advisor does that.`)
    }
    if (!NEXT[job.status].includes(to)) throw new Problem(409, `A job that is ${job.status} cannot move to ${to}.`)
    if (to === 'QUOTED') {
      if (job.lines.length === 0) throw new Problem(409, 'Add at least one quote line before sending the quote.')
      job.quoteVersion++
    }
    job.events.push({ from: job.status, to, at, note: note?.trim() || null, by: 'STAFF' })
    job.status = to
    return job
  }

  // ---- customer link ----

  private byToken(token: string): Job {
    const job = this.state.jobs.find((j) => j.publicToken === token)
    if (!job) throw new Problem(404, 'This link is not valid or has expired.')
    return job
  }

  private publicJob(token: string): PublicJob {
    const j = this.byToken(token)
    const v = this.vehicle(j.vehicleId)
    const quote = j.quoteVersion > 0 && !quoteEditable(j.status)
    const totals = this.totals(j)
    return {
      workshop: WORKSHOP,
      number: this.number(j),
      status: j.status,
      plate: v.plate,
      vehicle: `${v.make} ${v.model}`,
      complaint: j.complaint,
      checkedInAt: j.createdAt,
      quoteVisible: quote,
      quoteVersion: quote ? j.quoteVersion : 0,
      lines: quote ? j.lines.map((l) => ({ kind: l.kind, description: l.description, quantity: l.quantity, unitPriceSen: l.unitPriceSen, taxable: l.taxable, subtotalSen: lineSubtotal(l), taxSen: lineTax(l) })) : [],
      subtotalSen: quote ? totals.subtotalSen : 0,
      taxSen: quote ? totals.taxSen : 0,
      totalSen: quote ? totals.totalSen : 0,
      sstRatePercent: SST_RATE,
      canAnswer: j.status === 'QUOTED',
      timeline: j.events.map((e) => ({ status: e.to, at: e.at, by: e.by })),
    }
  }

  private answer(token: string, decision: Decision, seenVersion: number, note: string | undefined): PublicJob {
    const j = this.byToken(token)
    if (decision !== 'APPROVE' && decision !== 'DECLINE') throw new Problem(400, 'Some fields need fixing.', { decision: 'must not be null' })
    if (seenVersion !== j.quoteVersion) {
      throw new Problem(409, 'The workshop changed the quote after you opened it. Check the new quote and answer again.')
    }
    if (j.status === 'APPROVED' || j.status === 'DECLINED') throw new Problem(409, `This quote has already been answered (${j.status}).`)
    if (j.status !== 'QUOTED') throw new Problem(409, 'This quote is not waiting for an answer any more.')
    const to: JobStatus = decision === 'APPROVE' ? 'APPROVED' : 'DECLINED'
    j.events.push({ from: j.status, to, at: this.now().toISOString(), note: note?.trim() || null, by: 'CUSTOMER' })
    j.status = to
    return this.publicJob(token)
  }

  // ---- views ----

  private list(): JobSummary[] {
    return [...this.state.jobs]
      .sort((a, b) => b.id - a.id)
      .map((j) => {
        const v = this.vehicle(j.vehicleId)
        return { id: j.id, number: this.number(j), status: j.status, plate: v.plate, vehicle: `${v.make} ${v.model}`, customer: this.customer(j.customerId).name, complaint: j.complaint, createdAt: j.createdAt }
      })
  }

  private view(j: Job): JobCard {
    const v = this.vehicle(j.vehicleId)
    const c = this.customer(j.customerId)
    return {
      id: j.id,
      number: this.number(j),
      status: j.status,
      next: NEXT[j.status],
      complaint: j.complaint,
      mileageKm: j.mileageKm,
      createdAt: j.createdAt,
      vehicle: { id: v.id, plate: v.plate, make: v.make, model: v.model, year: v.year },
      customer: { id: c.id, name: c.name, phone: c.phone },
      quoteVersion: j.quoteVersion,
      lines: j.lines.map((l) => ({ ...l, subtotalSen: lineSubtotal(l), taxSen: lineTax(l) })),
      ...this.totals(j),
      sstRatePercent: SST_RATE,
      publicToken: j.publicToken,
      events: j.events.map((e) => ({ ...e })),
    }
  }

  private totals(j: Job) {
    const subtotalSen = j.lines.reduce((s, l) => s + lineSubtotal(l), 0)
    const taxSen = j.lines.reduce((s, l) => s + lineTax(l), 0)
    return { subtotalSen, taxSen, totalSen: subtotalSen + taxSen }
  }

  private number(j: Job): string {
    const year = new Date(j.createdAt).toLocaleString('en-US', { timeZone: 'Asia/Kuala_Lumpur', year: 'numeric' })
    return `KK-${year}-${String(j.id).padStart(4, '0')}`
  }

  private find(id: number): Job {
    const job = this.state.jobs.find((j) => j.id === id)
    if (!job) throw new Problem(404, `There is no job card ${id}.`)
    return job
  }

  private vehicle(id: number): Vehicle {
    return this.state.vehicles.find((v) => v.id === id)!
  }

  private customer(id: number): Customer {
    return this.state.customers.find((c) => c.id === id)!
  }

  private addCustomer(input: CheckIn): Customer {
    const c = { id: ++this.state.seq, name: input.customerName, phone: input.phone }
    this.state.customers.push(c)
    return c
  }
}

function requireEditable(job: Job) {
  if (!quoteEditable(job.status)) {
    throw new Problem(
      409,
      `The quote can only be changed while the job is received or being inspected (now ${job.status}). Move it back to INSPECTING to redo the quote.`,
    )
  }
}

// ---- request checks (the same limits as the server's Requests) ----

function validCheckIn(b: Record<string, unknown>): CheckIn {
  const fields: Record<string, string> = {}
  const text = (k: string, max: number) => {
    const v = typeof b[k] === 'string' ? (b[k] as string) : ''
    if (!v.trim()) fields[k] = 'must not be blank'
    else if (v.length > max) fields[k] = `size must be between 0 and ${max}`
    return v
  }
  const int = (k: string, min: number, max: number) => {
    const v = b[k]
    if (v === undefined || v === null || v === '') return undefined
    if (typeof v !== 'number' || !Number.isInteger(v)) fields[k] = 'must be a whole number'
    else if (v < min) fields[k] = `must be greater than or equal to ${min}`
    else if (v > max) fields[k] = `must be less than or equal to ${max}`
    return v as number
  }
  const out: CheckIn = {
    customerName: text('customerName', 100),
    phone: text('phone', 20),
    plate: text('plate', 12),
    make: text('make', 40),
    model: text('model', 40),
    year: int('year', 1950, 2100),
    mileageKm: int('mileageKm', 0, 2_000_000),
    complaint: text('complaint', 1000),
  }
  if (!fields.phone && !/^0[0-9]{1,2}-?[0-9]{7,8}$/.test(out.phone)) fields.phone = 'use a Malaysian phone number like 012-3456789'
  if (!fields.plate && !/^[A-Za-z0-9 ]{2,12}$/.test(out.plate)) fields.plate = 'letters, digits and spaces only (2-12)'
  if (Object.keys(fields).length) throw new Problem(400, 'Some fields need fixing.', fields)
  return out
}

function validLine(b: Record<string, unknown>): NewLine {
  const fields: Record<string, string> = {}
  const kind = b.kind
  if (kind !== 'LABOUR' && kind !== 'PART') fields.kind = 'must not be null'
  const description = typeof b.description === 'string' ? b.description : ''
  if (!description.trim()) fields.description = 'must not be blank'
  else if (description.length > 200) fields.description = 'size must be between 0 and 200'
  const quantity = Number(b.quantity)
  if (!Number.isInteger(quantity) || quantity < 1 || quantity > 999) fields.quantity = 'must be between 1 and 999'
  const unitPriceSen = Number(b.unitPriceSen)
  if (!Number.isInteger(unitPriceSen) || unitPriceSen < 0 || unitPriceSen > 10_000_000) fields.unitPriceSen = 'must be between 0 and 10000000'
  if (Object.keys(fields).length) throw new Problem(400, 'Some fields need fixing.', fields)
  return { kind: kind as LineKind, description, quantity, unitPriceSen, taxable: b.taxable === true }
}
