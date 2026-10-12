import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import {
  ALL_GAP_IDS,
  assembleCode,
  canonicalAnswers,
  gapDefinitions,
  getCanonicalCode,
  getLessonById,
  learnerFeatureFile,
  learnerImmunizationFile,
  learnerStepsFile,
  lessons,
  type CodeFile,
  type LessonData,
  type Segment,
} from './lessons'
import {
  allValid,
  firstInvalidGapId,
  validateGaps,
  type ValidationResult,
} from './validation'
import {
  clearState,
  DEFAULT_CONTENT_VERSION,
  DEFAULT_SCHEMA_VERSION,
  DEFAULT_STORAGE_KEY,
  deriveProgressState,
  loadState,
  saveState,
  type PersistedTutorialState,
  type PersistenceConfig,
} from './persistence'
import {
  headers,
  learnerLocation,
  learnerRequestBody,
  learnerResponseBody,
  requestLines,
  statusCreated,
} from './fixtures'
import './App.css'

const config: PersistenceConfig = {
  storage: localStorage,
  lessons,
  allGapIds: ALL_GAP_IDS as readonly string[],
  schemaVersion: DEFAULT_SCHEMA_VERSION,
  contentVersion: DEFAULT_CONTENT_VERSION,
  storageKey: DEFAULT_STORAGE_KEY,
}

function makeFreshPersistedState(): PersistedTutorialState {
  return {
    schemaVersion: config.schemaVersion,
    contentVersion: config.contentVersion,
    currentLessonId: config.lessons[0].id,
    highestUnlockedLesson: 1,
    readingComplete: false,
    gapValues: {},
    lastCheckedValues: {},
    simulationComplete: false,
  }
}

function getInitialPersisted(): {
  persisted: PersistedTutorialState
  error: string | null
} {
  const loaded = loadState(config)
  if (loaded && !loaded.corrupted) {
    return { persisted: loaded.persisted, error: null }
  }
  return { persisted: makeFreshPersistedState(), error: loaded?.error ?? null }
}

function statusLabel(status: string): string {
  switch (status) {
    case 'locked':
      return 'Locked'
    case 'available':
      return 'Available'
    case 'needs-check':
      return 'Needs check'
    case 'complete':
      return 'Complete'
    default:
      return status
  }
}

const SIMULATION_TABS = [
  { id: 'feature', label: 'Feature' },
  { id: 'model', label: 'Immunization.cs' },
  { id: 'steps', label: 'Steps.cs' },
  { id: 'request', label: 'Request' },
  { id: 'response', label: 'Response' },
  { id: 'results', label: 'Step results' },
]

function CodeBlock({
  file,
  currentLesson,
  gapValues,
  onGapChange,
  invalidGaps,
  inputRefs,
}: {
  file: CodeFile
  currentLesson: LessonData
  gapValues: Record<string, Record<string, string>>
  onGapChange?: (gapId: string, value: string) => void
  invalidGaps: Set<string>
  inputRefs: React.MutableRefObject<Map<string, HTMLInputElement>>
}) {
  return (
    <div className="code-panel">
      <div className="code-filename">{file.filename}</div>
      <pre className="code-pre">
        <code>
          {file.segments.map((segment, i) => (
            <SegmentRenderer
              key={i}
              segment={segment}
              index={i}
              currentLesson={currentLesson}
              gapValues={gapValues}
              onGapChange={onGapChange}
              invalidGaps={invalidGaps}
              inputRefs={inputRefs}
            />
          ))}
        </code>
      </pre>
    </div>
  )
}

function SegmentRenderer({
  segment,
  currentLesson,
  gapValues,
  onGapChange,
  invalidGaps,
  inputRefs,
}: {
  segment: Segment
  index: number
  currentLesson: LessonData
  gapValues: Record<string, Record<string, string>>
  onGapChange?: (gapId: string, value: string) => void
  invalidGaps: Set<string>
  inputRefs: React.MutableRefObject<Map<string, HTMLInputElement>>
}) {
  if (segment.type === 'text') {
    return <span>{segment.content}</span>
  }

  const gapId = segment.gapId
  const def = gapDefinitions[gapId]
  const isEditable = currentLesson.editableGaps.includes(gapId)

  if (isEditable) {
    const value = gapValues[currentLesson.id]?.[gapId] ?? ''
    const isInvalid = invalidGaps.has(gapId)
    return (
      <input
        ref={(el) => {
          if (el) inputRefs.current.set(gapId, el)
        }}
        type="text"
        className={`gap-input ${isInvalid ? 'gap-input-invalid' : ''}`}
        value={value}
        onChange={(e) => onGapChange?.(gapId, e.target.value)}
        aria-label={def?.label ?? gapId}
        maxLength={200}
        size={Math.max(12, value.length || 1)}
      />
    )
  }

  const ownerLesson = lessons.find((l) => l.editableGaps.includes(gapId))
  const value = ownerLesson ? (gapValues[ownerLesson.id]?.[gapId] ?? '') : ''
  return (
    <span className="gap-readonly" aria-label={def?.label ?? gapId}>
      {value}
    </span>
  )
}

