import { readFile } from 'node:fs/promises'
import { expect, test, type Page } from '@playwright/test'

interface DraftRecord {
  id: 'current'
  schemaVersion: number
  revision: number
  draft: {
    id: string
    mode: string
    status: string
    elapsedMs: number
    updatedAt: number
    snapshot: { variant: { phases: { durationSeconds: number }[] } }
  }
}

interface ActivityRecord {
  id: string
  result: { status: string; performedSeconds: number }
  reward: { totalXp: number; pathXp: Record<string, number> }
}

declare global {
  interface Window {
    abortActivityWrite: boolean
    holdActivityWrite: boolean
    activityWriteStarted: boolean
  }
}

async function installProgressMocks(page: Page) {
  await page.clock.install({ time: new Date('2026-01-01T12:00:00Z') })
  await page.clock.pauseAt(new Date('2026-01-01T12:00:01Z'))
  await page.addInitScript(() => {
    window.abortActivityWrite = false
    window.holdActivityWrite = false
    window.activityWriteStarted = false
    const add = IDBObjectStore.prototype.add
    IDBObjectStore.prototype.add = function (value, key) {
      const request = add.call(this, value, key)
      if (this.name === 'activities' && window.abortActivityWrite) {
        request.addEventListener('success', () => this.transaction.abort())
      }
      if (this.name === 'activities' && window.holdActivityWrite) {
        request.addEventListener('success', () => {
          window.activityWriteStarted = true
          const keepTransactionOpen = () => {
            if (window.holdActivityWrite) {
              this.get(request.result).addEventListener(
                'success',
                keepTransactionOpen,
              )
            }
          }
          keepTransactionOpen()
        })
      }
      return request
    }

    class SilentUtterance {
      text: string
      constructor(text: string) {
        this.text = text
      }
    }
    const synthesis = Object.assign(new EventTarget(), {
      getVoices: () => [],
      cancel: () => {},
      speak: () => {},
    })
    Object.defineProperty(window, 'speechSynthesis', {
      configurable: true,
      value: synthesis,
    })
    Object.defineProperty(window, 'SpeechSynthesisUtterance', {
      configurable: true,
      value: SilentUtterance,
    })
  })
}

test.beforeEach(async ({ page }) => {
  await installProgressMocks(page)
  await page.goto('/')
})

async function openRealSession(page: Page) {
  await page
    .getByRole('button', { name: 'Voir ma séance', exact: true })
    .click()
  await page
    .getByRole('button', { name: 'Ouvrir le lecteur', exact: true })
    .click()
  await expect(
    page.getByRole('button', { name: 'Démarrer la séance', exact: true }),
  ).toBeVisible()
}

async function seedCompletedSession(page: Page): Promise<string> {
  await openRealSession(page)
  const id = await page.evaluate(async () => {
    const database = await new Promise<IDBDatabase>((resolve, reject) => {
      const request = indexedDB.open('haki')
      request.onsuccess = () => resolve(request.result)
      request.onerror = () => reject(request.error)
    })
    try {
      return await new Promise<string>((resolve, reject) => {
        const transaction = database.transaction('session-drafts', 'readwrite')
        const store = transaction.objectStore('session-drafts')
        const current = store.get('current')
        const counter = store.get('revision-counter')
        let sessionId = ''
        transaction.onabort = () => reject(transaction.error)
        transaction.oncomplete = () => resolve(sessionId)
        counter.onsuccess = () => {
          const record = current.result as DraftRecord
          sessionId = record.draft.id
          record.draft.status = 'completed'
          record.draft.elapsedMs = record.draft.snapshot.variant.phases.reduce(
            (sum, phase) => sum + phase.durationSeconds * 1_000,
            0,
          )
          record.draft.updatedAt = Date.now()
          record.revision =
            Math.max(record.revision, counter.result?.revision ?? 0) + 1
          store.put(record)
          store.put({
            id: 'revision-counter',
            schemaVersion: 1,
            revision: record.revision,
          })
        }
      })
    } finally {
      database.close()
    }
  })
  await page.reload()
  await expect(
    page.getByRole('heading', { name: 'Minuteur terminé.', exact: true }),
  ).toBeVisible()
  return id
}

