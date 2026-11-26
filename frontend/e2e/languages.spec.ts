import { expect, test } from '@playwright/test'
import { addLine, checkIn, customerPhone, DEMO_PASSWORD, move, newPlate } from './helpers.ts'

test('staff pick 简体中文 at sign-in and keep it after a reload; the customer gets the link in Malay', async ({ page, browser }) => {
  await page.goto('/')
  await page.getByRole('combobox', { name: 'Language' }).selectOption('zh')
  await page.getByLabel('用户名').fill('advisor')
  await page.getByLabel('密码').fill(DEMO_PASSWORD)
  await page.getByRole('button', { name: '登录' }).click()
  await expect(page.getByRole('heading', { level: 1, name: '工单看板' })).toBeVisible()
  await page.reload()
  await expect(page.getByRole('heading', { level: 1, name: '工单看板' })).toBeVisible()
  await expect(page.locator('html')).toHaveAttribute('lang', 'zh-Hans')

  // Back to English for the shared helpers, then a quoted car whose message goes out in Malay.
  await page.getByRole('combobox', { name: '语言' }).selectOption('en')
  const plate = newPlate()
  await checkIn(page, plate, 'Battery flat in the morning.')
  await move(page, 'Start inspection')
  await addLine(page, 'Part', 'Battery NS40ZL', '230')
  await move(page, 'Send quote')
  await page.getByRole('combobox', { name: 'Message in' }).selectOption('ms')
  const wa = page.getByRole('link', { name: 'Send on WhatsApp' })
  await expect(wa).toHaveAttribute('href', /lang%3Dms$/)
  const href = await wa.getAttribute('href')
  const message = decodeURIComponent(href!.split('?text=')[1])
  expect(message).toContain('sebut harga untuk')
  const link = message.slice(message.lastIndexOf('http'))
  expect(link).toMatch(/\/t\/[A-Za-z0-9_-]{24}\?lang=ms$/)

  const phone = await customerPhone(browser)
  await phone.page.goto(link)
  await expect(phone.page.getByRole('heading', { name: 'Sebut harga anda sudah siap' })).toBeVisible()
  await expect(phone.page.getByTestId('public-total')).toHaveText('RM 248.40')
  await phone.page.getByRole('button', { name: 'Luluskan', exact: true }).click()
  await expect(phone.page.getByText('Luluskan RM 248.40 untuk 1 perkara di atas?')).toBeVisible()
  await phone.context.close()
})
