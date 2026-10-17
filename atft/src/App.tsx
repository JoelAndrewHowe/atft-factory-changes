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
  stripRegionMarkers,
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
  invalidateCodeCheck,
  loadState,
  makeFreshPersistedState,
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
import { traces, type TraceDefinition } from './traces'
import { TracePanel } from './TracePanel'
import { buildWalkthroughStages } from './walkthrough'
import { WalkthroughPanel } from './WalkthroughPanel'
import {
  getQuestionsForLesson,
  questions,
  type QuestionId,
} from './questions'
import { evaluateLessonGate, evaluateTutorialGates } from './lessonGates'
import './App.css'

const unavailableStorage: Storage = {
  length: 0,
  clear(): void { throw new Error('Storage unavailable') },
  key(): null { throw new Error('Storage unavailable') },
  getItem(): null { throw new Error('Storage unavailable') },
  setItem(): void { throw new Error('Storage unavailable') },
  removeItem(): void { throw new Error('Storage unavailable') },
}

const config: PersistenceConfig = {
  storage: (() => { try { return window.localStorage } catch { return unavailableStorage } })(),
  lessons,
  allGapIds: ALL_GAP_IDS as readonly string[],
  schemaVersion: DEFAULT_SCHEMA_VERSION,
  contentVersion: DEFAULT_CONTENT_VERSION,
  storageKey: DEFAULT_STORAGE_KEY,
}

function getInitialState(): {
  persisted: PersistedTutorialState
  error: string | null
  migrationNotice: string | null
} {
  const loaded = loadState(config)
  if (loaded && !loaded.corrupted) {
    return {
      persisted: loaded.persisted,
      error: loaded.error,
      migrationNotice: loaded.migrationNotice,
    }
  }
  return {
    persisted: makeFreshPersistedState(config),
    error: loaded?.error ?? null,
    migrationNotice: null,
  }
}