async function readProgressState(
  page: Page,
): Promise<{ activities: ActivityRecord[]; current: DraftRecord | null }> {
  return page.evaluate(async () => {
    const database = await new Promise<IDBDatabase>((resolve, reject) => {
      const request = indexedDB.open('haki')
      request.onsuccess = () => resolve(request.result)
      request.onerror = () => reject(request.error)
    })
    try {
      return await new Promise<{
        activities: ActivityRecord[]
        current: DraftRecord | null
      }>((resolve, reject) => {
        const transaction = database.transaction(
          ['activities', 'session-drafts'],
          'readonly',
        )
        const activities = transaction.objectStore('activities').getAll()
        const current = transaction.objectStore('session-drafts').get('current')
        transaction.onabort = () => reject(transaction.error)
        transaction.oncomplete = () =>
          resolve({
            activities: activities.result,
            current: current.result ?? null,
          })
      })
    } finally {
      database.close()
    }
  })
}

async function openReport(page: Page) {
  await page
    .getByRole('link', { name: 'Confirmer mon réalisé', exact: true })
    .click()
  await expect(
    page.getByRole('heading', { name: /^Chaque effort compte/ }),
  ).toBeVisible()
}

async function confirmAll(page: Page) {
  await page
    .getByRole('button', {
      name: 'Confirmer tous les blocs chronométrés',
      exact: true,
    })
    .click()
}

