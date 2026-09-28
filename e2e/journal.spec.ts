import { readFile } from 'node:fs/promises'
import { expect, test, type Page } from '@playwright/test'

interface SavedActivity {
  id: string
  kind: 'manual' | 'guided'
  recordedAt: number
  revision?: number
  updatedAt?: number
  occurredAt?: number
  title?: string
  notes?: string
  durationSeconds?: number
  pathIds?: string[]
  session?: {
    id: string
    snapshot: { workoutId: string; workoutVersion: number }
  }
  result?: {
    status: string
    phases: { phaseId: string; performedSeconds: number }[]
  }
  reward: {
    policyVersion: number
    totalXp: number
    pathXp: Record<string, number>
  }
}

interface SavedJournal {
  activities: SavedActivity[]
  deletedActivities: {
    schemaVersion: number
    id: string
    revision: number
    deletedAt: number
  }[]
  current: unknown
}

declare global {
  interface Window {
    journalAbortWrite: boolean
    journalHoldWrite: boolean
    journalWriteStarted: boolean
  }
}

const NOW = Date.parse('2026-09-28T12:00:00Z')
const ROOT_ID = 'leveil-du-nord'
const STRENGTH_ID = 'le-socle-de-pierre'

test.use({ timezoneId: 'Europe/Paris' })

