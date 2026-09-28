import { useCallback, useEffect, useRef, useState } from 'react'

function preferredFrenchVoice(voices: SpeechSynthesisVoice[]) {
  const frenchVoices = voices.filter((voice) =>
    /^fr(?:[-_]|$)/i.test(voice.lang),
  )
  const fromFrance = (voice: SpeechSynthesisVoice) =>
    /^fr[-_]fr$/i.test(voice.lang)

  return (
    frenchVoices.find((voice) => voice.localService && fromFrance(voice)) ??
    frenchVoices.find((voice) => voice.localService) ??
    frenchVoices.find(fromFrance) ??
    frenchVoices[0] ??
    null
  )
}

function speechErrorMessage(error: SpeechSynthesisErrorCode) {
  switch (error) {
    case 'not-allowed':
      return 'Mets en pause, puis reprends pour réessayer la voix.'
    case 'audio-busy':
    case 'audio-hardware':
      return 'Le son est indisponible. Vérifie la sortie audio, puis réessaie.'
    case 'language-unavailable':
    case 'voice-unavailable':
      return 'La voix française est indisponible sur cet appareil.'
    case 'network':
      return 'Cette voix a besoin d’une connexion. Vérifie ton réseau, puis réessaie.'
    default:
      return 'Le guidage vocal est indisponible pour le moment. Réessaie.'
  }
}

export function useSpeechGuide() {
  const [supported] = useState(
    () =>
      typeof window !== 'undefined' &&
      'speechSynthesis' in window &&
      'SpeechSynthesisUtterance' in window,
  )
  const [voiceLabel, setVoiceLabel] = useState('Français · voix de l’appareil')
  const [error, setError] = useState<string | null>(null)
  const voiceRef = useRef<SpeechSynthesisVoice | null>(null)
  const utteranceRef = useRef<SpeechSynthesisUtterance | null>(null)
  const mountedRef = useRef(false)

  const cancel = useCallback(() => {
    const utterance = utteranceRef.current
    utteranceRef.current = null

    if (utterance) {
      utterance.onend = null
      utterance.onerror = null
    }

    if (supported) {
      try {
        window.speechSynthesis.cancel()
      } catch {
        // Audio failure must never interrupt the session controls.
      }
    }
  }, [supported])

  useEffect(() => {
    mountedRef.current = true

    if (!supported) {
      return () => {
        mountedRef.current = false
      }
    }

    const synthesis = window.speechSynthesis
    const updateVoices = () => {
      try {
        const voice = preferredFrenchVoice(synthesis.getVoices())
        voiceRef.current = voice
        setVoiceLabel(
          voice
            ? `${voice.name} · ${voice.lang}`
            : 'Français · voix de l’appareil',
        )
      } catch {
        voiceRef.current = null
      }
    }

    synthesis.addEventListener('voiceschanged', updateVoices)
    updateVoices()

    return () => {
      mountedRef.current = false
      synthesis.removeEventListener('voiceschanged', updateVoices)
      cancel()
    }
  }, [cancel, supported])

  const speak = useCallback(
    (text: string) => {
      cancel()
      if (!mountedRef.current) return

      setError(null)
      if (!supported) {
        setError('Le guidage vocal n’est pas disponible dans ce navigateur.')
        return
      }
      if (!text.trim()) return

      try {
        const utterance = new SpeechSynthesisUtterance(text)
        utterance.lang = 'fr-FR'
        utterance.voice = voiceRef.current
        utterance.rate = 1
        utteranceRef.current = utterance

        utterance.onend = () => {
          if (utteranceRef.current === utterance) utteranceRef.current = null
        }
        utterance.onerror = (event) => {
          if (!mountedRef.current || utteranceRef.current !== utterance) return
          utteranceRef.current = null
          if (event.error !== 'canceled' && event.error !== 'interrupted') {
            setError(speechErrorMessage(event.error))
          }
        }

        window.speechSynthesis.speak(utterance)
      } catch {
        cancel()
        setError('Le guidage vocal n’a pas pu démarrer. Réessaie.')
      }
    },
    [cancel, supported],
  )

  return {
    supported,
    voiceLabel: supported ? voiceLabel : 'Voix indisponible',
    error,
    speak,
    cancel,
  }
}
