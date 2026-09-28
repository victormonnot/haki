import { expect, test, type Page } from '@playwright/test'
import { readFile } from 'node:fs/promises'

interface VariantFixture {
  id: string
  title: string
  requiredEquipment: string[]
  phases: {
    id: string
    title: string
    kind: string
    durationSeconds: number
    pathWeights?: Record<string, number>
  }[]
}

interface WorkoutFixture {
  id: string
  version: number
  title: string
  variants: VariantFixture[]
}

interface DraftFixture {
  id: string
  mode: string
  status: string
  elapsedMs: number
  updatedAt: number
  snapshot: {
    workoutId: string
    workoutVersion: number
    workoutTitle: string
    variant: VariantFixture
  }
}

interface ActivityFixture {
  id: string
  session: DraftFixture
  result: { status: string; performedSeconds: number }
  reward: {
    policyVersion: number
    totalXp: number
    pathXp: Record<string, number>
  }
}

const ROOT_ID = 'leveil-du-nord'
const STRENGTH_ID = 'le-socle-de-pierre'
const ENDURANCE_ID = 'le-souffle-du-fjord'
const GUARD_ID = 'la-garde-du-rempart'
const SIGNALS_ID = 'les-signaux-du-guetteur'
const FINAL_ID = 'la-traversee-du-nord'
const WORKOUT_IDS = [
  ROOT_ID,
  STRENGTH_ID,
  ENDURANCE_ID,
  GUARD_ID,
  SIGNALS_ID,
  FINAL_ID,
]

const TITLES: Record<string, string> = {
  [ROOT_ID]: 'L’Éveil du Nord',
  [STRENGTH_ID]: 'Le Socle de pierre',
  [ENDURANCE_ID]: 'Le Souffle du fjord',
  [GUARD_ID]: 'La Garde du rempart',
  [SIGNALS_ID]: 'Les Signaux du guetteur',
  [FINAL_ID]: 'La Traversée du Nord',
}

async function workoutFixture(page: Page, id: string): Promise<WorkoutFixture> {
  return page.evaluate(async (workoutId) => {
    const source = '/src/content/workouts.ts'
    const { getWorkout } = await import(source)
    return getWorkout(workoutId)
  }, id)
}

async function completedActivity(
  page: Page,
  id: string,
  partial = false,
): Promise<ActivityFixture> {
  return page.evaluate(
    async ({ workoutId, partlyConfirmed }) => {
      // Load through Vite in the browser, not through the NodeNext test runtime.
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
      const content = getWorkout(workoutId) as WorkoutFixture
      const variant = content.variants[0]
      const draft = createSessionDraft(
        content,
        variant,
        {
          environment: 'home',
          equipment: [...variant.requiredEquipment],
          availableMinutes: 30,
          experience: 'regular',
          smallSpace: false,
          quiet: false,
        },
        MOVEMENTS,
        'real',
        `path-${workoutId}-${partlyConfirmed ? 'partial' : 'complete'}`,
        Date.parse('2026-01-01T10:00:00Z'),
      )
      draft.status = 'completed'
      draft.elapsedMs = getSessionDuration(draft)
      draft.updatedAt = Date.parse('2026-01-01T11:00:00Z')
      const phases = variant.phases
        .filter((phase) => phase.kind !== 'rest')
        .map((phase, index) => ({
          phaseId: phase.id,
          performedSeconds: partlyConfirmed
            ? index === 0
              ? 1
              : 0
            : phase.durationSeconds,
        }))
      return createActivity(draft, phases, Date.parse('2026-01-01T12:00:00Z'))
    },
    { workoutId: id, partlyConfirmed: partial },
  )
}

async function seedActivities(page: Page, activities: ActivityFixture[]) {
  await page.evaluate(async (records) => {
    const database = await new Promise<IDBDatabase>((resolve, reject) => {
      const request = indexedDB.open('haki')
      request.onsuccess = () => resolve(request.result)
      request.onerror = () => reject(request.error)
    })
    try {
      await new Promise<void>((resolve, reject) => {
        const transaction = database.transaction('activities', 'readwrite')
        transaction.oncomplete = () => resolve()
        transaction.onabort = () => reject(transaction.error)
        const store = transaction.objectStore('activities')
        for (const record of records) store.add(record)
      })
    } finally {
      database.close()
    }
  }, activities)
}

async function refreshHistory(page: Page) {
  await page.evaluate(() => window.dispatchEvent(new Event('focus')))
}

