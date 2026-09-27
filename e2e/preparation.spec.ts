import { expect, test } from '@playwright/test'

test.beforeEach(async ({ page }) => {
  await page.goto('/')
})

test('reviews a compatible session and lets the user edit their preparation', async ({
  page,
}) => {
  await expect(page.getByRole('radio', { name: /Fondations/ })).toBeChecked()
  await page
    .getByRole('button', { name: 'Voir ma séance', exact: true })
    .click()
  await expect(
    page.getByRole('heading', { name: /^Ta séance est prête/ }),
  ).toBeVisible()
  await page
    .getByRole('button', { name: 'Modifier ma préparation', exact: true })
    .click()
  await expect(page.getByRole('radio', { name: /Fondations/ })).toBeChecked()
  await expect(
    page.getByRole('button', { name: 'Voir ma séance', exact: true }),
  ).toBeEnabled()
})

test('keeps the selected session when time is too short and requires an explicit alternative', async ({
  page,
}) => {
  await page
    .getByRole('combobox', { name: 'Temps disponible', exact: true })
    .selectOption('8')
  await expect(page.getByRole('radio', { name: /Fondations/ })).toBeChecked()
  await expect(
    page.getByRole('button', { name: 'Voir ma séance', exact: true }),
  ).toBeDisabled()
  await expect(
    page.getByText(
      'Prévois au moins 12 min, échauffement et récupérations inclus.',
    ),
  ).toBeVisible()

  await page.getByRole('radio', { name: /Pas légers/ }).check()
  await expect(
    page.getByRole('radio', { name: /Fondations/ }),
  ).not.toBeChecked()
  await expect(
    page.getByRole('button', { name: 'Voir ma séance', exact: true }),
  ).toBeEnabled()
  await page
    .getByRole('button', { name: 'Voir ma séance', exact: true })
    .click()
  await expect(
    page.getByRole('heading', { name: /^Ta séance est prête/ }),
  ).toBeVisible()
})

test('does not offer a session shorter than the shortest available variant', async ({
  page,
}) => {
  await page
    .getByRole('combobox', { name: 'Temps disponible', exact: true })
    .selectOption('5')
  await expect(page.getByRole('radio', { name: /Fondations/ })).toBeChecked()
  await expect(
    page.getByRole('button', { name: 'Voir ma séance', exact: true }),
  ).toBeDisabled()
  await page.getByRole('radio', { name: /Pas légers/ }).check()
  await expect(
    page.getByRole('button', { name: 'Voir ma séance', exact: true }),
  ).toBeDisabled()
})

test('checks the equipment, available space, and noise constraints for the rope variant', async ({
  page,
}) => {
  await page
    .getByRole('combobox', { name: 'Temps disponible', exact: true })
    .selectOption('15')
  await page
    .getByRole('combobox', { name: 'Expérience', exact: true })
    .selectOption('regular')
  await page.getByRole('checkbox', { name: /^Espace réduit/ }).uncheck()
  await page.getByRole('checkbox', { name: /^Éviter le bruit/ }).uncheck()
  await page
    .getByRole('checkbox', { name: 'Corde à sauter', exact: true })
    .check()
  const ropeVariant = page.getByRole('radio', { name: /Appuis en mouvement/ })
  const review = page.getByRole('button', {
    name: 'Voir ma séance',
    exact: true,
  })
  await ropeVariant.check()
  await expect(review).toBeEnabled()

  await page
    .getByRole('checkbox', { name: 'Corde à sauter', exact: true })
    .uncheck()
  await expect(review).toBeDisabled()
  await expect(ropeVariant).toBeChecked()
  await page
    .getByRole('checkbox', { name: 'Corde à sauter', exact: true })
    .check()
  await expect(review).toBeEnabled()

  await page.getByRole('checkbox', { name: /^Espace réduit/ }).check()
  await expect(review).toBeDisabled()
  await page.getByRole('checkbox', { name: /^Espace réduit/ }).uncheck()
  await expect(review).toBeEnabled()

  await page.getByRole('checkbox', { name: /^Éviter le bruit/ }).check()
  await expect(review).toBeDisabled()
  await expect(ropeVariant).toBeChecked()
})

