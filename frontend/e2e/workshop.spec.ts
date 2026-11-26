import { expect, test } from '@playwright/test'
import { addLine, checkIn, customerLinkOf, customerPhone, move, newPlate, pngBytes, signIn, signOut } from './helpers.ts'

test('a car from check-in to collection: quote, customer approves on the link, stock, photos, technician', async ({ page, browser }) => {
  const plate = newPlate()

  // Parts shelf before: the brake pads are taken when the quote is approved.
  await signIn(page, 'advisor')
  await page.getByRole('navigation', { name: 'Main' }).getByRole('link', { name: 'Parts' }).click()
  const padsBefore = Number(await page.getByTestId('on-hand-BP-MYV-F').textContent())

  // Front desk: check in, inspect, write the quote (one line from stock), give it to the technician.
  await checkIn(page, plate, 'Brakes squeal when stopping.')
  await expect(page.getByText('Received', { exact: true }).first()).toBeVisible()
  await move(page, 'Start inspection')
  await addLine(page, 'Labour', 'Brake inspection', '60')
  const form = page.getByRole('form', { name: 'Add a quote line' })
  const pads = await form.getByLabel('From stock').locator('option', { hasText: 'BP-MYV-F' }).getAttribute('value')
  await form.getByLabel('From stock').selectOption(pads!)
  await expect(form.getByLabel('Description')).toHaveValue('Front brake pads (set)')
  await form.getByRole('button', { name: 'Add line' }).click()
  await expect(page.getByText('stock BP-MYV-F')).toBeVisible()
  // 60.00 + 128.00 = 188.00, SST 8% = 15.04 (each line rounded), total 203.04.
  await expect(page.getByTestId('total')).toHaveText('RM 203.04')

  // A before photo through the real upload (client shrink, multipart, server re-encode).
  const photos = page.getByRole('form', { name: 'Add a photo' })
  await photos.getByLabel('Photo', { exact: true }).setInputFiles({ name: 'front-left.png', mimeType: 'image/png', buffer: pngBytes() })
  await photos.getByLabel('Caption (optional)').fill('Front left pad worn')
  await photos.getByRole('button', { name: 'Add photo' }).click()
  await expect(page.getByRole('button', { name: 'Open before photo 1: Front left pad worn' })).toBeVisible()

  await page.getByLabel('Assigned to').selectOption({ label: 'Hafiz Demo' })
  await page.getByRole('button', { name: 'Assign', exact: true }).click()
  await expect(page.getByLabel('Car and customer').getByText('Hafiz Demo')).toBeVisible()
  await move(page, 'Send quote')
  await expect(page.getByText('The quote is locked once sent.')).toBeVisible()
  const link = await customerLinkOf(page)

  // The customer, on their phone, with no account.
  const phone = await customerPhone(browser)
  await phone.page.goto(link)
  await expect(phone.page.getByRole('heading', { name: 'Your quote is ready' })).toBeVisible()
  await expect(phone.page.getByText(plate)).toBeVisible()
  await expect(phone.page.getByTestId('public-total')).toHaveText('RM 203.04')
  await expect(phone.page.getByRole('button', { name: /Open photo 1: Front left pad worn/ })).toBeVisible()
  await expect(phone.page.getByText('Siti E2E Demo')).toHaveCount(0) // the link hides the customer's name
  await phone.page.getByRole('button', { name: 'Approve', exact: true }).click()
  await expect(phone.page.getByText('Approve RM 203.04 for the 2 items above?')).toBeVisible()
  await phone.page.getByRole('button', { name: 'Yes, approve' }).click()
  await expect(phone.page.getByRole('heading', { name: 'Quote approved – repair starts soon' })).toBeVisible()

  // Staff see who approved; the pads came off the shelf once.
  await page.reload()
  await expect(page.getByText('by customer (link)')).toBeVisible()
  await page.getByRole('navigation', { name: 'Main' }).getByRole('link', { name: 'Parts' }).click()
  await expect(page.getByTestId('on-hand-BP-MYV-F')).toHaveText(String(padsBefore - 1))
  await signOut(page)

  // The technician finds it in My jobs and does the repair.
  await signIn(page, 'tech')
  await page.getByRole('navigation', { name: 'Main' }).getByRole('link', { name: 'My jobs' }).click()
  await page.getByRole('region', { name: 'To work on' }).getByRole('link', { name: new RegExp(plate) }).click()
  await move(page, 'Start repair')
  await expect(page.getByText('In progress', { exact: true }).first()).toBeVisible()
  await move(page, 'Ready to collect')
  await expect(page.getByText('The next step is for the service advisor.')).toBeVisible()
  await signOut(page)

  // Front desk hands the car back; the customer's page follows.
  await signIn(page, 'advisor')
  await page.getByRole('link', { name: new RegExp(plate) }).click()
  await move(page, 'Handed back')
  await expect(page.getByText('This job is collected. Nothing more to do.')).toBeVisible()
  await phone.page.reload()
  await expect(phone.page.getByRole('heading', { name: 'Collected – thank you' })).toBeVisible()
  await phone.context.close()
})