function statusLabel(status: string): string {
  switch (status) {
    case 'locked':
      return 'Locked'
    case 'available':
      return 'Available'
    case 'needs-check':
      return 'Needs check — code check needed'
    case 'needs-understanding':
      return 'Needs check — understanding pending'
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

// Place each trace after the exercise line it illustrates, not after the file.
// These explicit gap anchors are presentation metadata, not binding resolution.
const traceAnchors: Record<string, string> = {
  'lesson2.given': 'feature.patient',
  'lesson2.when': 'feature.when',
  'lesson2.then': 'feature.status',
  'lesson3.model': 'model.date',
  'lesson4.request': 'request.patient',
  'lesson5.response': 'response.status',
}

function traceSections(segments: Segment[], entries: TraceDefinition[]) {
  const sections: { segments: Segment[]; trace?: TraceDefinition }[] = []
  let current: Segment[] = []
  let pending: TraceDefinition | undefined
  for (const segment of segments) {
    if (pending && segment.type === 'text') {
      const newline = segment.content.indexOf('\n')
      if (newline !== -1) {
        current.push({ type: 'text', content: segment.content.slice(0, newline + 1) })
        sections.push({ segments: current, trace: pending })
        current = []
        pending = undefined
        if (segment.content.slice(newline + 1)) {
          current.push({ type: 'text', content: segment.content.slice(newline + 1) })
        }
        continue
      }
    }
    current.push(segment)
    if (segment.type === 'gap') pending = entries.find((entry) => traceAnchors[entry.id] === segment.gapId)
  }
  sections.push({ segments: current, trace: pending })
  return sections
}

function CodeBlock({
  file,
  currentLesson,
  gapValues,
  onGapChange,
  invalidGaps,
  inputRefs,
  traceEntries,
  openTraceId,
  onToggleTrace,
  onCloseTrace,
  traceTriggerRefs,
}: {
  file: CodeFile
  currentLesson: LessonData
  gapValues: Record<string, Record<string, string>>
  onGapChange?: (gapId: string, value: string) => void
  invalidGaps: Set<string>
  inputRefs: React.MutableRefObject<Map<string, HTMLInputElement>>
  traceEntries: TraceDefinition[]
  openTraceId: string | null
  onToggleTrace: (id: string) => void
  onCloseTrace: (id: string) => void
  traceTriggerRefs: React.MutableRefObject<Map<string, HTMLButtonElement>>
}) {
  const sections = traceSections(file.segments, traceEntries)
  return (
    <div className="code-panel">
      <div className="code-filename">{file.filename}</div>
      {sections.map((section, sectionIndex) => (
        <div key={sectionIndex} className="code-section">
          <pre className="code-pre"><code>
            {section.segments.map((segment, i) => (
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
          </code></pre>
          {section.trace && (
            <div className="inline-trace">
              <span className="inline-trace-label">{section.trace.panelTitle}</span>
              <button
                ref={(el) => { if (el) traceTriggerRefs.current.set(section.trace!.id, el) }}
                className="trace-trigger"
                aria-label={`Trace this step: ${section.trace.panelTitle}`}
                aria-expanded={openTraceId === section.trace.id}
                aria-controls={`trace-panel-${section.trace.id}`}
                onClick={() => onToggleTrace(section.trace!.id)}
              >Trace this step</button>
              {openTraceId === section.trace.id && (
                <TracePanel key={section.trace.id} trace={section.trace} onClose={() => onCloseTrace(section.trace!.id)} />
              )}
            </div>
          )}
        </div>
      ))}
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
    return <span>{stripRegionMarkers(segment.content)}</span>
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
    <div className="code-panel" data-testid="fixture-panel">
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
      feature: stripRegionMarkers(assembleCode(learnerFeatureFile.segments, allGapValues)),
      model: stripRegionMarkers(assembleCode(learnerImmunizationFile.segments, allGapValues)),
      steps: stripRegionMarkers(assembleCode(learnerStepsFile.segments, allGapValues)),
      request: `${requestLines.join('\n')}\n\n${JSON.stringify(learnerRequestBody, null, 2)}`,
      response: `201 Created\nContent-Type: ${headers.accept}\nLocation: ${learnerLocation}\n\n${JSON.stringify(learnerResponseBody, null, 2)}`,
    }),
    [allGapValues],
  )

  return (
    <div className="simulation-panel" data-testid="simulation-panel">
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
        <pre className="code-pre" data-testid="simulation-tab-content">
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
              <span className="pass-badge" data-testid="pass-badge">Simulated pass</span>
              <div>
                <div className="step-text">{r.step}</div>
                <div className="step-explanation">{r.explanation}</div>
              </div>
            </div>
          ))}
          <div className="recap" data-testid="recap">
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
  const initial = useMemo(() => getInitialState(), [])
  const [persisted, setPersisted] = useState<PersistedTutorialState>(initial.persisted)
  const [loadError, setLoadError] = useState<string | null>(initial.error)
  const [saveError, setSaveError] = useState<string | null>(null)
  const [showSolution, setShowSolution] = useState(false)
  const [showSimulation, setShowSimulation] = useState(false)
  const [checkResults, setCheckResults] = useState<Record<string, ValidationResult>>({})
  const [resetDialogOpen, setResetDialogOpen] = useState(false)
  const [liveMessage, setLiveMessage] = useState('')
  const [openTraceId, setOpenTraceId] = useState<string | null>(null)
  const [showWalkthrough, setShowWalkthrough] = useState(false)
  const [migrationNotice, setMigrationNotice] = useState<string | null>(initial.migrationNotice)
  const [questionErrors, setQuestionErrors] = useState<Record<string, string>>({})
  const prevLessonIdRef = useRef<string>(persisted.currentLessonId)
  const inputRefs = useRef(new Map<string, HTMLInputElement>())
  const traceTriggerRefs = useRef(new Map<string, HTMLButtonElement>())
  const walkthroughTriggerRef = useRef<HTMLButtonElement>(null)
  const mainRef = useRef<HTMLDivElement>(null)
  const resetButtonRef = useRef<HTMLButtonElement>(null)
  const resetDialogRef = useRef<HTMLDivElement>(null)
  const dialogHeadingRef = useRef<HTMLHeadingElement>(null)
  const prevDialogOpen = useRef(false)

  // Reconstruct checkResults for current lesson on mount / navigation
  useEffect(() => {
    const lesson = getLessonById(persisted.currentLessonId)
    if (!lesson || lesson.type !== 'coding') return
    const currentGaps = persisted.gapValues[lesson.id] ?? {}
    const lastChecked = persisted.lastCheckedValues[lesson.id] ?? {}

    const hasChecked = lesson.editableGaps.some((gapId) => lastChecked[gapId] !== undefined)
    if (!hasChecked) return

    const allMatch = lesson.editableGaps.every(
      (gapId) => currentGaps[gapId] === lastChecked[gapId],
    )

    if (allMatch) {
      const results = validateGaps(
        lesson.editableGaps,
        currentGaps as Record<string, string>,
      )
      setCheckResults(results)
    }
  }, [persisted.currentLessonId])

  // Focus main heading after lesson navigation (skip initial mount)
  useEffect(() => {
    if (prevLessonIdRef.current === persisted.currentLessonId) return
    prevLessonIdRef.current = persisted.currentLessonId
    const h = mainRef.current?.querySelector('h2') as HTMLElement | null
    if (h) {
      h.focus()
    }
  }, [persisted.currentLessonId])

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

  const gates = useMemo(
    () => evaluateTutorialGates(progress, persisted.readingComplete, persisted.checkedQuestionSelections, persisted.questionSelections),
    [progress, persisted.readingComplete, persisted.checkedQuestionSelections, persisted.questionSelections],
  )
  const currentGate = gates.lessons[currentLesson.id]
  const effectiveCurrentStatus = currentGate.status
  const understandingSummary = { passed: currentGate.understandingPassed, total: currentGate.understandingTotal }

  const lessonTraces = useMemo(
    () => traces.filter((t) => t.lessonId === currentLesson.id),
    [currentLesson.id],
  )

  const canRunSimulation = gates.canRunSimulation

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

  // Focus dialog heading when dialog opens
  useEffect(() => {
    if (resetDialogOpen && dialogHeadingRef.current) {
      dialogHeadingRef.current.focus()
    }
  }, [resetDialogOpen])

  // Restore focus to reset button when dialog closes
  useEffect(() => {
    if (prevDialogOpen.current && !resetDialogOpen) {
      resetButtonRef.current?.focus()
    }
    prevDialogOpen.current = resetDialogOpen
  }, [resetDialogOpen])

  const goToLesson = useCallback(
    (lessonId: string) => {
      if (!getLessonById(lessonId)) return
      setPersisted((p) => ({ ...p, currentLessonId: lessonId }))
      setShowSolution(false)
      setCheckResults({})
      setQuestionErrors({})
      setOpenTraceId(null)
      setShowWalkthrough(false)
      setLiveMessage('')
      // The lesson-id effect focuses the heading when the destination changes.
      // Navigating to the current lesson also closes the walkthrough, and must
      // not leave focus inside the panel that is about to unmount.
      if (lessonId === persisted.currentLessonId) {
        requestAnimationFrame(() => mainRef.current?.querySelector('h2')?.focus())
      }
    },
    [persisted.currentLessonId],
  )

  const navigateTo = useCallback(
    (lessonId: string) => {
      if (!getLessonById(lessonId)) return
      const status = progress.lessonStatuses[lessonId]
      if (status === 'locked') return
      goToLesson(lessonId)
    },
    [progress.lessonStatuses, goToLesson],
  )

  const handleGapChange = useCallback(
    (gapId: string, value: string) => {
      const lessonId = currentLesson.id
      setPersisted((p) => invalidateCodeCheck({
        ...p,
        gapValues: {
          ...p.gapValues,
          [lessonId]: {
            ...(p.gapValues[lessonId] ?? {}),
            [gapId]: value,
          },
        },
      }, lessonId))
      setShowSimulation(false)
      setShowWalkthrough(false)
      setCheckResults({})
      setLiveMessage('')
    },
    [currentLesson.id],
  )

  const allGapValues = useMemo(() => {
    const result: Record<string, string> = {}
    for (const [, gaps] of Object.entries(persisted.gapValues)) {
      for (const [gapId, value] of Object.entries(gaps)) {
        result[gapId] = value
      }
    }
    return result
  }, [persisted.gapValues])

  const walkthroughStages = useMemo(() => buildWalkthroughStages(allGapValues), [allGapValues])

  const handleContinue = useCallback(() => {
    const next = lessons.find((l) => l.number === currentLesson.number + 1)
    if (!next) return

    if (currentLesson.type === 'reading') {
      setPersisted((p) => ({
        ...p,
        readingComplete: true,
        highestUnlockedLesson: Math.max(p.highestUnlockedLesson, next.number),
      }))
      goToLesson(next.id)
    } else if (effectiveCurrentStatus === 'complete') {
      setPersisted((p) => ({
        ...p,
        highestUnlockedLesson: Math.max(p.highestUnlockedLesson, next.number),
      }))
      goToLesson(next.id)
    }
  }, [currentLesson, effectiveCurrentStatus, goToLesson])

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
      const allQuestionsComplete = evaluateLessonGate(
        currentLesson.id, 'complete', persisted.checkedQuestionSelections, persisted.questionSelections,
      ).complete
      setPersisted((p) => ({
        ...p,
        lastCheckedValues: {
          ...p.lastCheckedValues,
          [currentLesson.id]: { ...currentGaps },
        },
        highestUnlockedLesson: allQuestionsComplete
          ? Math.min(lessons.length, Math.max(p.highestUnlockedLesson, currentLesson.number + 1))
          : p.highestUnlockedLesson,
      }))
      setShowSolution(false)
      if (allQuestionsComplete) {
        setLiveMessage(currentLesson.number === 5
          ? 'All gaps are correct. Lesson complete. Run simulated test is available.'
          : 'All gaps are correct. Lesson complete. Continue is available.')
      } else {
        setLiveMessage(currentLesson.number === 5
          ? 'All gaps are correct. Complete the understanding checks to run simulated test.'
          : 'All gaps are correct. Complete the understanding checks to continue.')
      }
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
  }, [currentLesson, persisted.gapValues, persisted.checkedQuestionSelections, persisted.questionSelections])

  const handleQuestionSelection = useCallback(
    (questionId: QuestionId, choiceId: 'A' | 'B' | 'C') => {
      setPersisted((p) => ({
        ...p,
        questionSelections: { ...p.questionSelections, [questionId]: choiceId },
        checkedQuestionSelections: { ...p.checkedQuestionSelections, [questionId]: undefined },
        simulationComplete: false,
      }))
      setShowSimulation(false)
      setShowWalkthrough(false)
      setLiveMessage('')
      setQuestionErrors((prev) => ({ ...prev, [questionId]: '' }))
    },
    [],
  )

  const handleQuestionCheck = useCallback(
    (questionId: QuestionId) => {
      const selected = persisted.questionSelections[questionId]
      const question = questions.find((q) => q.id === questionId)
      if (!question) return
      if (!selected) {
        const message = `${question.question} Choose an answer before checking.`
        setLiveMessage((prev) => prev === message ? `${message}\u200B` : message)
        setQuestionErrors((prev) => ({ ...prev, [questionId]: 'Choose an answer before checking.' }))
        return
      }

      const correct = selected === question.correctChoiceId
      const codeStatus = progress.lessonStatuses[currentLesson.id] ?? 'locked'
      const updatedChecked = { ...persisted.checkedQuestionSelections, [questionId]: selected }
      const lessonComplete = evaluateLessonGate(currentLesson.id, codeStatus, updatedChecked, persisted.questionSelections).complete
      setPersisted((p) => {
        const allQuestionsComplete = evaluateLessonGate(
          currentLesson.id, codeStatus, { ...p.checkedQuestionSelections, [questionId]: selected }, p.questionSelections,
        ).complete
        return {
        ...p,
        checkedQuestionSelections: {
          ...p.checkedQuestionSelections,
          [questionId]: selected,
        },
        highestUnlockedLesson:
          allQuestionsComplete
            ? Math.min(lessons.length, Math.max(p.highestUnlockedLesson, currentLesson.number + 1))
            : p.highestUnlockedLesson,
        simulationComplete: allQuestionsComplete ? p.simulationComplete : false,
      }})

      // Ensure re-announcement by appending a zero-width space that changes each time
      setLiveMessage((prev) => {
        const msg = correct
          ? `${lessonComplete ? (currentLesson.number === 5 ? 'Lesson complete. Run simulated test is available. ' : 'Lesson complete. Continue is available. ') : 'Correct. '}${question.feedback[selected]}`
          : `Not yet — try again. ${question.feedback[selected]}`
        return prev === msg ? msg + '\u200B' : msg
      })
      setQuestionErrors((prev) => ({ ...prev, [questionId]: '' }))
    },
    [persisted.questionSelections, persisted.checkedQuestionSelections, progress.lessonStatuses, currentLesson],
  )

  const handleRunSimulation = useCallback(() => {
    if (!canRunSimulation) {
      setLiveMessage('Complete the code and understanding checks before running the simulation.')
      return
    }
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
      setShowWalkthrough(false)
      setLiveMessage('Some answers are incorrect. Please review and check each lesson.')
    }
  }, [canRunSimulation, persisted.gapValues, persisted.lastCheckedValues])

  const handleResetConfirm = useCallback(() => {
    clearState(config)
    const fresh = makeFreshPersistedState(config)
    setPersisted(fresh)
    setShowSolution(false)
    setShowSimulation(false)
    setShowWalkthrough(false)
    setCheckResults({})
    setQuestionErrors({})
    setOpenTraceId(null)
    setMigrationNotice(null)
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

  const dismissMigrationNotice = useCallback(() => {
    setMigrationNotice(null)
    setPersisted((p) => ({ ...p, migrationNoticeShown: true }))
  }, [])

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
              const effectiveStatus = gates.lessons[lesson.id].status
              const isCurrent = lesson.id === currentLesson.id
              const clickable = status !== 'locked'
              return (
                <li key={lesson.id}>
                  <button
                    className={`lesson-nav-item ${isCurrent ? 'current' : ''} ${effectiveStatus === 'locked' ? 'locked' : ''}`}
                    onClick={() => clickable && navigateTo(lesson.id)}
                    aria-current={isCurrent ? 'page' : undefined}
                    aria-disabled={!clickable}
                    disabled={!clickable}
                    aria-label={`Lesson ${lesson.number}: ${lesson.title} — ${statusLabel(effectiveStatus)}`}
                  >
                    <span className="lesson-number">{lesson.number}</span>
                    <span className="lesson-title">{lesson.title}</span>
                    <span className="lesson-status" aria-hidden="true">
                      {statusLabel(effectiveStatus)}
                    </span>
                  </button>
                </li>
              )
            })}
          </ul>
        </nav>
        <div className="sidebar-footer">
          <button
            ref={resetButtonRef}
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

        {migrationNotice && (
          <div className="banner banner-info" role="status">
            <span>{migrationNotice}</span>
            <button className="text-button" onClick={dismissMigrationNotice}>
              Dismiss
            </button>
          </div>
        )}

        <div aria-live="polite" aria-atomic="true" className="sr-only">
          {liveMessage}
        </div>

        <header className="lesson-header">
          <h2 tabIndex={-1}>
            Lesson {currentLesson.number}: {currentLesson.title}
          </h2>
          <span className={`status-badge ${effectiveCurrentStatus}`} data-testid="lesson-status-badge">
            {statusLabel(effectiveCurrentStatus)}
          </span>
        </header>

        {currentLesson.type === 'coding' && understandingSummary.total > 0 && (
          <div className="understanding-summary" data-testid="understanding-summary">
            {progress.lessonStatuses[currentLesson.id] === 'complete' ? (
              <span>Code passed</span>
            ) : (
              <span>Code needs check</span>
            )}
            <span aria-hidden="true"> · </span>
            <span>Understanding {understandingSummary.passed} of {understandingSummary.total} passed</span>
          </div>
        )}

        <div className="instructions">
          {currentLesson.instructions.map((text, i) => (
            <p key={i}>{text}</p>
          ))}
        </div>

        {currentLesson.number === 1 && (
          <div className="simulation-label" role="note" data-testid="simulation-label">
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
            traceEntries={lessonTraces}
            openTraceId={openTraceId}
            onToggleTrace={(id) => setOpenTraceId((open) => open === id ? null : id)}
            onCloseTrace={(id) => {
              setOpenTraceId(null)
              requestAnimationFrame(() => traceTriggerRefs.current.get(id)?.focus())
            }}
            traceTriggerRefs={traceTriggerRefs}
          />
        )}

        <div className="lesson-checks">
          <div className="actions">
            {currentLesson.type === 'reading' && <button className="action-button" onClick={handleContinue}>Continue</button>}
            {currentLesson.type === 'coding' && <>
              <button className="action-button" onClick={handleCheck} data-testid="check-my-work">Check my work</button>
              <button className="action-button action-button-secondary" onClick={() => setShowSolution((s) => !s)}>
                {showSolution ? 'Hide solution' : 'Show solution'}
              </button>
            </>}
          </div>
        {currentLesson.type === 'coding' && Object.keys(checkResults).length > 0 && (
          <div className="feedback-area" data-testid="feedback-area">
            {allValid(checkResults as Record<string, ValidationResult>) ? (
              <p className="check-summary success" data-testid="check-summary-success">
                <span aria-hidden="true">✓</span>{' '}
                {understandingSummary.total > 0 && understandingSummary.passed < understandingSummary.total
                  ? `All gaps are correct. Complete ${understandingSummary.total - understandingSummary.passed} understanding check${understandingSummary.total - understandingSummary.passed === 1 ? '' : 's'} to ${currentLesson.number === 5 ? 'run simulated test' : 'continue'}.`
                  : currentLesson.number === 5
                    ? 'All gaps are correct. Lesson complete. Run simulated test is available.'
                    : 'All gaps are correct. Lesson complete. Continue is available.'}
              </p>
            ) : (
              <div>
                <p className="check-summary error" data-testid="check-summary-error">
                  <span aria-hidden="true">✗</span>{' '}
                  {Object.values(checkResults).filter((r) => !r.valid).length} gap
                  {Object.values(checkResults).filter((r) => !r.valid).length === 1 ? '' : 's'} need correction.
                </p>
                <ul className="feedback-list">
                  {currentLesson.editableGaps.filter((id) => !checkResults[id]?.valid).map((id) => (
                    <li key={id} data-testid="feedback-item">
                      <strong>{gapDefinitions[id]?.label ?? id}:</strong> {checkResults[id]?.feedback}
                    </li>
                  ))}
                </ul>
              </div>
            )}
          </div>
        )}

        {currentLesson.type === 'coding' && getQuestionsForLesson(currentLesson.id).length > 0 && (
          <div className="questions-panel">
            {getQuestionsForLesson(currentLesson.id).map((question) => {
              const selected = persisted.questionSelections[question.id]
              const checked = persisted.checkedQuestionSelections[question.id]
              const showFeedback = checked !== undefined && checked === selected
              const isCorrect = checked === question.correctChoiceId
              const feedbackId = `feedback-${question.id}`
              const errorText = questionErrors[question.id]
              const errorId = `error-${question.id}`
              const descriptionId = errorText ? errorId : showFeedback ? feedbackId : undefined
              return (
                <div className="question-item" key={question.id} data-testid="question-item">
                  {question.prompt && (
                    <p className="question-prompt">{question.prompt}</p>
                  )}
                  <fieldset aria-describedby={descriptionId} aria-invalid={errorText ? true : undefined}>
                    <legend>{question.question}</legend>
                    {question.choices.map((choice) => (
                      <label
                        key={choice.id}
                        className={`question-choice ${showFeedback && checked === choice.id ? (isCorrect ? 'correct' : 'incorrect') : ''}`}
                      >
                        <input
                          type="radio"
                          name={question.id}
                          value={choice.id}
                          checked={selected === choice.id}
                          onChange={() => handleQuestionSelection(question.id, choice.id)}
                        />
                        <span>{choice.text}</span>
                      </label>
                    ))}
                  </fieldset>
                  {errorText && (
                    <div id={errorId} className="question-error">
                      {errorText}
                    </div>
                  )}
                  <button
                    className="action-button action-button-secondary"
                    onClick={() => handleQuestionCheck(question.id)}
                    data-testid="check-understanding-button"
                    aria-describedby={descriptionId}
                  >
                    Check understanding
                  </button>
                  {showFeedback && (
                    <div
                      id={feedbackId}
                      className={`question-feedback ${isCorrect ? 'correct' : 'incorrect'}`}
                    >
                      <p>{question.feedback[checked]}</p>
                      {!isCorrect && (
                        <span className="question-state">Not yet — try again</span>
                      )}
                      {isCorrect && (
                        <span className="question-passed">Passed</span>
                      )}
                    </div>
                  )}
                </div>
              )
            })}
          </div>
        )}

          {currentLesson.type === 'coding' && (
            <div className="actions progression-actions">
              {currentLesson.number < 5 ? (
                <button className="action-button" onClick={handleContinue} disabled={effectiveCurrentStatus !== 'complete'}>Continue</button>
              ) : (
                <button className="action-button" onClick={handleRunSimulation} disabled={!canRunSimulation} data-testid="run-simulation">Run simulated test</button>
              )}
            </div>
          )}
        </div>

        {showSolution && currentLesson.codeFile && (
          <div className="side-panel" data-testid="solution-panel">
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
                      s.type === 'text' ? stripRegionMarkers(s.content) : canonicalAnswers[s.gapId] ?? '',
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

        {persisted.simulationComplete && canRunSimulation && (
          <div className="tutorial-complete" data-testid="tutorial-complete">
            <p>
              <strong>Tutorial complete!</strong>
            </p>
            <div className="actions">
              <button
                ref={walkthroughTriggerRef}
                className="action-button action-button-secondary"
                onClick={() => setShowWalkthrough(true)}
                data-testid="walkthrough-button"
              >
                Walk through my test
              </button>
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

        {showWalkthrough && persisted.simulationComplete && canRunSimulation && (
          <WalkthroughPanel
            stages={walkthroughStages}
            onClose={() => {
              setShowWalkthrough(false)
            }}
            triggerRef={walkthroughTriggerRef}
          />
        )}
      </main>

      {resetDialogOpen && (
        <div
          ref={resetDialogRef}
          className="modal-overlay"
          role="dialog"
          aria-modal="true"
          aria-labelledby="reset-title"
          onClick={(e) => {
            if (e.target === e.currentTarget) {
              setResetDialogOpen(false)
            }
          }}
        >
          <div className="modal-dialog">
            <h3 id="reset-title" tabIndex={-1} ref={dialogHeadingRef}>Start over</h3>
            <p>
              This tutorial&apos;s saved answers and progress will be cleared.
              This cannot be undone.
            </p>
            <div className="modal-buttons">
              <button
                className="action-button action-button-secondary"
                onClick={() => {
                  setResetDialogOpen(false)
                }}
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