async function installJournalMocks(page: Page) {
  await page.clock.install({ time: new Date(NOW) })
  await page.clock.pauseAt(new Date(NOW + 1_000))
  await page.addInitScript(() => {
    window.journalAbortWrite = false
    window.journalHoldWrite = false
    window.journalWriteStarted = false
    const originalAdd = IDBObjectStore.prototype.add
    IDBObjectStore.prototype.add = function (value, key) {
      const request = originalAdd.call(this, value, key)
      if (this.name === 'activities' && window.journalAbortWrite)
        request.addEventListener('success', () => this.transaction.abort())
      if (this.name === 'activities' && window.journalHoldWrite) {
        request.addEventListener('success', () => {
          window.journalWriteStarted = true
          const keepOpen = () => {
            if (window.journalHoldWrite)
              this.get(request.result).addEventListener('success', keepOpen)
          }
          keepOpen()
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
    Object.defineProperty(window, 'speechSynthesis', {
      configurable: true,
      value: Object.assign(new EventTarget(), {
        getVoices: () => [],
        cancel: () => {},
        speak: () => {},
      }),
    })
    Object.defineProperty(window, 'SpeechSynthesisUtterance', {
      configurable: true,
      value: SilentUtterance,
    })
  })
}

async function readJournal(page: Page): Promise<SavedJournal> {
  return page.evaluate(async () => {
    const database = await new Promise<IDBDatabase>((resolve, reject) => {
      const request = indexedDB.open('haki')
      request.onsuccess = () => resolve(request.result)
      request.onerror = () => reject(request.error)
    })
    try {
      return await new Promise((resolve, reject) => {
        const transaction = database.transaction(
          ['activities', 'activity-deletions', 'session-drafts'],
          'readonly',
        )
        const activities = transaction.objectStore('activities').getAll()
        const deleted = transaction.objectStore('activity-deletions').getAll()
        const current = transaction.objectStore('session-drafts').get('current')
        transaction.oncomplete = () =>
          resolve({
            activities: activities.result,
            deletedActivities: deleted.result,
            current: current.result ?? null,
          })
        transaction.onabort = () => reject(transaction.error)
      })
    } finally {
      database.close()
    }
  })
}

async function navigate(page: Page, label: 'Mon carnet' | 'Parcours Viking') {
  await page
    .getByRole('navigation', { name: 'Navigation principale', exact: true })
    .getByRole('link', { name: label, exact: true })
    .click()
  await expect(page).toHaveURL(
    label === 'Mon carnet' ? /#historique$/ : /#parcours$/,
  )
}

async function fillManual(
  page: Page,
  {
    title = 'Boxe au club',
    date = '2026-09-28T10:30',
    minutes = 12,
    notes = 'Travail précis des appuis',
    paths = ['Le Puissant', 'Le Technicien'],
  } = {},
) {
  await page
    .getByRole('textbox', { name: 'Entraînement', exact: true })
    .fill(title)
  await page.getByLabel('Date et heure', { exact: true }).fill(date)
  await page
    .getByRole('spinbutton', { name: 'Durée (minutes)', exact: true })
    .fill(String(minutes))
  for (const path of paths)
    await page.getByRole('checkbox', { name: new RegExp(`^${path} `) }).check()
  await page.getByRole('textbox', { name: /^Notes/ }).fill(notes)
}

async function startManual(page: Page) {
  await page
    .getByRole('link', { name: 'Ajouter un entraînement', exact: true })
    .click()
  await expect(
    page.getByRole('heading', { name: 'Ajouter un entraînement', exact: true }),
  ).toBeVisible()
}

async function saveManual(page: Page): Promise<SavedActivity> {
  await page
    .getByRole('button', { name: 'Enregistrer l’entraînement', exact: true })
    .click()
  await expect(page).toHaveURL(/#historique\/.+/)
  await expect(
    page.getByRole('region', { name: 'XP enregistrée', exact: true }),
  ).toBeVisible()
  const id = await page.evaluate(() =>
    decodeURIComponent(window.location.hash.slice('#historique/'.length)),
  )
  return (await readJournal(page)).activities.find((item) => item.id === id)!
}

async function addManual(
  page: Page,
  values: Parameters<typeof fillManual>[1] = {},
) {
  await startManual(page)
  await fillManual(page, values)
  return saveManual(page)
}

async function saveChanges(page: Page) {
  await page
    .getByRole('button', { name: 'Enregistrer les modifications', exact: true })
    .click()
  await expect(page).toHaveURL(/#historique\/.+/)
  await expect(
    page.getByRole('region', { name: 'XP enregistrée', exact: true }),
  ).toBeVisible()
}

function calendar(page: Page) {
  return page.getByRole('complementary', {
    name: 'Calendrier des entraînements',
    exact: true,
  })
}

function periodSummary(page: Page, period: 'Cette semaine' | 'Mois affiché') {
  return calendar(page).getByText(period, { exact: true }).locator('..')
}

function activityList(page: Page) {
  return page.getByRole('region', { name: 'Tes séances', exact: true })
}

async function expectTotal(page: Page, total: number) {
  await expect(
    page.getByRole('region', { name: 'Progression générale', exact: true }),
  ).toContainText(`${total} XP au total`)
}

async function expectNoOverflow(page: Page) {
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= window.innerWidth,
    ),
  ).toBe(true)
}

async function seedGuided(
  page: Page,
  workoutId: string,
  createdAt: number,
): Promise<SavedActivity> {
  return page.evaluate(
    async ({ id, started }) => {
      const contentSource = '/src/content/workouts.ts'
      const sessionSource = '/src/domain/session.ts'
      const activitySource = '/src/domain/activity.ts'
      const [
        { getWorkout, MOVEMENTS },
        { createSessionDraft, getSessionDuration },
        { createActivity },
      ] = await Promise.all([
        import(contentSource),
        import(sessionSource),
        import(activitySource),
      ])
      const workout = getWorkout(id)
      const variant = workout.variants[0]
      const draft = createSessionDraft(
        workout,
        variant,
        {
          environment: 'home',
          equipment: variant.requiredEquipment,
          availableMinutes: 30,
          experience: 'regular',
          smallSpace: false,
          quiet: false,
        },
        MOVEMENTS,
        'real',
        `journal-${id}`,
        started,
      )
      draft.status = 'completed'
      draft.elapsedMs = getSessionDuration(draft)
      draft.updatedAt = started + draft.elapsedMs
      const phases = variant.phases
        .filter((phase: { kind: string }) => phase.kind !== 'rest')
        .map((phase: { id: string; durationSeconds: number }) => ({
          phaseId: phase.id,
          performedSeconds: phase.durationSeconds,
        }))
      const activity = createActivity(draft, phases, draft.updatedAt + 1_000)
      const database = await new Promise<IDBDatabase>((resolve, reject) => {
        const request = indexedDB.open('haki')
        request.onsuccess = () => resolve(request.result)
        request.onerror = () => reject(request.error)
      })
      try {
        await new Promise<void>((resolve, reject) => {
          const transaction = database.transaction('activities', 'readwrite')
          transaction.objectStore('activities').add(activity)
          transaction.oncomplete = () => resolve()
          transaction.onabort = () => reject(transaction.error)
        })
      } finally {
        database.close()
      }
      return activity
    },
    { id: workoutId, started: createdAt },
  )
}

test.beforeEach(async ({ page }) => {
  await installJournalMocks(page)
  await page.goto('/#historique')
  await expect(
    page.getByRole('heading', { name: /^Trace ta voie/ }),
  ).toBeVisible()
})

test('adds a manual workout with equal path XP and restores it without unlocking Viking', async ({
  page,
}) => {
  await page.setViewportSize({ width: 390, height: 844 })
  await startManual(page)
  await fillManual(page, {
    paths: ['Le Puissant', 'L’Infatigable', 'Le Technicien'],
  })
  await expectNoOverflow(page)
  const activity = await saveManual(page)
  expect(activity).toMatchObject({
    kind: 'manual',
    revision: 1,
    title: 'Boxe au club',
    occurredAt: Date.parse('2026-09-28T08:30:00Z'),
    durationSeconds: 720,
    notes: 'Travail précis des appuis',
    reward: {
      policyVersion: 3,
      totalXp: 120,
      pathXp: { power: 40, endurance: 40, technique: 40, strategy: 0 },
    },
  })
  await page.reload()
  await expect(page.getByRole('heading', { level: 1 })).toContainText(
    'Boxe au club',
  )
  await expect(
    page.getByRole('region', { name: 'Notes de l’activité', exact: true }),
  ).toContainText(activity.notes!)
  await navigate(page, 'Parcours Viking')
  await expect(
    page.getByRole('progressbar', { name: 'Étapes validées', exact: true }),
  ).toHaveAttribute('aria-valuenow', '0')
  await expect(
    page.getByRole('link', {
      name: 'Découvrir Le Socle de pierre',
      exact: true,
    }),
  ).toBeVisible()
  await navigate(page, 'Mon carnet')
  await expectTotal(page, 120)
  await expectNoOverflow(page)
  expect((await readJournal(page)).activities).toEqual([activity])
})

test('edits one identity and replaces its XP, notes, date, and calendar placement', async ({
  page,
}) => {
  const activity = await addManual(page)
  await page
    .getByRole('link', { name: 'Modifier cette activité', exact: true })
    .click()
  await page
    .getByRole('spinbutton', { name: 'Durée (minutes)', exact: true })
    .fill('5')
  await page
    .getByLabel('Date et heure', { exact: true })
    .fill('2026-09-27T23:50')
  await page
    .getByRole('textbox', { name: /^Notes/ })
    .fill('Durée corrigée après le cours')
  await saveChanges(page)
  await expect(
    page.getByRole('region', { name: 'Notes de l’activité', exact: true }),
  ).toContainText('Durée corrigée après le cours')
  const saved = (await readJournal(page)).activities
  expect(saved).toHaveLength(1)
  expect(saved[0]).toMatchObject({
    id: activity.id,
    revision: 2,
    recordedAt: activity.recordedAt,
    durationSeconds: 300,
    occurredAt: Date.parse('2026-09-27T21:50:00Z'),
    notes: 'Durée corrigée après le cours',
    reward: { totalXp: 50, pathXp: { power: 25, technique: 25 } },
  })
  await navigate(page, 'Mon carnet')
  await expectTotal(page, 50)
  await expect(periodSummary(page, 'Cette semaine')).toContainText(
    '0 entraînement',
  )
  await expect(periodSummary(page, 'Mois affiché')).toContainText(
    '1 entraînement',
  )
  await calendar(page)
    .getByRole('button', {
      name: 'dimanche 27 septembre 2026, 1 entraînement',
      exact: true,
    })
    .click()
  await expect(
    activityList(page).getByRole('heading', {
      name: 'Boxe au club',
      exact: true,
    }),
  ).toBeVisible()
  await page.getByRole('button', { name: 'Aujourd’hui', exact: true }).click()
  await expect(activityList(page)).toContainText(
    'Aucun entraînement pour cette période.',
  )
  await page.getByRole('button', { name: 'Mois affiché', exact: true }).click()
  await expect(
    activityList(page).getByRole('heading', {
      name: 'Boxe au club',
      exact: true,
    }),
  ).toBeVisible()
  await page.reload()
  await expectTotal(page, 50)
  expect((await readJournal(page)).activities).toEqual(saved)
})

test('cancels a deletion then removes its XP and exports a minimal version-two tombstone', async ({
  page,
}) => {
  const activity = await addManual(page, { minutes: 20 })
  const remove = page.getByRole('button', {
    name: 'Supprimer cette activité',
    exact: true,
  })
  await remove.click()
  const dialog = page.getByRole('dialog', {
    name: 'Supprimer cette activité ?',
    exact: true,
  })
  await expect(dialog).toContainText('Boxe au club')
  await dialog.getByRole('button', { name: 'Annuler', exact: true }).click()
  await expect(dialog).toHaveCount(0)
  expect((await readJournal(page)).activities).toEqual([activity])
  await remove.click()
  await dialog
    .getByRole('button', { name: 'Supprimer définitivement', exact: true })
    .click()
  await expect(page).toHaveURL(/#historique$/)
  await expectTotal(page, 0)
  const stored = await readJournal(page)
  expect(stored.activities).toEqual([])
  expect(stored.deletedActivities).toEqual([
    { schemaVersion: 1, id: activity.id, revision: 2, deletedAt: NOW + 1_000 },
  ])
  const downloadPromise = page.waitForEvent('download')
  await page
    .getByRole('button', { name: 'Exporter mes données', exact: true })
    .click()
  const download = await downloadPromise
  const file = await download.path()
  expect(file).not.toBeNull()
  expect(JSON.parse(await readFile(file!, 'utf8'))).toMatchObject({
    format: 'haki-backup',
    version: 2,
    activities: [],
    deletedActivities: stored.deletedActivities,
    session: null,
  })
  await page.reload()
  await expectTotal(page, 0)
  expect((await readJournal(page)).deletedActivities).toEqual(
    stored.deletedActivities,
  )
})

test('corrects a legacy guided completion and relocks its branch without losing a later activity', async ({
  page,
}) => {
  const root = await seedGuided(page, ROOT_ID, NOW - 10_800_000)
  const later = await seedGuided(page, STRENGTH_ID, NOW - 7_200_000)
  expect(root.reward.policyVersion).toBe(1)
  await navigate(page, 'Parcours Viking')
  await expect(
    page.getByRole('link', {
      name: 'Préparer La Garde du rempart',
      exact: true,
    }),
  ).toBeVisible()
  await page.goto(`/#historique/${root.id}`)
  await page
    .getByRole('link', { name: 'Modifier cette activité', exact: true })
    .click()
  await page
    .getByRole('spinbutton', { name: 'Durée réalisée (secondes)', exact: true })
    .first()
    .fill('0')
  await page
    .getByRole('textbox', { name: /^Notes/ })
    .fill('Premier bloc non réalisé')
  await saveChanges(page)
  await expect(
    page.getByRole('region', { name: 'XP enregistrée', exact: true }),
  ).toContainText('Séance partielle')
  const activities = (await readJournal(page)).activities
  const corrected = activities.find((item) => item.id === root.id)!
  expect(corrected).toMatchObject({
    revision: 2,
    session: root.session,
    result: { status: 'partial' },
    reward: { policyVersion: 1 },
  })
  expect(corrected.reward.totalXp).toBeLessThan(root.reward.totalXp)
  expect(activities.find((item) => item.id === later.id)).toEqual(later)
  expect(activities).toHaveLength(2)
  await navigate(page, 'Parcours Viking')
  await expect(
    page.getByRole('link', {
      name: 'Découvrir Le Socle de pierre',
      exact: true,
    }),
  ).toBeVisible()
  await expect(
    page.getByRole('link', {
      name: 'Découvrir La Garde du rempart',
      exact: true,
    }),
  ).toBeVisible()
  await expect(
    page.getByRole('link', {
      name: 'Préparer La Garde du rempart',
      exact: true,
    }),
  ).toHaveCount(0)
  await page.reload()
  await expect(
    page.getByRole('link', {
      name: 'Découvrir La Garde du rempart',
      exact: true,
    }),
  ).toBeVisible()
  expect(
    (await readJournal(page)).activities.find((item) => item.id === later.id),
  ).toEqual(later)
})

test('keeps a stale edit after focus refresh and refuses to overwrite another tab', async ({
  page,
  context,
}) => {
  const activity = await addManual(page)
  await page
    .getByRole('link', { name: 'Modifier cette activité', exact: true })
    .click()
  await page
    .getByRole('spinbutton', { name: 'Durée (minutes)', exact: true })
    .fill('20')
  await page
    .getByRole('textbox', { name: /^Notes/ })
    .fill('Saisie du premier onglet')
  const other = await context.newPage()
  await installJournalMocks(other)
  await other.goto(`/#activite/modifier/${activity.id}`)
  await other
    .getByRole('spinbutton', { name: 'Durée (minutes)', exact: true })
    .fill('5')
  await other
    .getByRole('textbox', { name: /^Notes/ })
    .fill('Correction du second onglet')
  await saveChanges(other)
  await page.bringToFront()
  await page.evaluate(() => window.dispatchEvent(new Event('focus')))
  await expect(
    page.getByRole('spinbutton', { name: 'Durée (minutes)', exact: true }),
  ).toHaveValue('20')
  await expect(page.getByRole('textbox', { name: /^Notes/ })).toHaveValue(
    'Saisie du premier onglet',
  )
  await page
    .getByRole('button', { name: 'Enregistrer les modifications', exact: true })
    .click()
  await expect(page.getByRole('alert')).toContainText(
    'Cette activité a été modifiée ou supprimée ailleurs.',
  )
  expect((await readJournal(page)).activities).toMatchObject([
    {
      id: activity.id,
      revision: 2,
      durationSeconds: 300,
      notes: 'Correction du second onglet',
      reward: { totalXp: 50 },
    },
  ])
  await expect(
    page.getByRole('button', {
      name: 'Enregistrer les modifications',
      exact: true,
    }),
  ).toBeDisabled()
  await page
    .getByRole('button', { name: 'Recharger l’activité', exact: true })
    .click()
  await expect(
    page.getByRole('spinbutton', { name: 'Durée (minutes)', exact: true }),
  ).toHaveValue('5')
  await expect(page.getByRole('textbox', { name: /^Notes/ })).toHaveValue(
    'Correction du second onglet',
  )
  await page
    .getByRole('spinbutton', { name: 'Durée (minutes)', exact: true })
    .fill('6')
  await saveChanges(page)
  expect((await readJournal(page)).activities).toMatchObject([
    {
      id: activity.id,
      revision: 3,
      durationSeconds: 360,
      reward: { totalXp: 60 },
    },
  ])
  await other.close()
})

test('uses local midnight and Monday boundaries across September and October', async ({
  page,
}) => {
  await addManual(page, {
    title: 'Dimanche tard',
    date: '2026-09-27T23:55',
    minutes: 10,
  })
  await navigate(page, 'Mon carnet')
  await addManual(page, {
    title: 'Lundi tôt',
    date: '2026-09-28T00:05',
    minutes: 20,
  })
  await navigate(page, 'Mon carnet')
  await expect(periodSummary(page, 'Cette semaine')).toContainText(
    '1 entraînement',
  )
  await expect(periodSummary(page, 'Cette semaine')).toContainText('20 min')
  await expect(periodSummary(page, 'Mois affiché')).toContainText(
    '2 entraînements',
  )
  await calendar(page)
    .getByRole('button', {
      name: 'dimanche 27 septembre 2026, 1 entraînement',
      exact: true,
    })
    .click()
  await expect(
    activityList(page).getByRole('heading', {
      name: 'Dimanche tard',
      exact: true,
    }),
  ).toBeVisible()
  await expect(
    activityList(page).getByRole('heading', { name: 'Lundi tôt', exact: true }),
  ).toHaveCount(0)
  await expect(
    calendar(page).getByRole('button', { name: 'Mois suivant', exact: true }),
  ).toBeDisabled()
  await page.clock.fastForward(3 * 24 * 60 * 60 * 1_000)
  await page.reload()
  await expect(
    calendar(page).getByLabel('Afficher le mois', { exact: true }),
  ).toHaveValue('2026-10')
  await addManual(page, {
    title: 'Fin septembre',
    date: '2026-09-30T23:55',
    minutes: 5,
  })
  await navigate(page, 'Mon carnet')
  await addManual(page, {
    title: 'Début octobre',
    date: '2026-10-01T00:05',
    minutes: 6,
  })
  await navigate(page, 'Mon carnet')
  await expect(periodSummary(page, 'Cette semaine')).toContainText(
    '3 entraînements',
  )
  await expect(periodSummary(page, 'Mois affiché')).toContainText(
    '1 entraînement',
  )
  await page.getByRole('button', { name: 'Mois affiché', exact: true }).click()
  await expect(
    activityList(page).getByRole('heading', {
      name: 'Début octobre',
      exact: true,
    }),
  ).toBeVisible()
  await expect(
    activityList(page).getByRole('heading', {
      name: 'Fin septembre',
      exact: true,
    }),
  ).toHaveCount(0)
  await calendar(page)
    .getByLabel('Afficher le mois', { exact: true })
    .fill('2026-09')
  await expect(periodSummary(page, 'Mois affiché')).toContainText(
    '3 entraînements',
  )
  await expect(
    activityList(page).getByRole('heading', {
      name: 'Fin septembre',
      exact: true,
    }),
  ).toBeVisible()
  await expect(
    activityList(page).getByRole('heading', {
      name: 'Début octobre',
      exact: true,
    }),
  ).toHaveCount(0)
  const records = (await readJournal(page)).activities
  expect(records.find((item) => item.title === 'Lundi tôt')?.occurredAt).toBe(
    Date.parse('2026-09-27T22:05:00Z'),
  )
  expect(
    records.find((item) => item.title === 'Début octobre')?.occurredAt,
  ).toBe(Date.parse('2026-09-30T22:05:00Z'))
})

test('preserves a manual form after a transaction failure and retries without duplicate XP', async ({
  page,
}) => {
  await startManual(page)
  await fillManual(page, { minutes: 18, notes: 'À conserver après une erreur' })
  await page.evaluate(() => {
    window.journalAbortWrite = true
  })
  await page
    .getByRole('button', { name: 'Enregistrer l’entraînement', exact: true })
    .click()
  await expect(page.getByRole('alert')).toContainText(
    'L’enregistrement n’a pas pu être confirmé.',
  )
  await expect(
    page.getByRole('spinbutton', { name: 'Durée (minutes)', exact: true }),
  ).toHaveValue('18')
  await expect(page.getByRole('textbox', { name: /^Notes/ })).toHaveValue(
    'À conserver après une erreur',
  )
  expect((await readJournal(page)).activities).toEqual([])
  await page.evaluate(() => {
    window.journalAbortWrite = false
  })
  const activity = await saveManual(page)
  expect(activity.reward.totalXp).toBe(180)
  expect((await readJournal(page)).activities).toEqual([activity])
})

test('does not let a delayed save redirect away from a newer form', async ({
  page,
}) => {
  await startManual(page)
  await fillManual(page, { title: 'Premier entraînement' })
  await page.evaluate(() => {
    window.journalHoldWrite = true
  })
  await page
    .getByRole('button', { name: 'Enregistrer l’entraînement', exact: true })
    .click()
  await expect
    .poll(() => page.evaluate(() => window.journalWriteStarted))
    .toBe(true)
  await navigate(page, 'Mon carnet')
  await expect(
    page.getByRole('heading', { name: 'Ajouter un entraînement', exact: true }),
  ).toHaveCount(0)
  // The pending write keeps history loading; a new activity link can still be opened directly.
  await page.evaluate(() => {
    window.location.hash = 'activite/nouvelle'
  })
  await expect(
    page.getByRole('heading', { name: 'Ajouter un entraînement', exact: true }),
  ).toBeVisible()
  await page
    .getByRole('textbox', { name: 'Entraînement', exact: true })
    .fill('Nouvelle saisie à préserver')
  await page.evaluate(() => {
    window.journalHoldWrite = false
  })
  await expect
    .poll(async () => (await readJournal(page)).activities.length)
    .toBe(1)
  await expect(page.locator('.progress-teaser')).toContainText('120 XP')
  await expect(page).toHaveURL(/#activite\/nouvelle$/)
  await expect(
    page.getByRole('textbox', { name: 'Entraînement', exact: true }),
  ).toHaveValue('Nouvelle saisie à préserver')
  expect((await readJournal(page)).activities).toMatchObject([
    { title: 'Premier entraînement', reward: { totalXp: 120 } },
  ])
})
