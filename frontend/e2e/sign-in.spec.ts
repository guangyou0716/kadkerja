import { expect, test } from '@playwright/test'
import { signIn, signOut } from './helpers.ts'

test('a wrong password is refused; signing out ends the session', async ({ page }) => {
  await page.goto('/')
  await page.getByLabel('Username').fill('advisor')
  await page.getByLabel('Password').fill('not-the-password')
  await page.getByRole('button', { name: 'Sign in' }).click()
  await expect(page.getByRole('alert')).toHaveText('Wrong username or password.')

  await signIn(page, 'advisor')
  await expect(page.getByText('Farah Demo · Service advisor')).toBeVisible()
  await signOut(page)
  // The old session is gone on the server too, not only in the page.
  await page.goto('/staff')
  await expect(page.getByRole('heading', { name: 'Staff sign-in' })).toBeVisible()
  expect((await page.request.get('/api/auth/me')).status()).toBe(401)
})