function FixtureDisplay() {
  const requestJson = JSON.stringify(learnerRequestBody, null, 2)
  const responseJson = JSON.stringify(learnerResponseBody, null, 2)

  return (
    <div className="code-panel">
      <div className="code-filename">API Contract</div>
      <div className="fixture-section">
        <p className="fixture-label">Request</p>
        <pre className="code-pre">
          <code>
            {requestLines.join('\n')}
            {'\n\n'}
            {requestJson}
          </code>
        </pre>
      </div>
      <div className="fixture-section">
        <p className="fixture-label">
          Response — {statusCreated} Created
          <br />
          Location: {learnerLocation}
        </p>
        <pre className="code-pre">
          <code>
            Content-Type: {headers.accept}
            {'\n\n'}
            {responseJson}
          </code>
        </pre>
      </div>
    </div>
  )
}

function SimulationView({ gapValues }: { gapValues: Record<string, Record<string, string>> }) {
  const [tab, setTab] = useState('feature')

  const allGapValues = useMemo(() => {
    const result: Record<string, string> = {}
    for (const [, gaps] of Object.entries(gapValues)) {
      for (const [gapId, value] of Object.entries(gaps)) {
        result[gapId] = value
      }
    }
    return result
  }, [gapValues])

  const assembledFiles: Record<string, string> = useMemo(
    () => ({
      feature: assembleCode(learnerFeatureFile.segments, allGapValues),
      model: assembleCode(learnerImmunizationFile.segments, allGapValues),
      steps: assembleCode(learnerStepsFile.segments, allGapValues),
      request: `${requestLines.join('\n')}\n\n${JSON.stringify(learnerRequestBody, null, 2)}`,
      response: `201 Created\nContent-Type: ${headers.accept}\nLocation: ${learnerLocation}\n\n${JSON.stringify(learnerResponseBody, null, 2)}`,
    }),
    [allGapValues],
  )

  return (
    <div className="simulation-panel">
      <div className="sim-tabs" role="tablist">
        {SIMULATION_TABS.map((t) => (
          <button
            key={t.id}
            role="tab"
            aria-selected={tab === t.id}
            className={`sim-tab ${tab === t.id ? 'active' : ''}`}
            onClick={() => setTab(t.id)}
          >
            {t.label}
          </button>
        ))}
      </div>
      {tab !== 'results' ? (
        <pre className="code-pre">
          <code>{assembledFiles[tab] ?? ''}</code>
        </pre>
      ) : (
        <div className="step-results">
          {[
            {
              step: 'Given a vaccination for patient "Patient/patient-001"',
              explanation: 'The scenario setup is provided.',
            },
            {
              step: 'When I submit the vaccination',
              explanation: 'The POST request is prepared and sent.',
            },
            {
              step: 'Then the response status is 201',
              explanation: 'The server returns 201 Created.',
            },
            {
              step: 'And the recorded vaccination matches the request',
              explanation: 'The returned Immunization matches the submitted data.',
            },
          ].map((r, i) => (
            <div key={i} className="step-result">
              <span className="pass-badge">Simulated pass</span>
              <div>
                <div className="step-text">{r.step}</div>
                <div className="step-explanation">{r.explanation}</div>
              </div>
            </div>
          ))}
          <div className="recap">
            <p>
              <strong>Recap</strong>
            </p>
            <ul>
              <li>Gherkin describes setup, action, and expected behavior.</li>
              <li>Reqnroll bindings connect the scenario to C# methods.</li>
              <li>C# models map nested FHIR JSON into properties.</li>
              <li>HttpClient would submit an Immunization resource in a real test.</li>
              <li>Assertions check both successful creation and the returned vaccination data.</li>
            </ul>
          </div>
        </div>
      )}
    </div>
  )
}