async function completeCurrentSession(page: Page): Promise<string> {
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
          const record = current.result as {
            draft: DraftFixture
            revision: number
          }
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

async function readSavedState(
  page: Page,
): Promise<{ activities: ActivityFixture[]; draft: DraftFixture | null }> {
  return page.evaluate(async () => {
    const database = await new Promise<IDBDatabase>((resolve, reject) => {
      const request = indexedDB.open('haki')
      request.onsuccess = () => resolve(request.result)
      request.onerror = () => reject(request.error)
    })
    try {
      return await new Promise((resolve, reject) => {
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
            draft: current.result?.draft ?? null,
          })
      })
    } finally {
      database.close()
    }
  })
}

function prepareLink(page: Page, id: string) {
  return page.getByRole('link', {
    name: `Préparer ${TITLES[id]}`,
    exact: true,
  })
}

function discoverLink(page: Page, id: string) {
  return page.getByRole('link', {
    name: `Découvrir ${TITLES[id]}`,
    exact: true,
  })
}

async function navigateToPath(page: Page) {
  await page
    .getByRole('navigation', { name: 'Navigation principale', exact: true })
    .getByRole('link', { name: 'Parcours Viking', exact: true })
    .click()
  await expect(page).toHaveURL(/#parcours$/)
  await expect(
    page.getByRole('heading', { name: /^L’appel du Nord/ }),
  ).toBeVisible()
}

async function openReview(page: Page) {
  const review = page.getByRole('button', {
    name: 'Voir ma séance',
    exact: true,
  })
  const prepared = page.getByRole('heading', { name: /^Ta séance est prête/ })
  await expect(review.or(prepared)).toBeVisible()
  if (await review.isVisible()) await review.click()
  await expect(prepared).toBeVisible()
}

test.beforeEach(async ({ page }) => {
  await page.clock.install({ time: new Date('2026-01-01T12:00:00Z') })
  await page.clock.pauseAt(new Date('2026-01-01T12:00:01Z'))
  await page.addInitScript(() => {
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
  await page.goto('/#parcours')
  await expect(
    page.getByRole('heading', { name: /^L’appel du Nord/ }),
  ).toBeVisible()
  await expect(prepareLink(page, ROOT_ID)).toBeVisible()
})

test('shows six steps with one starting workout and fits a 390px screen', async ({
  page,
}) => {
  await page.setViewportSize({ width: 390, height: 844 })
  await expect(prepareLink(page, ROOT_ID)).toHaveAttribute(
    'href',
    `#preparation/${ROOT_ID}`,
  )
  for (const id of WORKOUT_IDS.slice(1)) {
    await expect(prepareLink(page, id)).toHaveCount(0)
    await expect(discoverLink(page, id)).toHaveAttribute(
      'href',
      `#preparation/${id}`,
    )
  }
  const width = await page.evaluate(() => ({
    content: document.documentElement.scrollWidth,
    viewport: window.innerWidth,
  }))
  expect(width.content).toBeLessThanOrEqual(width.viewport)
})

test('keeps a directly opened final workout locked and names both prerequisites', async ({
  page,
}) => {
  await page.goto(`/#preparation/${FINAL_ID}`)
  await expect(page.getByRole('heading', { level: 1 })).toContainText(
    TITLES[FINAL_ID],
  )
  await page
    .getByRole('combobox', { name: 'Temps disponible', exact: true })
    .selectOption('30')
  await openReview(page)
  const access = page.getByRole('complementary', {
    name: 'Accès à la séance',
    exact: true,
  })
  await expect(access).toContainText(TITLES[GUARD_ID])
  await expect(access).toContainText(TITLES[SIGNALS_ID])
  await expect(
    page.getByRole('button', { name: 'Ouvrir le lecteur', exact: true }),
  ).toBeDisabled()
  await expect(
    page.getByRole('button', { name: 'Essayer en accéléré', exact: true }),
  ).toBeDisabled()
  expect(await readSavedState(page)).toEqual({ activities: [], draft: null })
})

test('accepts a complete version-one activity and refreshes both unlocked branches', async ({
  page,
}) => {
  const historical = await completedActivity(page, ROOT_ID)
  expect(historical.session.snapshot.workoutVersion).toBe(1)
  expect(historical.result.status).toBe('completed')
  expect(historical.reward.policyVersion).toBe(1)
  await seedActivities(page, [historical])
  await refreshHistory(page)

  await expect(prepareLink(page, STRENGTH_ID)).toBeVisible()
  await expect(prepareLink(page, ENDURANCE_ID)).toBeVisible()
  await expect(
    page.getByRole('progressbar', { name: 'Étapes validées', exact: true }),
  ).toHaveAttribute('aria-valuenow', '1')
  await expect(discoverLink(page, GUARD_ID)).toBeVisible()
  await expect(discoverLink(page, SIGNALS_ID)).toBeVisible()
  await expect(discoverLink(page, FINAL_ID)).toBeVisible()
  await page.reload()
  await expect(prepareLink(page, STRENGTH_ID)).toBeVisible()
  await expect(prepareLink(page, ENDURANCE_ID)).toBeVisible()
  expect((await readSavedState(page)).activities).toEqual([historical])
})

test('keeps the next steps locked when a finished timer was only partly confirmed', async ({
  page,
}) => {
  const partial = await completedActivity(page, ROOT_ID, true)
  expect(partial.session.status).toBe('completed')
  expect(partial.result.status).toBe('partial')
  await seedActivities(page, [partial])
  await page.reload()
  await expect(prepareLink(page, ROOT_ID)).toBeVisible()

  await expect(discoverLink(page, STRENGTH_ID)).toBeVisible()
  await expect(discoverLink(page, ENDURANCE_ID)).toBeVisible()
  await expect(prepareLink(page, STRENGTH_ID)).toHaveCount(0)
  await expect(prepareLink(page, ENDURANCE_ID)).toHaveCount(0)
})

test('follows each branch and requires both branches before the final workout', async ({
  page,
}) => {
  await seedActivities(page, [
    await completedActivity(page, ROOT_ID),
    await completedActivity(page, STRENGTH_ID),
  ])
  await refreshHistory(page)
  await expect(prepareLink(page, GUARD_ID)).toBeVisible()
  await expect(discoverLink(page, SIGNALS_ID)).toBeVisible()
  await expect(discoverLink(page, FINAL_ID)).toBeVisible()

  await seedActivities(page, [
    await completedActivity(page, ENDURANCE_ID),
    await completedActivity(page, GUARD_ID),
  ])
  await refreshHistory(page)
  await expect(prepareLink(page, SIGNALS_ID)).toBeVisible()
  await expect(discoverLink(page, FINAL_ID)).toBeVisible()

  await seedActivities(page, [await completedActivity(page, SIGNALS_ID)])
  await refreshHistory(page)
  await expect(prepareLink(page, FINAL_ID)).toBeVisible()
})

test('opens the chosen workout in preview and saves its own real-session snapshot', async ({
  page,
}) => {
  await seedActivities(page, [await completedActivity(page, ROOT_ID)])
  await refreshHistory(page)
  const selected = await workoutFixture(page, STRENGTH_ID)
  const variant = selected.variants[0]

  await prepareLink(page, STRENGTH_ID).click()
  await expect(page).toHaveURL(new RegExp(`#preparation/${STRENGTH_ID}$`))
  await expect(page.getByRole('heading', { level: 1 })).toContainText(
    selected.title,
  )
  await openReview(page)
  await page
    .getByRole('button', { name: 'Essayer en accéléré', exact: true })
    .click()
  await expect(page.getByRole('heading', { level: 1 })).toContainText(
    selected.title,
  )
  await expect(page.getByText(/Mode aperçu/)).toBeVisible()
  await page
    .getByRole('button', { name: 'Démarrer l’aperçu', exact: true })
    .click()
  await page.clock.runFor(5_000)
  await expect(
    page.getByRole('heading', { name: variant.phases[1].title, exact: true }),
  ).toBeVisible()
  expect((await readSavedState(page)).draft).toBeNull()

  await page.getByRole('link', { name: 'Ma préparation', exact: true }).click()
  await expect(page).toHaveURL(new RegExp(`#preparation/${STRENGTH_ID}$`))
  await openReview(page)
  await page
    .getByRole('link', { name: 'Tester le guide audio', exact: true })
    .click()
  await page
    .getByRole('link', { name: 'Préparer ma séance Viking', exact: true })
    .click()
  await expect(page).toHaveURL(new RegExp(`#preparation/${STRENGTH_ID}$`))
  await openReview(page)
  await page
    .getByRole('button', { name: 'Ouvrir le lecteur', exact: true })
    .click()
  await expect(
    page.getByRole('button', { name: 'Démarrer la séance', exact: true }),
  ).toBeVisible()
  expect((await readSavedState(page)).draft).toMatchObject({
    mode: 'real',
    status: 'paused',
    snapshot: {
      workoutId: selected.id,
      workoutVersion: selected.version,
      workoutTitle: selected.title,
      variant,
    },
  })
  await page.reload()
  await expect(page.getByRole('heading', { level: 1 })).toContainText(
    selected.title,
  )
  expect((await readSavedState(page)).activities).toHaveLength(1)
})

test('rechecks prerequisites at launch when another tab removed a completion', async ({
  page,
}) => {
  const historical = await completedActivity(page, ROOT_ID)
  await seedActivities(page, [historical])
  await refreshHistory(page)
  await prepareLink(page, STRENGTH_ID).click()
  await openReview(page)
  const launch = page.getByRole('button', {
    name: 'Ouvrir le lecteur',
    exact: true,
  })
  await expect(launch).toBeEnabled()
  await page.evaluate(async (activityId) => {
    const database = await new Promise<IDBDatabase>((resolve, reject) => {
      const request = indexedDB.open('haki')
      request.onsuccess = () => resolve(request.result)
      request.onerror = () => reject(request.error)
    })
    try {
      await new Promise<void>((resolve, reject) => {
        const transaction = database.transaction('activities', 'readwrite')
        transaction.objectStore('activities').delete(activityId)
        transaction.oncomplete = () => resolve()
        transaction.onabort = () => reject(transaction.error)
      })
    } finally {
      database.close()
    }
  }, historical.id)

  // Keep the rendered access state stale: the launch itself must reload storage.
  await launch.click()
  await expect(page.getByRole('alert')).toContainText(
    'Cette séance est encore verrouillée.',
  )
  await expect(page).toHaveURL(new RegExp(`#preparation/${STRENGTH_ID}$`))
  expect(await readSavedState(page)).toEqual({ activities: [], draft: null })
})

test('records a new workout with phase-based XP and preserves it in the export', async ({
  page,
}) => {
  const historical = await completedActivity(page, ROOT_ID)
  await seedActivities(page, [historical])
  await refreshHistory(page)
  await prepareLink(page, STRENGTH_ID).click()
  await openReview(page)
  await page
    .getByRole('button', { name: 'Ouvrir le lecteur', exact: true })
    .click()
  await expect(
    page.getByRole('button', { name: 'Démarrer la séance', exact: true }),
  ).toBeVisible()
  const sessionId = await completeCurrentSession(page)
  await page
    .getByRole('link', { name: 'Confirmer mon réalisé', exact: true })
    .click()
  await page
    .getByRole('button', {
      name: 'Confirmer tous les blocs chronométrés',
      exact: true,
    })
    .click()
  await page
    .getByRole('button', { name: 'Confirmer et enregistrer', exact: true })
    .click()
  await expect(page).toHaveURL(new RegExp(`#historique/${sessionId}$`))
  await expect(
    page.getByRole('region', { name: 'XP enregistrée', exact: true }),
  ).toBeVisible()

  const stored = await readSavedState(page)
  expect(stored.draft).toBeNull()
  expect(stored.activities).toHaveLength(2)
  const activity = stored.activities.find((item) => item.id === sessionId)!
  expect(activity).toMatchObject({
    session: { snapshot: { workoutId: STRENGTH_ID } },
    result: { status: 'completed' },
    reward: { policyVersion: 2 },
  })
  expect(activity.reward.totalXp).toBeGreaterThan(0)
  expect(
    Object.values(activity.reward.pathXp).reduce(
      (sum, value) => sum + value,
      0,
    ),
  ).toBe(activity.reward.totalXp)
  expect(
    activity.session.snapshot.variant.phases
      .filter((phase) => phase.kind !== 'rest')
      .every((phase) => phase.pathWeights !== undefined),
  ).toBe(true)
  await navigateToPath(page)
  await expect(prepareLink(page, GUARD_ID)).toBeVisible()
  await page
    .getByRole('navigation', { name: 'Navigation principale', exact: true })
    .getByRole('link', { name: 'Mon carnet', exact: true })
    .click()
  const downloadPromise = page.waitForEvent('download')
  await page
    .getByRole('button', { name: 'Exporter mes données', exact: true })
    .click()
  const download = await downloadPromise
  const file = await download.path()
  expect(file).not.toBeNull()
  const backup = JSON.parse(await readFile(file!, 'utf8'))
  expect(backup).toMatchObject({
    format: 'haki-backup',
    version: 2,
    session: null,
  })
  expect(backup.activities).toHaveLength(2)
  expect(
    backup.activities.find((item: ActivityFixture) => item.id === sessionId),
  ).toEqual(activity)
  expect(
    backup.activities.find(
      (item: ActivityFixture) => item.id === historical.id,
    ),
  ).toEqual(historical)
})

test('never unlocks another workout after completing an accelerated preview', async ({
  page,
}) => {
  await prepareLink(page, ROOT_ID).click()
  await openReview(page)
  await page
    .getByRole('button', { name: 'Essayer en accéléré', exact: true })
    .click()
  await page
    .getByRole('button', { name: 'Démarrer l’aperçu', exact: true })
    .click()
  const root = await workoutFixture(page, ROOT_ID)
  const phaseCount = root.variants.find(
    (variant) => variant.id === 'fondations',
  )!.phases.length
  await page.clock.runFor(phaseCount * 5_000)
  await expect(
    page.getByRole('heading', { name: 'Minuteur terminé.', exact: true }),
  ).toBeVisible()
  await navigateToPath(page)
  await expect(discoverLink(page, STRENGTH_ID)).toBeVisible()
  await expect(discoverLink(page, ENDURANCE_ID)).toBeVisible()
  expect(await readSavedState(page)).toEqual({ activities: [], draft: null })
})
