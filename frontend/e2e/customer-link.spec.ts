import { expect, test } from '@playwright/test'
import { addLine, checkIn, customerLinkOf, customerPhone, move, newPlate, signIn } from './helpers.ts'

test('a quote redone while the customer has the page open cannot be approved at the old price', async ({ page, browser }) => {
  const plate = newPlate()
  await signIn(page, 'advisor')
  await checkIn(page, plate, 'Air-con not cold.')
  await move(page, 'Start inspection')
  await addLine(page, 'Labour', 'Air-con check', '80')
  await move(page, 'Send quote')
  const link = await customerLinkOf(page)

  const phone = await customerPhone(browser)
  await phone.page.goto(link)
  await expect(phone.page.getByTestId('public-total')).toHaveText('RM 86.40')
  await phone.page.getByRole('button', { name: 'Approve', exact: true }).click()

  // Meanwhile the workshop redoes the quote and sends a higher one.
  await move(page, 'Redo quote')
  await addLine(page, 'Part', 'Air-con gas top-up', '120')
  await move(page, 'Send quote')
  await expect(page.getByRole('heading', { name: 'Quote (version 2)' })).toBeVisible()

  // The customer's tap still carries version 1: refused, and the page shows the new quote.
  await phone.page.getByRole('button', { name: 'Yes, approve' }).click()
  await expect(phone.page.getByRole('alert')).toBeVisible()
  await expect(phone.page.getByTestId('public-total')).toHaveText('RM 216.00')
  await expect(phone.page.getByText('(version 2)')).toBeVisible()

  // Declining the new quote, with a reason, works.
  await phone.page.getByRole('button', { name: 'Decline', exact: true }).click()
  await phone.page.getByLabel('Reason (optional)').fill('Too expensive this month')
  await phone.page.getByRole('button', { name: 'Yes, decline' }).click()
  await expect(phone.page.getByRole('heading', { name: 'Quote declined – your car will be returned' })).toBeVisible()
  await page.reload()
  await expect(page.getByText('Too expensive this month')).toBeVisible()
  await phone.context.close()
})

test('a made-up link shows the "not valid" page, not an error', async ({ browser }) => {
  const phone = await customerPhone(browser)
  await phone.page.goto('/t/AAAAAAAAAAAAAAAAAAAAAAAA')
  await expect(phone.page.getByText('This link is not valid or has expired.')).toBeVisible()
  await phone.context.close()
})
