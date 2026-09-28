import { expect, test, type Page } from '@playwright/test'

interface StoredDraft {
  mode: string
  status: string
  elapsedMs: number
}

interface PlayerSpeechMock {
  announcements: string[]
  cancelCount: number
  failure: SpeechSynthesisErrorCode | null
}

declare global {
  interface Window {
    playerSpeechMock: PlayerSpeechMock
    rejectPlayerWrites: boolean
  }
}

async function installPlayerMocks(page: Page) {
  await page.clock.install({ time: new Date('2026-01-01T12:00:00Z') })
  await page.clock.pauseAt(new Date('2026-01-01T12:00:01Z'))
  await page.addInitScript(() => {
    Object.defineProperty(window.crypto, 'randomUUID', {
      configurable: true,
      value: undefined,
    })
    window.playerSpeechMock = {
      announcements: [],
      cancelCount: 0,
      failure: null,
    }
    window.rejectPlayerWrites = false
    const transaction = IDBDatabase.prototype.transaction
    IDBDatabase.prototype.transaction = function (storeNames, mode, options) {
      const names =
        typeof storeNames === 'string' ? [storeNames] : Array.from(storeNames)
      if (
        window.rejectPlayerWrites &&
        mode === 'readwrite' &&
        names.includes('session-drafts')
      ) {
        throw new DOMException(
          'Simulated storage failure',
          'QuotaExceededError',
        )
      }
      return transaction.call(this, storeNames, mode, options)
    }

    class MockUtterance {
      text: string
      lang = ''
      voice: SpeechSynthesisVoice | null = null
      rate = 1
      onend: ((event: Event) => void) | null = null
      onerror: ((event: { error: SpeechSynthesisErrorCode }) => void) | null =
        null

      constructor(text: string) {
        this.text = text
      }
    }

    const synthesis = Object.assign(new EventTarget(), {
      getVoices: () => [
        { name: 'Voix française simulée', lang: 'fr-FR', localService: true },
      ],
      cancel: () => {
        window.playerSpeechMock.cancelCount += 1
      },
      speak: (utterance: MockUtterance) => {
        window.playerSpeechMock.announcements.push(utterance.text)
        const failure = window.playerSpeechMock.failure
        if (failure)
          queueMicrotask(() => utterance.onerror?.({ error: failure }))
      },
    })
    Object.defineProperty(window, 'speechSynthesis', {
      configurable: true,
      value: synthesis,
    })
    Object.defineProperty(window, 'SpeechSynthesisUtterance', {
      configurable: true,
      value: MockUtterance,
    })
  })
}

test.beforeEach(async ({ page }) => {
  await installPlayerMocks(page)
  await page.goto('/')
  await page
    .getByRole('button', { name: 'Voir ma séance', exact: true })
    .click()
})

async function readStoredDraft(page: Page): Promise<StoredDraft | null> {
  return page.evaluate(async () => {
    const database = await new Promise<IDBDatabase>((resolve, reject) => {
      const request = indexedDB.open('haki')
      request.onsuccess = () => resolve(request.result)
      request.onerror = () => reject(request.error)
    })
    try {
      if (!database.objectStoreNames.contains('session-drafts')) return null
      return await new Promise<StoredDraft | null>((resolve, reject) => {
        const request = database
          .transaction('session-drafts', 'readonly')
          .objectStore('session-drafts')
          .get('current')
        request.onsuccess = () => resolve(request.result?.draft ?? null)
        request.onerror = () => reject(request.error)
      })
    } finally {
      database.close()
    }
  })
}