export default function App() {
  const initial = useMemo(() => getInitialPersisted(), [])
  const [persisted, setPersisted] = useState<PersistedTutorialState>(initial.persisted)
  const [loadError, setLoadError] = useState<string | null>(initial.error)
  const [saveError, setSaveError] = useState<string | null>(null)
  const [showSolution, setShowSolution] = useState(false)
  const [showSimulation, setShowSimulation] = useState(false)
  const [checkResults, setCheckResults] = useState<Record<string, ValidationResult>>({})
  const [resetDialogOpen, setResetDialogOpen] = useState(false)
  const [liveMessage, setLiveMessage] = useState('')
  const inputRefs = useRef(new Map<string, HTMLInputElement>())
  const mainRef = useRef<HTMLDivElement>(null)

  const progress = useMemo(
    () =>
      deriveProgressState(
        persisted.gapValues,
        persisted.lastCheckedValues,
        persisted.highestUnlockedLesson,
        persisted.readingComplete,
        config,
      ),
    [persisted],
  )

  const currentLesson = useMemo(
    () => getLessonById(persisted.currentLessonId) ?? lessons[0],
    [persisted.currentLessonId],
  )

  const currentStatus = progress.lessonStatuses[currentLesson.id] ?? 'locked'

  const canRunSimulation = useMemo(() => {
    return (
      persisted.readingComplete &&
      lessons
        .filter((l) => l.type === 'coding')
        .every((l) => progress.lessonStatuses[l.id] === 'complete')
    )
  }, [persisted.readingComplete, progress.lessonStatuses])

  // Persist on every change
  useEffect(() => {
    const error = saveState(persisted, config)
    setSaveError(error)
  }, [persisted])

  // Clear load error after a brief display
  useEffect(() => {
    if (!loadError) return
    const t = setTimeout(() => setLoadError(null), 5000)
    return () => clearTimeout(t)
  }, [loadError])

  const navigateTo = useCallback(
    (lessonId: string) => {
      if (!getLessonById(lessonId)) return
      const status = progress.lessonStatuses[lessonId]
      if (status === 'locked') return
      setPersisted((p) => ({ ...p, currentLessonId: lessonId }))
      setShowSolution(false)
      setCheckResults({})
      setLiveMessage('')
      // Focus main heading after navigation
      requestAnimationFrame(() => {
        const h = mainRef.current?.querySelector('h2')
        h?.focus()
      })
    },
    [progress.lessonStatuses],
  )

  const handleGapChange = useCallback(
    (gapId: string, value: string) => {
      const lessonId = currentLesson.id
      setPersisted((p) => ({
        ...p,
        gapValues: {
          ...p.gapValues,
          [lessonId]: {
            ...(p.gapValues[lessonId] ?? {}),
            [gapId]: value,
          },
        },
        simulationComplete: false,
      }))
      setShowSimulation(false)
      setCheckResults({})
      setLiveMessage('')
    },
    [currentLesson.id],
  )

  const handleContinue = useCallback(() => {
    if (currentLesson.type === 'reading') {
      setPersisted((p) => ({
        ...p,
        readingComplete: true,
        highestUnlockedLesson: Math.max(p.highestUnlockedLesson, currentLesson.number + 1),
      }))
    }
    const next = lessons.find((l) => l.number === currentLesson.number + 1)
    if (next) {
      navigateTo(next.id)
    }
  }, [currentLesson, navigateTo])

  const handleCheck = useCallback(() => {
    if (currentLesson.type !== 'coding') return
    const currentGaps = persisted.gapValues[currentLesson.id] ?? {}
    const results = validateGaps(
      currentLesson.editableGaps,
      currentGaps as Record<string, string>,
    )
    setCheckResults(results)

    const invalidIds = Object.entries(results)
      .filter(([, r]) => !r.valid)
      .map(([id]) => id)

    if (allValid(results)) {
      setPersisted((p) => ({
        ...p,
        lastCheckedValues: {
          ...p.lastCheckedValues,
          [currentLesson.id]: { ...currentGaps },
        },
        highestUnlockedLesson: Math.max(
          p.highestUnlockedLesson,
          currentLesson.number + 1,
        ),
      }))
      setShowSolution(false)
      setLiveMessage('All gaps are correct. Lesson complete.')
    } else {
      const firstInvalid = firstInvalidGapId(currentLesson.editableGaps, results)
      if (firstInvalid) {
        const el = inputRefs.current.get(firstInvalid)
        el?.focus()
      }
      const count = invalidIds.length
      setLiveMessage(
        `${count} gap${count === 1 ? '' : 's'} need${count === 1 ? 's' : ''} correction.`,
      )
    }
  }, [currentLesson, persisted.gapValues])

  const handleRunSimulation = useCallback(() => {
    let allPass = true
    const newLastChecked = { ...persisted.lastCheckedValues }

    for (const lesson of lessons.filter((l) => l.type === 'coding')) {
      const currentGaps = persisted.gapValues[lesson.id] ?? {}
      const results = validateGaps(
        lesson.editableGaps,
        currentGaps as Record<string, string>,
      )
      if (allValid(results)) {
        newLastChecked[lesson.id] = { ...currentGaps }
      } else {
        allPass = false
      }
    }

    if (allPass) {
      setPersisted((p) => ({
        ...p,
        lastCheckedValues: newLastChecked,
        simulationComplete: true,
      }))
      setShowSimulation(true)
      setLiveMessage('Simulated test passed. Tutorial complete.')
    } else {
      setPersisted((p) => ({
        ...p,
        lastCheckedValues: newLastChecked,
      }))
      setShowSimulation(false)
      setLiveMessage('Some answers are incorrect. Please review and check each lesson.')
    }
  }, [persisted.gapValues, persisted.lastCheckedValues])

  const handleResetConfirm = useCallback(() => {
    clearState(config)
    const fresh = makeFreshPersistedState()
    setPersisted(fresh)
    setShowSolution(false)
    setShowSimulation(false)
    setCheckResults({})
    setResetDialogOpen(false)
    setLiveMessage('Progress has been reset.')
  }, [])

  const invalidGaps = useMemo(() => {
    const set = new Set<string>()
    for (const [id, result] of Object.entries(checkResults)) {
      if (!result.valid) set.add(id)
    }
    return set
  }, [checkResults])

  const solutionCode = useMemo(() => {
    if (!currentLesson.codeFile) return ''
    return getCanonicalCode(currentLesson.codeFile.segments)
  }, [currentLesson])

  return (
    <div className="app-container">
      <aside className="sidebar" aria-label="Lesson navigation">
        <div className="sidebar-header">
          <strong>API Test Tutorial</strong>
        </div>
        <nav>
          <ul className="lesson-nav" role="list">
            {lessons.map((lesson) => {
              const status = progress.lessonStatuses[lesson.id] ?? 'locked'
              const isCurrent = lesson.id === currentLesson.id
              const clickable = status !== 'locked'
              return (
                <li key={lesson.id}>
                  <button
                    className={`lesson-nav-item ${isCurrent ? 'current' : ''} ${status === 'locked' ? 'locked' : ''}`}
                    onClick={() => clickable && navigateTo(lesson.id)}
                    aria-current={isCurrent ? 'page' : undefined}
                    aria-disabled={!clickable}
                    disabled={!clickable}
                  >
                    <span className="lesson-number">{lesson.number}</span>
                    <span className="lesson-title">{lesson.title}</span>
                    <span className="lesson-status" aria-hidden="true">
                      {statusLabel(status)}
                    </span>
                  </button>
                </li>
              )
            })}
          </ul>
        </nav>
        <div className="sidebar-footer">
          <button
            className="text-button"
            onClick={() => setResetDialogOpen(true)}
          >
            Start over
          </button>
        </div>
      </aside>

      <main ref={mainRef} className="main-content" tabIndex={-1}>
        {(loadError || saveError) && (
          <div className="banner" role={loadError ? 'alert' : 'status'}>
            {loadError || saveError}
          </div>
        )}

        <div aria-live="polite" aria-atomic="true" className="sr-only">
          {liveMessage}
        </div>

        <header className="lesson-header">
          <h2 tabIndex={-1}>
            Lesson {currentLesson.number}: {currentLesson.title}
          </h2>
          <span className={`status-badge ${currentStatus}`}>
            {statusLabel(currentStatus)}
          </span>
        </header>

        <div className="instructions">
          {currentLesson.instructions.map((text, i) => (
            <p key={i}>{text}</p>
          ))}
        </div>

        {currentLesson.number === 1 && (
          <div className="simulation-label" role="note">
            Simulation only — no code runs or API requests are sent
          </div>
        )}

        {currentLesson.number === 1 && <FixtureDisplay />}

        {currentLesson.codeFile && (
          <CodeBlock
            file={currentLesson.codeFile}
            currentLesson={currentLesson}
            gapValues={persisted.gapValues}
            onGapChange={handleGapChange}
            invalidGaps={invalidGaps}
            inputRefs={inputRefs}
          />
        )}

        {currentLesson.type === 'coding' && Object.keys(checkResults).length > 0 && (
          <div className="feedback-area">
            {allValid(checkResults as Record<string, ValidationResult>) ? (
              <p className="check-summary success">
                <span aria-hidden="true">✓</span> All gaps are correct. You
                can continue.
              </p>
            ) : (
              <div>
                <p className="check-summary error">
                  <span aria-hidden="true">✗</span>{' '}
                  {Object.values(checkResults).filter((r) => !r.valid).length} gap
                  {Object.values(checkResults).filter((r) => !r.valid).length === 1
                    ? ''
                    : 's'}{' '}
                  need correction.
                </p>
                <ul className="feedback-list">
                  {currentLesson.editableGaps
                    .filter((id) => !checkResults[id]?.valid)
                    .map((id) => (
                      <li key={id}>
                        <strong>{gapDefinitions[id]?.label ?? id}:</strong>{' '}
                        {checkResults[id]?.feedback}
                      </li>
                    ))}
                </ul>
              </div>
            )}
          </div>
        )}

        <div className="actions">
          {currentLesson.type === 'reading' && (
            <button className="action-button" onClick={handleContinue}>
              Continue
            </button>
          )}

          {currentLesson.type === 'coding' && (
            <>
              <button className="action-button" onClick={handleCheck}>
                Check my work
              </button>
              <button
                className="action-button action-button-secondary"
                onClick={() => setShowSolution((s) => !s)}
              >
                {showSolution ? 'Hide solution' : 'Show solution'}
              </button>
              {currentLesson.number < 5 && (
                <button
                  className="action-button"
                  onClick={handleContinue}
                  disabled={currentStatus !== 'complete'}
                >
                  Continue
                </button>
              )}
              {currentLesson.number === 5 && (
                <button
                  className="action-button"
                  onClick={handleRunSimulation}
                  disabled={!canRunSimulation}
                >
                  Run simulated test
                </button>
              )}
            </>
          )}
        </div>

        {showSolution && currentLesson.codeFile && (
          <div className="side-panel">
            <div className="side-panel-title">Solution for your exercise</div>
            <pre className="code-pre">
              <code>{solutionCode}</code>
            </pre>
          </div>
        )}

        {currentLesson.workedExample && (
          <div className="side-panel">
            <div className="side-panel-title">Worked example</div>
            <div className="code-panel">
              <div className="code-filename">
                {currentLesson.workedExample.filename}
              </div>
              <pre className="code-pre">
                <code>
                  {currentLesson.workedExample.segments
                    .map((s) =>
                      s.type === 'text' ? s.content : canonicalAnswers[s.gapId] ?? '',
                    )
                    .join('')}
                </code>
              </pre>
            </div>
          </div>
        )}

        {showSimulation && currentLesson.number === 5 && (
          <SimulationView gapValues={persisted.gapValues} />
        )}

        {persisted.simulationComplete && (
          <div className="tutorial-complete">
            <p>
              <strong>Tutorial complete!</strong>
            </p>
            <div className="actions">
              <button
                className="action-button action-button-secondary"
                onClick={() => navigateTo('lesson1')}
              >
                Review lessons
              </button>
              <button
                className="action-button action-button-secondary"
                onClick={() => setResetDialogOpen(true)}
              >
                Start over
              </button>
            </div>
          </div>
        )}
      </main>

      {resetDialogOpen && (
        <div
          className="modal-overlay"
          role="dialog"
          aria-modal="true"
          aria-labelledby="reset-title"
          onClick={(e) => {
            if (e.target === e.currentTarget) setResetDialogOpen(false)
          }}
        >
          <div className="modal-dialog">
            <h3 id="reset-title">Start over</h3>
            <p>
              This tutorial&apos;s saved answers and progress will be cleared.
              This cannot be undone.
            </p>
            <div className="modal-buttons">
              <button
                className="action-button action-button-secondary"
                onClick={() => setResetDialogOpen(false)}
              >
                Cancel
              </button>
              <button className="action-button" onClick={handleResetConfirm}>
                Confirm
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
