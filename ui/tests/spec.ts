// SPDX-License-Identifier: Apache-2.0
// SPDX-FileCopyrightText: 2023-Present The UDS Authors

import { expect, test } from '@playwright/test'

test('home page has expected h1', async ({ page }) => {
  await page.goto('/')
  await expect(page.getByText('Overview')).toBeVisible()
})