async function openDemo(page: Page) {
  await page
    .getByRole('button', { name: 'Essayer en accéléré', exact: true })
    .click()
  await expect(page).toHaveURL(/#session$/)
  await expect(
    page.getByRole('button', { name: 'Démarrer l’aperçu', exact: true }),
  ).toBeVisible()
}

async function openRealSession(page: Page) {
  await page
    .getByRole('button', { name: 'Ouvrir le lecteur', exact: true })
    .click()
  await expect(page).toHaveURL(/#session$/)
  await expect(
    page.getByRole('button', { name: 'Démarrer la séance', exact: true }),
  ).toBeVisible()
  await expect
    .poll(() => readStoredDraft(page))
    .toMatchObject({ mode: 'real', status: 'paused', elapsedMs: 0 })
}

test('previews every phase without persisting a session', async ({ page }) => {
  await openDemo(page)
  const timer = page.getByRole('timer', {
    name: 'Temps restant dans l’étape',
    exact: true,
  })
  await expect(timer).toHaveText('00:05')
  expect(
    await page.evaluate(() => window.playerSpeechMock.announcements),
  ).toEqual([])
  await page
    .getByRole('button', { name: 'Démarrer l’aperçu', exact: true })
    .click()
  await expect
    .poll(() =>
      page.evaluate(() => window.playerSpeechMock.announcements.length),
    )
    .toBe(1)
  await page.clock.runFor(5_000)
  await expect(
    page.getByRole('heading', { name: 'Délier les épaules', exact: true }),
  ).toBeVisible()

  for (let phase = 1; phase < 13; phase += 1) {
    await page.clock.runFor(5_000)
    await expect
      .poll(() =>
        page.evaluate(() => window.playerSpeechMock.announcements.length),
      )
      .toBe(phase + 2)
  }
  await expect(
    page.getByRole('heading', { name: 'Minuteur terminé.', exact: true }),
  ).toBeVisible()
  await expect(
    page.getByRole('timer', { name: 'Temps chronométré', exact: true }),
  ).toHaveText('01:05')
  expect(await readStoredDraft(page)).toBeNull()

  await page.reload()
  await expect(
    page.getByRole('heading', { name: 'Ton prochain départ.', exact: true }),
  ).toBeVisible()
  expect(await readStoredDraft(page)).toBeNull()
})

test('excludes paused time and resumes the same phase', async ({ page }) => {
  await openDemo(page)
  await page
    .getByRole('button', { name: 'Démarrer l’aperçu', exact: true })
    .click()
  await page.clock.runFor(2_300)
  const cancellations = await page.evaluate(
    () => window.playerSpeechMock.cancelCount,
  )
  await page
    .getByRole('button', { name: 'Mettre en pause', exact: true })
    .click()
  const timer = page.getByRole('timer', {
    name: 'Temps restant dans l’étape',
    exact: true,
  })
  await expect(timer).toHaveText('00:03')
  expect(
    await page.evaluate(() => window.playerSpeechMock.cancelCount),
  ).toBeGreaterThan(cancellations)
  await page.clock.fastForward(60_000)
  await expect(timer).toHaveText('00:03')
  await page
    .getByRole('button', { name: 'Reprendre la séance', exact: true })
    .click()
  await page.clock.runFor(2_700)
  await expect(
    page.getByRole('heading', { name: 'Délier les épaules', exact: true }),
  ).toBeVisible()
  await expect(timer).toHaveText('00:05')
})

test('continues visually after a voice error and can mute further announcements', async ({
  page,
}) => {
  await openDemo(page)
  await page.evaluate(() => {
    window.playerSpeechMock.failure = 'not-allowed'
  })
  await page
    .getByRole('button', { name: 'Démarrer l’aperçu', exact: true })
    .click()
  await expect(page.getByRole('alert')).toHaveText(
    'Mets en pause, puis reprends pour réessayer la voix.',
  )
  await expect(
    page.getByRole('button', { name: 'Mettre en pause', exact: true }),
  ).toBeVisible()
  await page.getByRole('button', { name: 'Voix activée', exact: true }).click()
  await expect(
    page.getByRole('button', { name: 'Voix désactivée', exact: true }),
  ).toBeVisible()
  await page.clock.runFor(5_000)
  await expect(
    page.getByRole('heading', { name: 'Délier les épaules', exact: true }),
  ).toBeVisible()
  expect(
    await page.evaluate(() => window.playerSpeechMock.announcements.length),
  ).toBe(1)
})

test('pauses when hidden and waits for an explicit resume after return', async ({
  page,
}) => {
  await openDemo(page)
  await page
    .getByRole('button', { name: 'Démarrer l’aperçu', exact: true })
    .click()
  await page.clock.runFor(2_000)
  const cancellations = await page.evaluate(
    () => window.playerSpeechMock.cancelCount,
  )
  await page.evaluate(() => {
    Object.defineProperty(document, 'visibilityState', {
      configurable: true,
      value: 'hidden',
    })
    Object.defineProperty(document, 'hidden', {
      configurable: true,
      value: true,
    })
    document.dispatchEvent(new Event('visibilitychange'))
  })
  await expect(
    page.getByRole('button', { name: 'Reprendre la séance', exact: true }),
  ).toBeVisible()
  expect(
    await page.evaluate(() => window.playerSpeechMock.cancelCount),
  ).toBeGreaterThan(cancellations)
  await page.clock.fastForward(120_000)
  await page.evaluate(() => {
    Object.defineProperty(document, 'visibilityState', {
      configurable: true,
      value: 'visible',
    })
    Object.defineProperty(document, 'hidden', {
      configurable: true,
      value: false,
    })
    document.dispatchEvent(new Event('visibilitychange'))
  })
  await page.clock.fastForward(60_000)
  await expect(
    page.getByRole('timer', {
      name: 'Temps restant dans l’étape',
      exact: true,
    }),
  ).toHaveText('00:03')
  await expect(
    page.getByRole('button', { name: 'Reprendre la séance', exact: true }),
  ).toBeVisible()
})

test('does not count a long suspension without a visibility event', async ({
  page,
}) => {
  await openDemo(page)
  await page
    .getByRole('button', { name: 'Démarrer l’aperçu', exact: true })
    .click()
  await page.clock.runFor(2_000)
  await page.clock.fastForward(60_000)
  await expect(
    page.getByRole('button', { name: 'Reprendre la séance', exact: true }),
  ).toBeVisible()
  await expect(
    page.getByRole('timer', {
      name: 'Temps restant dans l’étape',
      exact: true,
    }),
  ).toHaveText('00:03')
  expect(
    await page.evaluate(() => window.playerSpeechMock.announcements.length),
  ).toBe(1)
})

test('checkpoints a real session and reloads paused without speaking', async ({
  page,
}) => {
  await openRealSession(page)
  await page
    .getByRole('button', { name: 'Démarrer la séance', exact: true })
    .click()
  expect(
    await page.evaluate(() => window.playerSpeechMock.announcements[0]),
  ).toContain('Marche sur place')
  await page.clock.runFor(12_000)
  await expect
    .poll(() => readStoredDraft(page))
    .toMatchObject({ mode: 'real', status: 'running', elapsedMs: 12_000 })
  await page.reload()
  const timer = page.getByRole('timer', {
    name: 'Temps restant dans l’étape',
    exact: true,
  })
  await expect(
    page.getByRole('button', { name: 'Reprendre la séance', exact: true }),
  ).toBeVisible()
  await expect(timer).toHaveText('02:48')
  expect(
    await page.evaluate(() => window.playerSpeechMock.announcements),
  ).toEqual([])
  await page.clock.fastForward(60_000)
  await expect(timer).toHaveText('02:48')
  await page
    .getByRole('button', { name: 'Reprendre la séance', exact: true })
    .click()
  await page.clock.runFor(1_000)
  await expect(timer).toHaveText('02:47')
})

test('keeps the real checkpoint when opening and reloading a demo', async ({
  page,
}) => {
  await openRealSession(page)
  const saved = await readStoredDraft(page)
  await page.getByRole('link', { name: 'Ma préparation', exact: true }).click()
  await openDemo(page)
  await page
    .getByRole('button', { name: 'Démarrer l’aperçu', exact: true })
    .click()
  await page.clock.runFor(5_000)
  expect(await readStoredDraft(page)).toEqual(saved)
  await page.reload()
  await expect(
    page.getByRole('button', { name: 'Démarrer la séance', exact: true }),
  ).toBeVisible()
  await expect(
    page.getByRole('timer', {
      name: 'Temps restant dans l’étape',
      exact: true,
    }),
  ).toHaveText('03:00')
  await expect(page.getByText(/Mode aperçu/)).toHaveCount(0)
  expect(await readStoredDraft(page)).toEqual(saved)
})

test('pauses on navigation and can stop while preserving the measured time', async ({
  page,
}) => {
  await openRealSession(page)
  await page
    .getByRole('button', { name: 'Démarrer la séance', exact: true })
    .click()
  await page.clock.runFor(3_000)
  const cancellations = await page.evaluate(
    () => window.playerSpeechMock.cancelCount,
  )
  await page.getByRole('link', { name: 'Ma préparation', exact: true }).click()
  // hashchange is asynchronous; wait for its pause before advancing the fake clock.
  await expect
    .poll(() => page.evaluate(() => window.playerSpeechMock.cancelCount))
    .toBeGreaterThan(cancellations)
  await page.clock.fastForward(60_000)
  await page.getByRole('link', { name: /Retrouver ma séance/ }).click()
  await expect(
    page.getByRole('timer', {
      name: 'Temps restant dans l’étape',
      exact: true,
    }),
  ).toHaveText('02:57')
  await expect(
    page.getByRole('button', { name: 'Reprendre la séance', exact: true }),
  ).toBeVisible()
  await page.getByRole('button', { name: 'Arrêter', exact: true }).click()
  await expect(
    page.getByRole('dialog', { name: 'Arrêter cette séance ?', exact: true }),
  ).toBeVisible()
  await page.getByRole('button', { name: 'Annuler', exact: true }).click()
  await expect(
    page.getByRole('button', { name: 'Reprendre la séance', exact: true }),
  ).toBeVisible()
  await page.getByRole('button', { name: 'Arrêter', exact: true }).click()
  await page
    .getByRole('button', { name: 'Arrêter et conserver', exact: true })
    .click()
  await expect(
    page.getByRole('heading', { name: 'Séance arrêtée.', exact: true }),
  ).toBeVisible()
  await expect(
    page.getByRole('timer', { name: 'Temps chronométré', exact: true }),
  ).toHaveText('00:03')
  await expect
    .poll(() => readStoredDraft(page))
    .toMatchObject({ status: 'stopped', elapsedMs: 3_000 })
  await page.reload()
  await expect(
    page.getByRole('heading', { name: 'Séance arrêtée.', exact: true }),
  ).toBeVisible()
  await expect(
    page.getByRole('button', { name: 'Reprendre la séance', exact: true }),
  ).toHaveCount(0)
})

test('pauses on a failed checkpoint and allows retry without losing the draft', async ({
  page,
}) => {
  await openRealSession(page)
  await page.evaluate(() => {
    window.rejectPlayerWrites = true
  })
  await page
    .getByRole('button', { name: 'Démarrer la séance', exact: true })
    .click()
  await expect(page.getByRole('alert')).toHaveText(
    'Le point de reprise n’a pas pu être enregistré. La séance est en pause : réessaie avant de continuer.',
  )
  await expect(
    page.getByRole('button', { name: 'Démarrer la séance', exact: true }),
  ).toBeDisabled()
  await page.clock.fastForward(60_000)
  await expect(
    page.getByRole('timer', {
      name: 'Temps restant dans l’étape',
      exact: true,
    }),
  ).toHaveText('03:00')
  expect(await readStoredDraft(page)).toMatchObject({
    mode: 'real',
    status: 'paused',
    elapsedMs: 0,
  })

  await page.evaluate(() => {
    window.rejectPlayerWrites = false
  })
  await page
    .getByRole('button', { name: 'Réessayer la sauvegarde', exact: true })
    .click()
  await expect(page.getByRole('alert')).toHaveCount(0)
  await expect(
    page.getByRole('button', { name: 'Démarrer la séance', exact: true }),
  ).toBeEnabled()
  await page
    .getByRole('button', { name: 'Démarrer la séance', exact: true })
    .click()
  await page.clock.runFor(2_000)
  await expect
    .poll(() => readStoredDraft(page))
    .toMatchObject({ status: 'running', elapsedMs: 2_000 })
})

test('rejects a stale tab instead of overwriting a newer checkpoint', async ({
  page,
  context,
}) => {
  await openRealSession(page)
  const other = await context.newPage()
  try {
    await installPlayerMocks(other)
    await other.goto('/#session')
    await expect(
      other.getByRole('button', { name: 'Démarrer la séance', exact: true }),
    ).toBeVisible()
    await page
      .getByRole('button', { name: 'Démarrer la séance', exact: true })
      .click()
    await page.clock.runFor(1_000)
    await expect
      .poll(() => readStoredDraft(page))
      .toMatchObject({ status: 'running', elapsedMs: 1_000 })

    await other
      .getByRole('button', { name: 'Démarrer la séance', exact: true })
      .click()
    await expect(other.getByRole('alert')).toHaveText(
      'Cette séance a changé dans un autre onglet. Charge le dernier point enregistré pour continuer.',
    )
    expect(await readStoredDraft(other)).toMatchObject({ elapsedMs: 1_000 })
    await other
      .getByRole('button', { name: 'Charger le dernier point', exact: true })
      .click()
    await expect(other.getByRole('alert')).toHaveCount(0)
    await expect(
      other.getByRole('button', { name: 'Reprendre la séance', exact: true }),
    ).toBeVisible()
    await expect(
      other.getByRole('timer', {
        name: 'Temps restant dans l’étape',
        exact: true,
      }),
    ).toHaveText('02:59')
  } finally {
    await other.close()
  }
})
