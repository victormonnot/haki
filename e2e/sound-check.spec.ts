import { expect, test } from '@playwright/test'

interface SpeechMockState {
  announcements: { text: string; lang: string; voiceName: string | null }[]
  cancelCount: number
  failure: SpeechSynthesisErrorCode | null
  voices: Pick<SpeechSynthesisVoice, 'name' | 'lang' | 'localService'>[]
}

declare global {
  interface Window {
    speechMock: SpeechMockState
  }
}

test.beforeEach(async ({ page }) => {
  await page.clock.install({ time: new Date('2026-01-01T12:00:00Z') })
  await page.clock.pauseAt(new Date('2026-01-01T12:00:01Z'))

  await page.addInitScript(() => {
    window.speechMock = {
      announcements: [],
      cancelCount: 0,
      failure: null,
      voices: [
        { name: 'Français réseau', lang: 'fr-FR', localService: false },
        { name: 'Français Canada local', lang: 'fr-CA', localService: true },
        { name: 'Français France local', lang: 'fr-FR', localService: true },
      ],
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
      getVoices: () => window.speechMock.voices,
      cancel: () => {
        window.speechMock.cancelCount += 1
      },
      speak: (utterance: MockUtterance) => {
        window.speechMock.announcements.push({
          text: utterance.text,
          lang: utterance.lang,
          voiceName: utterance.voice?.name ?? null,
        })
        const failure = window.speechMock.failure
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

  await page.goto('/#guide')
})

test('runs the three phases and finishes after sixty active seconds', async ({
  page,
}) => {
  await page
    .getByRole('button', { name: 'Lancer le test audio', exact: true })
    .click()
  await expect(
    page.getByRole('button', { name: 'Mettre en pause', exact: true }),
  ).toBeVisible()
  await expect
    .poll(() => page.evaluate(() => window.speechMock.announcements.length))
    .toBe(1)
  expect(
    await page.evaluate(() => window.speechMock.announcements[0]),
  ).toMatchObject({
    lang: 'fr-FR',
    voiceName: 'Français France local',
  })

  await page.clock.fastForward(10_000)
  await expect
    .poll(() => page.evaluate(() => window.speechMock.announcements.length))
    .toBe(2)
  await page.clock.fastForward(35_000)
  await expect
    .poll(() => page.evaluate(() => window.speechMock.announcements.length))
    .toBe(3)
  await page.clock.fastForward(14_000)
  await expect(
    page.getByRole('button', { name: 'Mettre en pause', exact: true }),
  ).toBeVisible()
  await page.clock.fastForward(1_000)
  await expect(
    page.getByRole('button', { name: 'Refaire le test', exact: true }),
  ).toBeVisible()
})

test('excludes paused time and resumes only after an explicit action', async ({
  page,
}) => {
  await page
    .getByRole('button', { name: 'Lancer le test audio', exact: true })
    .click()
  await page.clock.fastForward(5_000)
  await page
    .getByRole('button', { name: 'Mettre en pause', exact: true })
    .click()

  const announcementsBeforePause = await page.evaluate(
    () => window.speechMock.announcements.length,
  )
  await page.clock.fastForward(120_000)
  await expect(
    page.getByRole('button', { name: 'Reprendre le test', exact: true }),
  ).toBeVisible()
  expect(
    await page.evaluate(() => window.speechMock.announcements.length),
  ).toBe(announcementsBeforePause)

  await page
    .getByRole('button', { name: 'Reprendre le test', exact: true })
    .click()
  await page.clock.fastForward(54_000)
  await expect(
    page.getByRole('button', { name: 'Mettre en pause', exact: true }),
  ).toBeVisible()
  await page.clock.fastForward(1_000)
  await expect(
    page.getByRole('button', { name: 'Refaire le test', exact: true }),
  ).toBeVisible()
})

test('resets the timer and cancels the current announcement', async ({
  page,
}) => {
  await page
    .getByRole('button', { name: 'Lancer le test audio', exact: true })
    .click()
  await page.clock.fastForward(12_000)
  const cancellations = await page.evaluate(() => window.speechMock.cancelCount)

  await page.getByRole('button', { name: 'Réinitialiser', exact: true }).click()
  await expect(
    page.getByRole('button', { name: 'Lancer le test audio', exact: true }),
  ).toBeVisible()
  expect(
    await page.evaluate(() => window.speechMock.cancelCount),
  ).toBeGreaterThan(cancellations)
  await page.clock.fastForward(60_000)
  await expect(
    page.getByRole('button', { name: 'Lancer le test audio', exact: true }),
  ).toBeVisible()

  await page
    .getByRole('button', { name: 'Lancer le test audio', exact: true })
    .click()
  await page.clock.fastForward(59_000)
  await expect(
    page.getByRole('button', { name: 'Mettre en pause', exact: true }),
  ).toBeVisible()
  await page.clock.fastForward(1_000)
  await expect(
    page.getByRole('button', { name: 'Refaire le test', exact: true }),
  ).toBeVisible()
})

test('pauses when the page becomes hidden and does not resume on return', async ({
  page,
}) => {
  await page
    .getByRole('button', { name: 'Lancer le test audio', exact: true })
    .click()
  await page.clock.fastForward(4_000)
  const cancellations = await page.evaluate(() => window.speechMock.cancelCount)

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
    page.getByText('Le test s’est mis en pause quand tu as quitté HAKI.'),
  ).toBeVisible()
  await expect(
    page.getByRole('button', { name: 'Reprendre le test', exact: true }),
  ).toBeVisible()
  expect(
    await page.evaluate(() => window.speechMock.cancelCount),
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
    page.getByRole('button', { name: 'Reprendre le test', exact: true }),
  ).toBeVisible()
  await page
    .getByRole('button', { name: 'Reprendre le test', exact: true })
    .click()
  await page.clock.fastForward(55_000)
  await expect(
    page.getByRole('button', { name: 'Mettre en pause', exact: true }),
  ).toBeVisible()
  await page.clock.fastForward(1_000)
  await expect(
    page.getByRole('button', { name: 'Refaire le test', exact: true }),
  ).toBeVisible()
})

test('shows a speech failure while the timer continues', async ({ page }) => {
  await page.evaluate(() => {
    window.speechMock.failure = 'synthesis-failed'
  })
  await page
    .getByRole('button', { name: 'Lancer le test audio', exact: true })
    .click()
  await expect(
    page.getByText(
      'Le guidage vocal est indisponible pour le moment. Réessaie.',
    ),
  ).toBeVisible()
  await expect(
    page.getByRole('button', { name: 'Mettre en pause', exact: true }),
  ).toBeVisible()
  await page.clock.fastForward(60_000)
  await expect(
    page.getByRole('button', { name: 'Refaire le test', exact: true }),
  ).toBeVisible()
})

test('can run with the voice muted', async ({ page }) => {
  await page
    .getByRole('button', { name: 'Couper la voix', exact: true })
    .click()
  await expect(
    page.getByRole('button', { name: 'Activer la voix', exact: true }),
  ).toBeVisible()
  await page
    .getByRole('button', { name: 'Lancer le test audio', exact: true })
    .click()
  await page.clock.fastForward(60_000)
  await expect(
    page.getByRole('button', { name: 'Refaire le test', exact: true }),
  ).toBeVisible()
  expect(await page.evaluate(() => window.speechMock.announcements)).toEqual([])
})

test('does not replay the current announcement when voices change', async ({
  page,
}) => {
  await page
    .getByRole('button', { name: 'Lancer le test audio', exact: true })
    .click()
  await expect
    .poll(() => page.evaluate(() => window.speechMock.announcements.length))
    .toBe(1)
  await page.evaluate(() => {
    window.speechMock.voices = [
      {
        name: 'Nouvelle voix française',
        lang: 'fr-FR',
        localService: true,
      },
    ]
    window.speechSynthesis.dispatchEvent(new Event('voiceschanged'))
  })
  await page.clock.fastForward(5_000)
  expect(
    await page.evaluate(() => window.speechMock.announcements.length),
  ).toBe(1)
})

test('cancels a running audio check when navigating away', async ({ page }) => {
  await page
    .getByRole('button', { name: 'Lancer le test audio', exact: true })
    .click()
  await expect
    .poll(() => page.evaluate(() => window.speechMock.announcements.length))
    .toBe(1)
  const cancellations = await page.evaluate(() => window.speechMock.cancelCount)

  await page
    .getByRole('link', { name: 'Préparer une séance', exact: true })
    .click()
  await expect(
    page.getByRole('button', { name: 'Voir ma séance', exact: true }),
  ).toBeVisible()
  expect(
    await page.evaluate(() => window.speechMock.cancelCount),
  ).toBeGreaterThan(cancellations)
  await page.clock.fastForward(60_000)
  expect(
    await page.evaluate(() => window.speechMock.announcements.length),
  ).toBe(1)

  await page.getByRole('link', { name: 'Tester le guide', exact: true }).click()
  await expect(
    page.getByRole('button', { name: 'Lancer le test audio', exact: true }),
  ).toBeVisible()
})
