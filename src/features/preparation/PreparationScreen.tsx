import { useEffect, useRef, useState } from 'react'
import {
  ArrowLeft,
  ArrowRight,
  Check,
  CheckCircle2,
  Clock3,
  Dumbbell,
  Headphones,
  Home,
  Info,
  MapPin,
  Save,
  Shield,
  SlidersHorizontal,
  Sprout,
  Wind,
} from 'lucide-react'
import { FIRST_WORKOUT } from '../../content/workouts'
import {
  EQUIPMENT,
  ENVIRONMENTS,
  EXPERIENCES,
  assessVariant,
  getDurationSeconds,
  type Environment,
  type Equipment,
  type Experience,
  type TrainingSetup,
  type WorkoutVariant,
} from '../../domain/workouts'
import type { ProfileId } from '../../data/trainingProfiles'
import { useTrainingProfiles } from './useTrainingProfiles'
import { durationLabel } from './durationLabel'
import { MovementGuide, PhaseSummary, WorkoutTimeline } from './WorkoutDetails'
import './preparation.css'

const PATHS = [
  { id: 'power', name: 'Le Puissant' },
  { id: 'endurance', name: 'L’Infatigable' },
  { id: 'technique', name: 'Le Technicien' },
  { id: 'strategy', name: 'Le Stratège' },
] as const

function equipmentLabel(variant: WorkoutVariant) {
  return variant.requiredEquipment.length
    ? variant.requiredEquipment
        .map((id) => EQUIPMENT.find((item) => item.id === id)!.label)
        .join(', ')
    : 'Sans matériel'
}

function ContentNote() {
  return (
    <div className="content-note">
      <Info size={17} aria-hidden="true" />
      <p>
        Programme de démonstration, non validé par un entraîneur. Garde une
        intensité confortable et arrête en cas de douleur.
      </p>
    </div>
  )
}

