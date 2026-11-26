import { crc32, deflateSync } from 'node:zlib'
import { expect, type Browser, type Page } from '@playwright/test'

/** Demo profile only (published in the README). */
export const DEMO_PASSWORD = 'demo-kadkerja'

/**
 * A made-up plate that is new on every run, e.g. "TQX 4821" (letters, a space, digits: already in the form the
 * server stores, which puts a space between letter and digit groups).
 */
export function newPlate(): string {
  const letter = () => String.fromCharCode(65 + Math.floor(Math.random() * 26))
  return `T${letter()}${letter()} ${Math.floor(1000 + Math.random() * 9000)}`
}

/** A made-up phone number in the 012-000 xxxx range used for all synthetic data. */
export function newPhone(): string {
  return `012-000${Math.floor(1000 + Math.random() * 9000)}`
}

export async function signIn(page: Page, username: string, password = DEMO_PASSWORD) {
  await page.goto('/')
  await page.getByLabel('Username').fill(username)
  await page.getByLabel('Password').fill(password)
  await page.getByRole('button', { name: 'Sign in' }).click()
  await expect(page.getByRole('button', { name: 'Sign out' })).toBeVisible()
}

export async function signOut(page: Page) {
  await page.getByRole('button', { name: 'Sign out' }).click()
  await expect(page.getByRole('heading', { name: 'Staff sign-in' })).toBeVisible()
}

/** The advisor checks in a car and lands on its job card. */
export async function checkIn(page: Page, plate: string, complaint: string) {
  await page.getByRole('navigation', { name: 'Main' }).getByRole('link', { name: 'Check in a car' }).click()
  // Wait for the form: the page before may have its own "Name" field (e.g. Parts).
  await expect(page.getByRole('heading', { level: 1, name: 'Check in a car' })).toBeVisible()
  await page.getByLabel('Name').fill('Siti E2E Demo')
  await page.getByLabel('Phone').fill(newPhone())
  await page.getByLabel('Plate').fill(plate)
  await page.getByLabel('Make').fill('Perodua')
  await page.getByLabel('Model').fill('Axia')
  await page.getByLabel('Year').fill('2020')
  await page.getByLabel('Mileage (km)').fill('51000')
  await page.getByLabel('Complaint').fill(complaint)
  await page.getByRole('button', { name: 'Check in', exact: true }).click()
  await expect(page.getByRole('heading', { level: 1, name: plate })).toBeVisible()
}

export async function addLine(page: Page, kind: 'Part' | 'Labour', description: string, price: string) {
  const form = page.getByRole('form', { name: 'Add a quote line' })
  await form.getByLabel('Kind').selectOption({ label: kind })
  await form.getByLabel('Description').fill(description)
  await form.getByLabel('Unit price (RM)').fill(price)
  await form.getByRole('button', { name: 'Add line' }).click()
  await expect(page.getByRole('button', { name: `Remove ${description}` })).toBeVisible()
}

export async function move(page: Page, button: string) {
  await page.getByRole('button', { name: button, exact: true }).click()
}

/** The customer's phone: a separate browser context with no staff cookies. */
export async function customerPhone(browser: Browser) {
  const context = await browser.newContext({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true })
  return { context, page: await context.newPage() }
}

export async function customerLinkOf(page: Page): Promise<string> {
  const link = await page.getByRole('textbox', { name: 'Customer link' }).inputValue()
  expect(link).toMatch(/\/t\/[A-Za-z0-9_-]{24}$/)
  return link
}

/** A small solid-colour PNG (made here, so no binary file in the repo). */
export function pngBytes(width = 64, height = 48, rgb: [number, number, number] = [15, 118, 110]): Buffer {
  const chunk = (type: string, data: Buffer) => {
    const len = Buffer.alloc(4)
    len.writeUInt32BE(data.length)
    const body = Buffer.concat([Buffer.from(type, 'ascii'), data])
    const crc = Buffer.alloc(4)
    crc.writeUInt32BE(crc32(body))
    return Buffer.concat([len, body, crc])
  }
  const header = Buffer.alloc(13)
  header.writeUInt32BE(width, 0)
  header.writeUInt32BE(height, 4)
  header[8] = 8 // bit depth
  header[9] = 2 // RGB
  const row = Buffer.concat([Buffer.from([0]), Buffer.from(Array.from({ length: width }, () => rgb).flat())])
  const pixels = Buffer.concat(Array.from({ length: height }, () => row))
  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk('IHDR', header),
    chunk('IDAT', deflateSync(pixels)),
    chunk('IEND', Buffer.alloc(0)),
  ])
}