async function saveReport(page: Page) {
  await page
    .getByRole('button', { name: 'Confirmer et enregistrer', exact: true })
    .click()
  await expect(page).toHaveURL(/#historique\/.+/)
  await expect(
    page.getByRole('region', { name: 'XP enregistrée', exact: true }),
  ).toBeVisible()
}

async function navigateTo(page: Page, name: string) {
  await page
    .getByRole('navigation', { name: 'Navigation principale', exact: true })
    .getByRole('link', { name, exact: true })
    .click()
}

test('requires an explicit report and persists a complete activity and its exact XP split', async ({
  page,
}, testInfo) => {
  const sessionId = await seedCompletedSession(page)
  await openReport(page)
  const blocks = page.getByRole('group', {
    name: 'Blocs réalisés',
    exact: true,
  })
  await expect(blocks.getByRole('checkbox')).toHaveCount(9)
  await expect(blocks.locator('input:checked')).toHaveCount(0)
  await expect(
    page.getByRole('button', { name: 'Confirmer et enregistrer', exact: true }),
  ).toBeDisabled()
  await expect(
    page.getByRole('region', { name: 'XP à confirmer', exact: true }),
  ).toHaveCount(0)
  expect((await readProgressState(page)).activities).toEqual([])

  await confirmAll(page)
  const preview = page.getByRole('region', {
    name: 'XP à confirmer',
    exact: true,
  })
  await expect(preview).toContainText('+100 XP')
  await expect(preview).toContainText('Séance complète')
  if (process.env.HAKI_CAPTURE_PROGRESS) {
    await page.screenshot({
      path: testInfo.outputPath('report.png'),
      fullPage: true,
    })
  }
  await saveReport(page)
  const stored = await readProgressState(page)
  expect(stored.current).toBeNull()
  expect(stored.activities).toHaveLength(1)
  expect(stored.activities[0]).toMatchObject({
    id: sessionId,
    result: { status: 'completed', performedSeconds: 600 },
    reward: {
      totalXp: 100,
      pathXp: { power: 35, endurance: 30, technique: 35, strategy: 0 },
    },
  })
  await page.reload()
  await expect(
    page.getByRole('region', { name: 'XP enregistrée', exact: true }),
  ).toContainText('+100 XP')
  await navigateTo(page, 'Mon carnet')
  const progression = page.getByRole('region', {
    name: 'Progression générale',
    exact: true,
  })
  await expect(progression.getByText('Niveau 2', { exact: true })).toBeVisible()
  await expect(progression.getByText('100 XP', { exact: true })).toBeVisible()
  await expect(
    progression.getByRole('progressbar', {
      name: 'Avancée vers le prochain niveau',
    }),
  ).toHaveAttribute('value', '0')
  await expect(page.getByText('1 activité', { exact: true })).toBeVisible()
  if (process.env.HAKI_CAPTURE_PROGRESS) {
    await page.screenshot({
      path: testInfo.outputPath('history.png'),
      fullPage: true,
    })
  }
})

test('caps a stopped report to timed movement and excludes paused time', async ({
  page,
}) => {
  await openRealSession(page)
  await page
    .getByRole('button', { name: 'Démarrer la séance', exact: true })
    .click()
  await page.clock.runFor(20_000)
  await page
    .getByRole('button', { name: 'Mettre en pause', exact: true })
    .click()
  await page.clock.fastForward(60_000)
  await page
    .getByRole('button', { name: 'Reprendre la séance', exact: true })
    .click()
  await page.clock.runFor(10_000)
  await page.getByRole('button', { name: 'Arrêter', exact: true }).click()
  await page
    .getByRole('dialog')
    .getByRole('button', { name: 'Arrêter et conserver', exact: true })
    .click()
  await openReport(page)
  const blocks = page.getByRole('group', {
    name: 'Blocs réalisés',
    exact: true,
  })
  await expect(blocks.getByRole('checkbox')).toHaveCount(1)
  await expect(blocks.getByRole('checkbox')).not.toBeChecked()
  await blocks.getByRole('checkbox').check()
  const seconds = blocks.getByRole('spinbutton', {
    name: 'Durée réalisée (secondes)',
  })
  await expect(seconds).toHaveValue('30')
  await expect(seconds).toHaveAttribute('max', '30')
  await seconds.fill('31')
  await expect(page.getByRole('alert')).toContainText(
    'sans dépasser le temps chronométré',
  )
  await expect(
    page.getByRole('button', { name: 'Confirmer et enregistrer', exact: true }),
  ).toBeDisabled()
  await seconds.fill('30')
  await expect(
    page.getByRole('region', { name: 'XP à confirmer', exact: true }),
  ).toContainText('+5 XP')
  await saveReport(page)
  const stored = await readProgressState(page)
  expect(stored.activities[0]).toMatchObject({
    result: { status: 'partial', performedSeconds: 30 },
    reward: { totalXp: 5 },
  })
  expect(
    Object.values(stored.activities[0].reward.pathXp).reduce(
      (sum, xp) => sum + xp,
      0,
    ),
  ).toBe(5)
  expect(stored.current).toBeNull()
})

test('records a partial activity when a completed timer is only partly confirmed', async ({
  page,
}) => {
  await seedCompletedSession(page)
  await openReport(page)
  await page.getByRole('checkbox', { name: /Entrer dans le rythme/ }).check()
  const preview = page.getByRole('region', {
    name: 'XP à confirmer',
    exact: true,
  })
  await expect(preview).toContainText('Séance partielle')
  await expect(preview).toContainText('+30 XP')
  await saveReport(page)
  expect((await readProgressState(page)).activities[0]).toMatchObject({
    result: { status: 'partial', performedSeconds: 180 },
    reward: { totalXp: 30 },
  })
})

test('does not award the same activity again after duplicate submission or revisiting its report', async ({
  page,
}) => {
  const sessionId = await seedCompletedSession(page)
  await openReport(page)
  await confirmAll(page)
  const save = page.getByRole('button', {
    name: 'Confirmer et enregistrer',
    exact: true,
  })
  await expect(save).toBeEnabled()
  await save.evaluate((button) => {
    const form = (button as HTMLButtonElement).form
    form?.requestSubmit()
    form?.requestSubmit()
  })
  await expect(page).toHaveURL(/#historique\/.+/)
  await page.goto(`/#bilan/${encodeURIComponent(sessionId)}`)
  await expect(
    page.getByRole('region', { name: 'XP enregistrée', exact: true }),
  ).toContainText('+100 XP')
  await expect(
    page.getByRole('button', { name: 'Confirmer et enregistrer', exact: true }),
  ).toHaveCount(0)
  expect((await readProgressState(page)).activities).toHaveLength(1)
  await navigateTo(page, 'Mon carnet')
  await expect(
    page
      .getByRole('region', { name: 'Progression générale', exact: true })
      .getByText('100 XP', { exact: true }),
  ).toBeVisible()
})

test('rolls back an aborted save and keeps the report available for one successful retry', async ({
  page,
}) => {
  const sessionId = await seedCompletedSession(page)
  await openReport(page)
  await confirmAll(page)
  await page.evaluate(() => {
    window.abortActivityWrite = true
  })
  await page
    .getByRole('button', { name: 'Confirmer et enregistrer', exact: true })
    .click()
  await expect(page.getByRole('alert')).toBeVisible()
  await expect(page).toHaveURL(/#bilan\/.+/)
  await expect(
    page.getByRole('region', { name: 'XP enregistrée', exact: true }),
  ).toHaveCount(0)
  const failed = await readProgressState(page)
  expect(failed.activities).toEqual([])
  expect(failed.current?.draft.id).toBe(sessionId)

  await page.evaluate(() => {
    window.abortActivityWrite = false
  })
  await saveReport(page)
  const retried = await readProgressState(page)
  expect(retried.current).toBeNull()
  expect(retried.activities).toHaveLength(1)
  expect(retried.activities[0].reward.totalXp).toBe(100)
})

test('preserves one recoverable outcome when reloading during an activity transaction', async ({
  page,
}) => {
  const sessionId = await seedCompletedSession(page)
  await openReport(page)
  await confirmAll(page)
  await page.evaluate(() => {
    window.holdActivityWrite = true
  })
  await page
    .getByRole('button', { name: 'Confirmer et enregistrer', exact: true })
    .click()
  await expect
    .poll(() => page.evaluate(() => window.activityWriteStarted))
    .toBe(true)
  await expect(
    page.getByRole('button', { name: 'Enregistrement…', exact: true }),
  ).toBeDisabled()

  await page.reload()
  const recovered = await readProgressState(page)
  expect(recovered.activities.length + Number(recovered.current !== null)).toBe(
    1,
  )
  if (recovered.current) {
    expect(recovered.current.draft.id).toBe(sessionId)
    await confirmAll(page)
    await saveReport(page)
  } else {
    await expect(
      page.getByRole('region', { name: 'XP enregistrée', exact: true }),
    ).toContainText('+100 XP')
  }
  const stored = await readProgressState(page)
  expect(stored.current).toBeNull()
  expect(stored.activities).toHaveLength(1)
  expect(stored.activities[0]).toMatchObject({
    id: sessionId,
    reward: { totalXp: 100 },
  })
})

test('exports a versioned backup containing history, a saved profile, and the current draft', async ({
  page,
}) => {
  await page
    .getByRole('combobox', { name: 'Temps disponible', exact: true })
    .selectOption('20')
  await page
    .getByRole('button', { name: 'Enregistrer le profil', exact: true })
    .click()
  await expect(
    page.getByText('Profil Maison enregistré sur cet appareil.', {
      exact: true,
    }),
  ).toBeVisible()
  const completedId = await seedCompletedSession(page)
  await openReport(page)
  await confirmAll(page)
  await saveReport(page)
  await navigateTo(page, 'Préparer une séance')
  await openRealSession(page)
  const currentId = (await readProgressState(page)).current?.draft.id
  expect(currentId).toBeTruthy()
  expect(currentId).not.toBe(completedId)
  await navigateTo(page, 'Mon carnet')
  const downloadPromise = page.waitForEvent('download')
  await page
    .getByRole('button', { name: 'Exporter mes données', exact: true })
    .click()
  const download = await downloadPromise
  expect(download.suggestedFilename()).toMatch(/^haki-\d{4}-\d{2}-\d{2}\.json$/)
  const path = await download.path()
  expect(path).not.toBeNull()
  const backup = JSON.parse(await readFile(path!, 'utf8'))
  expect(backup).toMatchObject({
    format: 'haki-backup',
    version: 2,
    activities: [{ id: completedId, reward: { totalXp: 100 } }],
    profiles: [{ id: 'home', name: 'Maison', setup: { availableMinutes: 20 } }],
    session: {
      draft: { id: currentId, mode: 'real', status: 'paused', elapsedMs: 0 },
    },
  })
  expect(backup.activities).toHaveLength(1)
  expect(backup.profiles).toHaveLength(1)
  expect(Number.isFinite(Date.parse(backup.exportedAt))).toBe(true)
  expect(backup.session.revision).toBeGreaterThan(0)
  expect((await readProgressState(page)).current?.draft.id).toBe(currentId)
})

test('keeps an accelerated preview out of history and never offers it a reward report', async ({
  page,
}) => {
  await page
    .getByRole('button', { name: 'Voir ma séance', exact: true })
    .click()
  await page
    .getByRole('button', { name: 'Essayer en accéléré', exact: true })
    .click()
  await page
    .getByRole('button', { name: 'Démarrer l’aperçu', exact: true })
    .click()
  await page.clock.runFor(65_000)
  await expect(
    page.getByRole('heading', { name: 'Minuteur terminé.', exact: true }),
  ).toBeVisible()
  await expect(
    page.getByRole('link', { name: 'Confirmer mon réalisé', exact: true }),
  ).toHaveCount(0)
  await navigateTo(page, 'Mon carnet')
  await expect(
    page
      .getByRole('region', { name: 'Progression générale', exact: true })
      .locator('.general-level')
      .getByText('0 XP', { exact: true }),
  ).toBeVisible()
  expect(await readProgressState(page)).toEqual({
    activities: [],
    current: null,
  })
})

for (const replacement of [false, true]) {
  test(`refreshes a report finalized in another tab ${replacement ? 'and loads its newer draft' : 'without leaving a stale draft'}`, async ({
    page,
    context,
  }) => {
    const completedId = await seedCompletedSession(page)
    await navigateTo(page, 'Préparer une séance')
    await page
      .getByRole('button', { name: 'Voir ma séance', exact: true })
      .click()
    const launch = page.getByRole('button', {
      name: 'Ouvrir le lecteur',
      exact: true,
    })
    await expect(launch).toBeDisabled()

    const other = await context.newPage()
    await installProgressMocks(other)
    await other.goto(`/#bilan/${encodeURIComponent(completedId)}`)
    await confirmAll(other)
    await saveReport(other)

    if (replacement) {
      await navigateTo(other, 'Préparer une séance')
      await openRealSession(other)
      await other
        .getByRole('button', { name: 'Démarrer la séance', exact: true })
        .click()
      await other.clock.runFor(30_000)
      await other
        .getByRole('button', { name: 'Mettre en pause', exact: true })
        .click()
      await expect
        .poll(
          async () => (await readProgressState(other)).current?.draft.elapsedMs,
        )
        .toBe(30_000)
    }

    await page.evaluate(() => window.dispatchEvent(new Event('focus')))
    if (replacement) {
      await expect(
        page.getByText('Une séance t’attend.', { exact: true }),
      ).toBeVisible()
      await expect(launch).toBeDisabled()
      await page
        .getByRole('link', { name: 'Retrouver ma séance', exact: true })
        .click()
      await expect(
        page.getByRole('button', { name: 'Reprendre la séance', exact: true }),
      ).toBeVisible()
      await expect(
        page.getByRole('timer', {
          name: 'Temps restant dans l’étape',
          exact: true,
        }),
      ).toHaveText('02:30')
      expect((await readProgressState(page)).current?.draft.id).not.toBe(
        completedId,
      )
    } else {
      await expect(launch).toBeEnabled()
      await expect(
        page.getByRole('complementary', {
          name: 'Séance conservée',
          exact: true,
        }),
      ).toHaveCount(0)
      await launch.click()
      await expect(
        page.getByRole('button', { name: 'Démarrer la séance', exact: true }),
      ).toBeVisible()
      expect((await readProgressState(page)).current?.draft.id).not.toBe(
        completedId,
      )
    }
    expect((await readProgressState(page)).activities).toHaveLength(1)
    await other.close()
  })
}
