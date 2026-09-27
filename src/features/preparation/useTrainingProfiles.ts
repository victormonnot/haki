import { useCallback, useEffect, useRef, useState } from 'react'
import {
  createDefaultProfiles,
  DEFAULT_PROFILES,
  loadTrainingProfiles,
  saveTrainingProfile,
  type ProfileId,
} from '../../data/trainingProfiles'
import { isTrainingSetup, type TrainingSetup } from '../../domain/workouts'

export function useTrainingProfiles() {
  const [profiles, setProfiles] = useState(createDefaultProfiles)
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const lifecycleRef = useRef(0)
  const loadingRef = useRef(true)
  const savingRef = useRef(false)

  useEffect(() => {
    const lifecycle = ++lifecycleRef.current
    let disposed = false

    void loadTrainingProfiles()
      .then(({ profiles: loaded, invalidProfileIds }) => {
        if (disposed) return
        setProfiles(loaded)
        if (invalidProfileIds.length > 0) {
          const names = invalidProfileIds
            .map((id) => DEFAULT_PROFILES[id].name)
            .join(', ')
          setError(
            `Réglages enregistrés invalides (${names}). Les valeurs par défaut sont utilisées pour cette session.`,
          )
        }
      })
      .catch(() => {
        if (disposed) return
        setError(
          'Impossible de charger les profils enregistrés. Tu peux utiliser les réglages par défaut pour cette session.',
        )
      })
      .finally(() => {
        if (disposed) return
        loadingRef.current = false
        setLoading(false)
      })

    return () => {
      disposed = true
      if (lifecycleRef.current === lifecycle) lifecycleRef.current += 1
    }
  }, [])

  const saveProfile = useCallback(
    async (id: ProfileId, setup: TrainingSetup) => {
      if (loadingRef.current || savingRef.current) return false
      if ((id !== 'home' && id !== 'gym') || !isTrainingSetup(setup)) {
        setError('Vérifie les réglages du profil avant de les enregistrer.')
        return false
      }

      const lifecycle = lifecycleRef.current
      const profile = {
        id,
        name: DEFAULT_PROFILES[id].name,
        setup: { ...setup, equipment: [...setup.equipment] },
      }
      savingRef.current = true
      setSaving(true)
      setError(null)

      try {
        const saved = await saveTrainingProfile(id, profile.setup)
        if (lifecycleRef.current !== lifecycle) return false
        setProfiles((current) => ({ ...current, [id]: saved }))
        return true
      } catch {
        if (lifecycleRef.current !== lifecycle) return false
        setError(
          'Ce profil n’a pas pu être enregistré sur cet appareil. Tes réglages restent utilisables pour cette session.',
        )
        return false
      } finally {
        if (lifecycleRef.current === lifecycle) {
          savingRef.current = false
          setSaving(false)
        }
      }
    },
    [],
  )

  return { profiles, loading, saving, error, saveProfile }
}