function PreparationScreen({ active }: { active: boolean }) {
  const { profiles, loading, saving, error, saveProfile } =
    useTrainingProfiles()
  const [profileId, setProfileId] = useState<ProfileId>('home')
  const [drafts, setDrafts] = useState<
    Partial<Record<ProfileId, TrainingSetup>>
  >({})
  const [savedMessage, setSavedMessage] = useState('')
  const [variantId, setVariantId] = useState('fondations')
  const [prepared, setPrepared] = useState<{
    variant: WorkoutVariant
    setup: TrainingSetup
  } | null>(null)
  const mainRef = useRef<HTMLElement>(null)
  const previousPrepared = useRef(prepared)
  const setup = drafts[profileId] ?? profiles[profileId].setup
  const variant = FIRST_WORKOUT.variants.find((item) => item.id === variantId)!
  const assessment = assessVariant(variant, setup)
  const dirty =
    JSON.stringify(setup) !== JSON.stringify(profiles[profileId].setup)
  const alternatives = FIRST_WORKOUT.variants.filter(
    (item) => item.id !== variantId && assessVariant(item, setup).compatible,
  )

  useEffect(() => {
    if (previousPrepared.current !== prepared) {
      mainRef.current?.focus({ preventScroll: true })
      window.scrollTo({ top: 0, behavior: 'instant' })
      previousPrepared.current = prepared
    }
  }, [prepared])

  function updateSetup(patch: Partial<TrainingSetup>) {
    setSavedMessage('')
    setDrafts((current) => ({
      ...current,
      [profileId]: { ...setup, ...patch },
    }))
  }

  function toggleEquipment(id: Equipment) {
    const equipment = new Set(setup.equipment)
    if (equipment.has(id)) equipment.delete(id)
    else equipment.add(id)
    updateSetup({
      equipment: EQUIPMENT.filter((item) => equipment.has(item.id)).map(
        (item) => item.id,
      ),
    })
  }

  async function save() {
    const id = profileId
    const saved = await saveProfile(id, setup)
    if (saved)
      setSavedMessage(
        `Profil ${profiles[id].name} enregistré sur cet appareil.`,
      )
  }

  if (prepared) {
    return (
      <main
        className="preparation-screen"
        id={active ? 'main-content' : undefined}
        ref={mainRef}
        tabIndex={-1}
      >
        <button className="back-button" onClick={() => setPrepared(null)}>
          <ArrowLeft size={17} aria-hidden="true" />
          Modifier ma préparation
        </button>
        <section className="prepared-heading" aria-labelledby="prepared-title">
          <p className="eyebrow">
            <CheckCircle2 size={16} aria-hidden="true" /> UNE SÉANCE ADAPTÉE À
            TON TERRAIN
          </p>
          <h1 id="prepared-title">
            Ta séance est prête<span>.</span>
          </h1>
          <p>
            {FIRST_WORKOUT.title} <span> / </span> {prepared.variant.title}
          </p>
          <div className="prepared-facts">
            <span>
              <Clock3 size={16} aria-hidden="true" />
              {durationLabel(getDurationSeconds(prepared.variant))}
            </span>
            <span>
              <MapPin size={16} aria-hidden="true" />
              {
                ENVIRONMENTS.find(
                  (item) => item.id === prepared.setup.environment,
                )!.label
              }
            </span>
            <span>
              <Dumbbell size={16} aria-hidden="true" />
              {equipmentLabel(prepared.variant)}
            </span>
          </div>
        </section>
        <div className="prepared-layout">
          <div>
            <PhaseSummary variant={prepared.variant} />
            <WorkoutTimeline variant={prepared.variant} />
          </div>
          <aside className="prepared-sidebar">
            <MovementGuide variant={prepared.variant} />
            <div className="guide-callout">
              <Headphones size={23} aria-hidden="true" />
              <h3>Fais connaissance avec ta voix.</h3>
              <p>
                Le test du guide dure une minute. Le guidage de cette séance
                sera disponible prochainement.
              </p>
              <a href="#guide">
                Tester le guide audio{' '}
                <ArrowRight size={17} aria-hidden="true" />
              </a>
            </div>
            <ContentNote />
          </aside>
        </div>
      </main>
    )
  }

  return (
    <main
      className="preparation-screen"
      id={active ? 'main-content' : undefined}
      ref={mainRef}
      tabIndex={-1}
    >
      <section className="prep-hero" aria-labelledby="workout-title">
        <div>
          <p className="eyebrow">
            <span className="short-line" /> VIKING · LE COMMENCEMENT
          </p>
          <h1 id="workout-title">
            L’ÉVEIL
            <br />
            <span>DU NORD.</span>
          </h1>
          <p>{FIRST_WORKOUT.description}</p>
          <div className="hero-facts">
            <span>
              <Clock3 size={15} aria-hidden="true" />8 à 14 min
            </span>
            <span>
              <Shield size={15} aria-hidden="true" />
              Sans contact
            </span>
            <span>
              <Sprout size={15} aria-hidden="true" />À ton rythme
            </span>
          </div>
        </div>
        <div className="nord-emblem" aria-hidden="true">
          <span className="emblem-label">BÂTIS TES FONDATIONS</span>
          <svg viewBox="0 0 250 240" fill="none">
            <circle cx="125" cy="115" r="88" />
            <circle cx="125" cy="115" r="105" strokeDasharray="2 6" />
            <path
              className="mountain-line"
              d="m29 158 57-72 30 38 31-55 77 89H29Z"
            />
            <path d="m70 107 16 15 14-16m31-6 16 10 17-13M125 0v30m0 170v35M10 115h23m184 0h23" />
            <path className="emblem-sun" d="M188 66a14 14 0 1 0-24-14" />
          </svg>
          <span className="emblem-number">CHAPITRE 01 / VIKING</span>
        </div>
      </section>

      <div className="preparation-layout">
        <section className="setup-panel" aria-labelledby="setup-title">
          <div className="step-heading">
            <span className="step-index">01</span>
            <div>
              <p className="eyebrow">LÀ OÙ TU T’ENTRAÎNES</p>
              <h2 id="setup-title">Ton terrain du jour.</h2>
            </div>
            <SlidersHorizontal size={18} aria-hidden="true" />
          </div>
          <div className="profile-switch" aria-label="Profils d’entraînement">
            <button
              type="button"
              disabled={loading || saving}
              aria-pressed={profileId === 'home'}
              onClick={() => {
                setProfileId('home')
                setSavedMessage('')
              }}
            >
              <Home size={16} aria-hidden="true" />
              Maison
            </button>
            <button
              type="button"
              disabled={loading || saving}
              aria-pressed={profileId === 'gym'}
              onClick={() => {
                setProfileId('gym')
                setSavedMessage('')
              }}
            >
              <Dumbbell size={16} aria-hidden="true" />
              Salle de boxe
            </button>
          </div>
          {loading && (
            <p role="status" className="form-message">
              Chargement des profils…
            </p>
          )}
          {error && (
            <p role="alert" className="form-error">
              {error}
            </p>
          )}
          <fieldset className="setup-fields" disabled={loading || saving}>
            <legend className="sr-only">Configuration de l’entraînement</legend>
            <div className="form-row">
              <label>
                Lieu d’entraînement
                <select
                  value={setup.environment}
                  onChange={(event) =>
                    updateSetup({
                      environment: event.target.value as Environment,
                    })
                  }
                >
                  {ENVIRONMENTS.map((item) => (
                    <option value={item.id} key={item.id}>
                      {item.label}
                    </option>
                  ))}
                </select>
              </label>
              <label>
                Temps disponible
                <select
                  value={setup.availableMinutes}
                  onChange={(event) =>
                    updateSetup({
                      availableMinutes: Number(event.target.value),
                    })
                  }
                >
                  {[...new Set([5, 8, 12, 15, 20, 30, setup.availableMinutes])]
                    .sort((a, b) => a - b)
                    .map((minutes) => (
                      <option key={minutes} value={minutes}>
                        {minutes} min
                      </option>
                    ))}
                </select>
              </label>
            </div>
            <label className="experience-label">
              Expérience
              <select
                value={setup.experience}
                onChange={(event) =>
                  updateSetup({ experience: event.target.value as Experience })
                }
              >
                {EXPERIENCES.map((item) => (
                  <option key={item.id} value={item.id}>
                    {item.label}
                  </option>
                ))}
              </select>
            </label>
            <fieldset className="equipment-fields">
              <legend>Le matériel à ta disposition</legend>
              <p>Coche uniquement ce que tu as avec toi.</p>
              <div className="equipment-options">
                {EQUIPMENT.map((item) => (
                  <label
                    key={item.id}
                    className={
                      setup.equipment.includes(item.id) ? 'is-checked' : ''
                    }
                  >
                    <input
                      type="checkbox"
                      checked={setup.equipment.includes(item.id)}
                      onChange={() => toggleEquipment(item.id)}
                    />
                    <span>{item.label}</span>
                  </label>
                ))}
              </div>
              <span className="equipment-caption">
                {setup.equipment.length
                  ? `${setup.equipment.length} équipement${setup.equipment.length > 1 ? 's' : ''} sélectionné${setup.equipment.length > 1 ? 's' : ''}`
                  : 'Aucun matériel ? Les variantes sans équipement restent disponibles.'}
              </span>
            </fieldset>
            <fieldset className="constraints-fields">
              <legend>Les contraintes du lieu</legend>
              <label>
                <input
                  type="checkbox"
                  checked={setup.smallSpace}
                  onChange={(event) =>
                    updateSetup({ smallSpace: event.target.checked })
                  }
                />
                <span>
                  Espace réduit<small>Des mouvements près de toi</small>
                </span>
              </label>
              <label>
                <input
                  type="checkbox"
                  checked={setup.quiet}
                  onChange={(event) =>
                    updateSetup({ quiet: event.target.checked })
                  }
                />
                <span>
                  Éviter le bruit<small>Sans sauts ni impacts sonores</small>
                </span>
              </label>
            </fieldset>
          </fieldset>
          <div className="save-profile">
            <button
              disabled={loading || saving || !dirty}
              onClick={() => {
                void save()
              }}
            >
              <Save size={15} aria-hidden="true" />
              {saving ? 'Enregistrement…' : 'Enregistrer le profil'}
            </button>
            <p role="status">
              {savedMessage ||
                (dirty
                  ? 'Modifications non enregistrées.'
                  : 'Retrouve ce profil sur cet appareil.')}
            </p>
          </div>
        </section>

        <section className="variant-panel" aria-labelledby="variant-title">
          <div className="step-heading">
            <span className="step-index">02</span>
            <div>
              <p className="eyebrow">UNE SÉANCE, PLUSIEURS APPROCHES</p>
              <h2 id="variant-title">Choisis ton rythme.</h2>
            </div>
          </div>
          <fieldset className="variant-options">
            <legend className="sr-only">Variante de la séance</legend>
            {FIRST_WORKOUT.variants.map((item) => {
              const result = assessVariant(item, setup)
              const selected = variantId === item.id
              return (
                <label
                  key={item.id}
                  className={`variant-card ${selected ? 'variant-selected' : ''} ${result.compatible ? '' : 'variant-unavailable'}`}
                >
                  <input
                    type="radio"
                    name="variant"
                    value={item.id}
                    checked={selected}
                    onChange={() => setVariantId(item.id)}
                    aria-label={item.title}
                  />
                  <span className="variant-copy">
                    <span className="variant-title-row">
                      <strong>{item.title}</strong>
                      <span>{durationLabel(getDurationSeconds(item))}</span>
                    </span>
                    <span className="variant-description">
                      {item.description}
                    </span>
                    <span className="variant-meta">
                      <span>{equipmentLabel(item)}</span>
                      <span
                        className={
                          result.compatible
                            ? 'compatibility-yes'
                            : 'compatibility-no'
                        }
                      >
                        {result.compatible ? (
                          <Check size={13} aria-hidden="true" />
                        ) : (
                          <Info size={13} aria-hidden="true" />
                        )}
                        {result.compatible ? 'Compatible' : 'À adapter'}
                      </span>
                    </span>
                    {selected && !result.compatible && (
                      <ul className="variant-reasons">
                        {result.reasons.map((reason) => (
                          <li key={reason}>{reason}</li>
                        ))}
                      </ul>
                    )}
                  </span>
                </label>
              )
            })}
          </fieldset>
          <div className="selected-overview">
            <div className="subsection-heading">
              <h3>Au programme de {variant.title}</h3>
              <span>{durationLabel(getDurationSeconds(variant))}</span>
            </div>
            <PhaseSummary variant={variant} />
            <div className="path-orientation">
              <span>Les voies travaillées</span>
              <div>
                {PATHS.filter((path) => variant.pathWeights[path.id] > 0).map(
                  (path) => (
                    <span key={path.id}>
                      {path.name}
                      <strong>{variant.pathWeights[path.id]} %</strong>
                    </span>
                  ),
                )}
              </div>
              <p>
                Une orientation du contenu, pas une mesure de tes capacités.
              </p>
            </div>
          </div>
          <div className="preparation-action">
            <div aria-live="polite">
              {assessment.compatible ? (
                <p className="ready-message">
                  <CheckCircle2 size={18} aria-hidden="true" />
                  Cette variante correspond à ta configuration.
                </p>
              ) : (
                <>
                  <p className="incompatible-message">
                    <Info size={18} aria-hidden="true" />
                    Cette variante ne convient pas à ta configuration.
                  </p>
                  {alternatives.length > 0 ? (
                    <p className="alternative-message">
                      Une autre approche est disponible :{' '}
                      {alternatives.map((item, index) => (
                        <span key={item.id}>
                          {index > 0 ? ', ' : ''}
                          <button onClick={() => setVariantId(item.id)}>
                            {item.title}
                          </button>
                        </span>
                      ))}
                      .
                    </p>
                  ) : (
                    <p className="alternative-message">
                      Aucune variante compatible pour le moment. Ajuste le temps
                      ou les conditions d’entraînement.
                    </p>
                  )}
                </>
              )}
            </div>
            <button
              className="prepare-button"
              disabled={!assessment.compatible || loading}
              onClick={() => {
                if (assessVariant(variant, setup).compatible)
                  setPrepared({ variant, setup: structuredClone(setup) })
              }}
            >
              Voir ma séance
              <ArrowRight size={19} aria-hidden="true" />
            </button>
            <p className="preparation-action-note">
              Consulte le déroulement et les mouvements avant de commencer.
            </p>
          </div>
          <MovementGuide variant={variant} />
        </section>
      </div>
      <div className="prep-bottom-note">
        <Wind size={23} aria-hidden="true" />
        <p>
          La constance commence par une séance à ta portée.
          <span>
            Le bon rythme, c’est celui que tu peux tenir confortablement.
          </span>
        </p>
      </div>
      <ContentNote />
    </main>
  )
}

export default PreparationScreen