test('can navigate to the idle audio check and back to preparation', async ({
  page,
}) => {
  await page.getByRole('link', { name: 'Tester le guide', exact: true }).click()
  await expect(page).toHaveURL(/#guide$/)
  await expect(
    page.getByRole('button', { name: 'Lancer le test audio', exact: true }),
  ).toBeVisible()
  await expect(
    page.getByRole('button', { name: 'Mettre en pause', exact: true }),
  ).toHaveCount(0)
  await page
    .getByRole('link', { name: 'Préparer une séance', exact: true })
    .click()
  await expect(page).toHaveURL(/#preparation$/)
  await expect(
    page.getByRole('button', { name: 'Voir ma séance', exact: true }),
  ).toBeVisible()
})

test('preserves the preparation draft and reviewed session when visiting the guide', async ({
  page,
}) => {
  await page
    .getByRole('combobox', { name: 'Temps disponible', exact: true })
    .selectOption('8')
  await page.getByRole('radio', { name: 'Pas légers', exact: true }).check()
  await page
    .getByRole('button', { name: 'Voir ma séance', exact: true })
    .click()
  await expect(
    page.getByRole('heading', { name: /^Ta séance est prête/ }),
  ).toBeVisible()

  await page
    .getByRole('link', { name: 'Tester le guide audio', exact: true })
    .click()
  await expect(
    page.getByRole('button', { name: 'Lancer le test audio', exact: true }),
  ).toBeVisible()
  await expect.poll(() => page.evaluate(() => window.scrollY)).toBeLessThan(2)
  await expect(page.locator('#main-content')).toBeFocused()
  await page
    .getByRole('link', { name: 'Préparer une séance', exact: true })
    .click()
  await expect(
    page.getByRole('heading', { name: /^Ta séance est prête/ }),
  ).toBeVisible()
  await expect.poll(() => page.evaluate(() => window.scrollY)).toBeLessThan(2)
  await expect(page.locator('#main-content')).toBeFocused()
  await page
    .getByRole('button', { name: 'Modifier ma préparation', exact: true })
    .click()
  await expect(
    page.getByRole('combobox', { name: 'Temps disponible', exact: true }),
  ).toHaveValue('8')
  await expect(
    page.getByRole('radio', { name: 'Pas légers', exact: true }),
  ).toBeChecked()
  await expect(page.getByRole('status')).toHaveText(
    'Modifications non enregistrées.',
  )
})

test('shows movement instructions and phase cues before training', async ({
  page,
}) => {
  const instruction = page.getByText('Tiens-toi droit et regarde devant toi.', {
    exact: true,
  })
  await expect(instruction).toBeHidden()
  await page.locator('summary').filter({ hasText: 'Marche sur place' }).click()
  await expect(instruction).toBeVisible()
  await expect(
    page.getByText(
      'Ralentis autant que nécessaire. Tu dois pouvoir parler sans forcer.',
      { exact: true },
    ),
  ).toBeVisible()

  await page
    .getByRole('button', { name: 'Voir ma séance', exact: true })
    .click()
  await expect(
    page.getByRole('heading', { name: 'Le fil de ta séance', exact: true }),
  ).toBeVisible()
  await expect(
    page.getByText(
      'Privilégie quelques répétitions lentes, avec une petite amplitude.',
      { exact: true },
    ),
  ).toBeVisible()
  await expect(
    page.getByText(
      'Les 12 min comprennent l’échauffement, les récupérations et le retour au calme.',
      { exact: true },
    ),
  ).toBeVisible()
})

test('persists a profile only after saving and restores it after reloading', async ({
  page,
}) => {
  await page
    .getByRole('combobox', { name: 'Lieu d’entraînement', exact: true })
    .selectOption('outdoors')
  await page
    .getByRole('combobox', { name: 'Temps disponible', exact: true })
    .selectOption('30')
  await page
    .getByRole('combobox', { name: 'Expérience', exact: true })
    .selectOption('regular')
  await page
    .getByRole('checkbox', { name: 'Corde à sauter', exact: true })
    .check()
  await page.getByRole('checkbox', { name: /^Espace réduit/ }).uncheck()
  await page.getByRole('checkbox', { name: /^Éviter le bruit/ }).uncheck()
  await page
    .getByRole('button', { name: 'Enregistrer le profil', exact: true })
    .click()
  await expect(page.getByRole('status')).toHaveText(
    'Profil Maison enregistré sur cet appareil.',
  )
  await page.reload()

  await expect(
    page.getByRole('combobox', { name: 'Lieu d’entraînement', exact: true }),
  ).toHaveValue('outdoors')
  await expect(
    page.getByRole('combobox', { name: 'Temps disponible', exact: true }),
  ).toHaveValue('30')
  await expect(
    page.getByRole('combobox', { name: 'Expérience', exact: true }),
  ).toHaveValue('regular')
  await expect(
    page.getByRole('checkbox', { name: 'Corde à sauter', exact: true }),
  ).toBeChecked()
  await expect(
    page.getByRole('checkbox', { name: /^Espace réduit/ }),
  ).not.toBeChecked()
  await expect(
    page.getByRole('checkbox', { name: /^Éviter le bruit/ }),
  ).not.toBeChecked()

  await page
    .getByRole('combobox', { name: 'Temps disponible', exact: true })
    .selectOption('8')
  await page
    .getByRole('checkbox', { name: 'Corde à sauter', exact: true })
    .uncheck()
  await page.reload()
  await expect(
    page.getByRole('combobox', { name: 'Temps disponible', exact: true }),
  ).toHaveValue('30')
  await expect(
    page.getByRole('checkbox', { name: 'Corde à sauter', exact: true }),
  ).toBeChecked()
})

test('keeps saved home and gym profiles separate', async ({ page }) => {
  const time = page.getByRole('combobox', {
    name: 'Temps disponible',
    exact: true,
  })
  await time.selectOption('8')
  await page
    .getByRole('button', { name: 'Enregistrer le profil', exact: true })
    .click()
  await expect(page.getByRole('status')).toHaveText(
    'Profil Maison enregistré sur cet appareil.',
  )

  await page.getByRole('button', { name: 'Salle de boxe', exact: true }).click()
  await expect(
    page.getByRole('combobox', { name: 'Lieu d’entraînement', exact: true }),
  ).toHaveValue('gym')
  await expect(time).toHaveValue('15')
  await time.selectOption('20')
  await page.getByRole('checkbox', { name: 'Haltères', exact: true }).check()
  await page
    .getByRole('button', { name: 'Enregistrer le profil', exact: true })
    .click()
  await expect(page.getByRole('status')).toHaveText(
    'Profil Salle de boxe enregistré sur cet appareil.',
  )

  await page.reload()
  await expect(time).toHaveValue('8')
  await expect(
    page.getByRole('checkbox', { name: 'Haltères', exact: true }),
  ).not.toBeChecked()
  await page.getByRole('button', { name: 'Salle de boxe', exact: true }).click()
  await expect(time).toHaveValue('20')
  await expect(
    page.getByRole('checkbox', { name: 'Haltères', exact: true }),
  ).toBeChecked()
})
