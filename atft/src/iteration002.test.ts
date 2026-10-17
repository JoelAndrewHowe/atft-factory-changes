import { describe, expect, it } from 'vitest'
import { ALL_GAP_IDS, canonicalAnswers, lessons } from './lessons'
import { QUESTION_IDS, isQuestionPassed, questions } from './questions'
import {
  DEFAULT_CONTENT_VERSION, DEFAULT_SCHEMA_VERSION, DEFAULT_STORAGE_KEY,
  ITERATION001_STORAGE_KEY, clearState, deriveProgressState, loadState,
  makeFreshPersistedState, saveState,
  type PersistenceConfig,
} from './persistence'

function config(storage: Storage): PersistenceConfig {
  return { storage, lessons, allGapIds: ALL_GAP_IDS, schemaVersion: DEFAULT_SCHEMA_VERSION,
    contentVersion: DEFAULT_CONTENT_VERSION, storageKey: DEFAULT_STORAGE_KEY }
}
function memoryStorage(): Storage {
  const map = new Map<string, string>()
  return {
    get length() { return map.size }, clear() { map.clear() },
    key(i) { return [...map.keys()][i] ?? null },
    getItem(k) { return map.get(k) ?? null },
    setItem(k, v) { map.set(k, v) }, removeItem(k) { map.delete(k) },
  }
}
function checkedCode() {
  return Object.fromEntries(lessons.filter(l => l.type === 'coding').map(l =>
    [l.id, Object.fromEntries(l.editableGaps.map(id => [id, canonicalAnswers[id]]))]))
}
// Fixed historical iteration 001 answers, independent of current lesson metadata.
const iteration001Code = {
  lesson2: {
    'feature.given': 'Given', 'feature.patient': 'Patient/patient-001',
    'feature.when': 'When', 'feature.then': 'Then', 'feature.status': '201',
  },
  lesson3: {
    'model.vaccine': 'CodeableConcept', 'model.patient': 'PatientReference',
    'model.date': 'occurrenceDateTime',
  },
  lesson4: {
    'request.status': 'completed', 'request.patient': 'patientReference',
    'request.method': 'Post', 'request.endpoint': 'Immunization',
    'request.media': 'application/fhir+json',
  },
  lesson5: {
    'response.status': 'expectedStatus', 'response.model': 'Immunization',
    'response.patient': '_request.Patient.Reference', 'response.lot': '_request.LotNumber',
  },
}
function oldSave(complete: boolean) {
  const values = iteration001Code
  return {
    schemaVersion: ITERATION001_STORAGE_KEY, contentVersion: '1',
    currentLessonId: complete ? 'lesson5' : 'lesson3',
    highestUnlockedLesson: complete ? 5 : 3, readingComplete: true,
    gapValues: complete ? values : { lesson2: values.lesson2 },
    lastCheckedValues: complete ? values : { lesson2: values.lesson2 },
    simulationComplete: complete,
  }
}

describe('iteration 002 migration and gates', () => {
  for (const complete of [false, true]) {
    it(`migrates ${complete ? 'completed' : 'partial'} iteration 001 without granting question passes`, () => {
      const storage = memoryStorage()
      storage.setItem(ITERATION001_STORAGE_KEY, JSON.stringify(oldSave(complete)))
      const result = loadState(config(storage))!
      expect(result.migrationNotice).toContain('Your work is saved')
      expect(result.persisted.highestUnlockedLesson).toBe(complete ? 5 : 3)
      expect(result.persisted.gapValues.lesson2).toEqual(iteration001Code.lesson2)
      expect(result.runtime.progress.lessonStatuses.lesson2).toBe('complete')
      expect(result.persisted.questionSelections).toEqual({})
      expect(result.persisted.simulationComplete).toBe(false)
      expect(storage.getItem(ITERATION001_STORAGE_KEY)).toBeNull()
      expect(storage.getItem(DEFAULT_STORAGE_KEY)).not.toBeNull()
    })
  }

  for (const [caseName, checkedPatient] of [
    ['stale', 'Patient/patient-002'],
    ['incorrect', 'WrongPatient'],
  ] as const) {
    it(`retains answers but rejects a ${caseName} iteration 001 code check`, () => {
      const storage = memoryStorage()
      const old = oldSave(false)
      old.lastCheckedValues = { lesson2: { ...iteration001Code.lesson2, 'feature.patient': checkedPatient } }
      if (caseName === 'incorrect') {
        old.gapValues = { lesson2: { ...iteration001Code.lesson2, 'feature.patient': checkedPatient } }
      }
      storage.setItem(ITERATION001_STORAGE_KEY, JSON.stringify(old))
      const result = loadState(config(storage))!
      expect(result.migrationNotice).toContain('Your work is saved')
      expect(result.persisted.gapValues.lesson2['feature.patient']).toBe(
        caseName === 'incorrect' ? checkedPatient : iteration001Code.lesson2['feature.patient'],
      )
      expect(result.persisted.lastCheckedValues.lesson2).toBeUndefined()
      expect(result.runtime.progress.lessonStatuses.lesson2).not.toBe('complete')
      expect(result.persisted.highestUnlockedLesson).toBe(3)
      expect(result.runtime.progress.lessonStatuses.lesson3).not.toBe('locked')
      expect(result.persisted.simulationComplete).toBe(false)
      expect(JSON.parse(storage.getItem(DEFAULT_STORAGE_KEY)!).lastCheckedValues.lesson2).toBeUndefined()
      const restored = loadState(config(storage))!
      expect(restored.persisted.gapValues.lesson2).toEqual(result.persisted.gapValues.lesson2)
      expect(restored.persisted.lastCheckedValues.lesson2).toBeUndefined()
      expect(restored.runtime.progress.lessonStatuses.lesson2).not.toBe('complete')
    })
  }

  it('rejects one stale code check without discarding another valid check or earlier unlocks', () => {
    const storage = memoryStorage()
    const old = oldSave(true)
    old.lastCheckedValues = {
      ...old.lastCheckedValues,
      lesson3: { ...iteration001Code.lesson3, 'model.date': 'wrongDate' },
    }
    storage.setItem(ITERATION001_STORAGE_KEY, JSON.stringify(old))

    const result = loadState(config(storage))!
    expect(result.persisted.gapValues.lesson3).toEqual(iteration001Code.lesson3)
    expect(result.persisted.lastCheckedValues.lesson3).toBeUndefined()
    expect(result.runtime.progress.lessonStatuses.lesson3).not.toBe('complete')
    expect(result.persisted.lastCheckedValues.lesson2).toEqual(iteration001Code.lesson2)
    expect(result.runtime.progress.lessonStatuses.lesson2).toBe('complete')
    expect(result.runtime.progress.lessonStatuses.lesson5).not.toBe('locked')
    expect(result.runtime.simulationComplete).toBe(false)
  })

  it('keeps old progress when migration write fails, while allowing in-memory learning', () => {
    const store = memoryStorage()
    store.setItem(ITERATION001_STORAGE_KEY, JSON.stringify(oldSave(false)))
    const storage = { ...store, setItem() { throw new Error('denied') } } as Storage
    const result = loadState(config(storage))!
    expect(result.error).toContain('cannot be saved')
    expect(result.persisted.gapValues.lesson2).toEqual(iteration001Code.lesson2)
    expect(store.getItem(ITERATION001_STORAGE_KEY)).not.toBeNull()
    expect(store.getItem(DEFAULT_STORAGE_KEY)).toBeNull()
  })

  it('uses the 002 key even if 001 also exists or 002 is invalid', () => {
    const storage = memoryStorage()
    storage.setItem(ITERATION001_STORAGE_KEY, JSON.stringify(oldSave(true)))
    storage.setItem(DEFAULT_STORAGE_KEY, 'invalid json')
    const result = loadState(config(storage))!
    expect(result.corrupted).toBe(true)
    expect(result.migrationNotice).toBeNull()
    expect(result.persisted.highestUnlockedLesson).toBe(1)
  })

  it('prefers valid 002 progress over an older completed save', () => {
    const storage = memoryStorage()
    storage.setItem(ITERATION001_STORAGE_KEY, JSON.stringify(oldSave(true)))
    storage.setItem(DEFAULT_STORAGE_KEY, JSON.stringify({
      schemaVersion: DEFAULT_SCHEMA_VERSION, contentVersion: DEFAULT_CONTENT_VERSION,
      currentLessonId: 'lesson2', highestUnlockedLesson: 2, readingComplete: true,
      gapValues: {}, lastCheckedValues: {}, questionSelections: {},
      checkedQuestionSelections: {}, simulationComplete: false,
    }))
    const result = loadState(config(storage))!
    expect(result.persisted.currentLessonId).toBe('lesson2')
    expect(result.migrationNotice).toBeNull()
    expect(storage.getItem(ITERATION001_STORAGE_KEY)).not.toBeNull()
  })

  it('drops stale completion if a question selection was changed without checking', () => {
    const storage = memoryStorage()
    const values = checkedCode()
    const selected = Object.fromEntries(questions.map(q => [q.id, q.correctChoiceId]))
    const checked = { ...selected, 'lesson2.binding': 'B' }
    storage.setItem(DEFAULT_STORAGE_KEY, JSON.stringify({
      schemaVersion: DEFAULT_SCHEMA_VERSION, contentVersion: DEFAULT_CONTENT_VERSION,
      currentLessonId: 'lesson5', highestUnlockedLesson: 5, readingComplete: true,
      gapValues: values, lastCheckedValues: values, questionSelections: selected,
      checkedQuestionSelections: checked, simulationComplete: true,
    }))
    const result = loadState(config(storage))!
    expect(result.persisted.simulationComplete).toBe(false)
    expect(result.runtime.simulationComplete).toBe(false)
    expect(result.runtime.progress.lessonStatuses.lesson5).toBe('complete') // code pass retained
  })

  it('handles denied reads without throwing', () => {
    const storage = { getItem() { throw new Error('denied') } } as unknown as Storage
    const result = loadState(config(storage))!
    expect(result.error).toContain('cannot be saved')
    expect(result.persisted.currentLessonId).toBe('lesson1')
  })

  it('does not unlock next lesson for code alone, even after refresh', () => {
    const values = checkedCode()
    const progress = deriveProgressState({ lesson2: values.lesson2 }, { lesson2: values.lesson2 }, 2, true, config(memoryStorage()))
    expect(progress.lessonStatuses.lesson2).toBe('complete')
    expect(progress.lessonStatuses.lesson3).toBe('locked')
  })

  it('does not grant a question pass for a selected but unchecked answer or a changed answer', () => {
    for (const id of QUESTION_IDS) {
      const correct = questions.find(q => q.id === id)!.correctChoiceId
      expect(isQuestionPassed(id, undefined, correct)).toBe(false)
      expect(isQuestionPassed(id, correct, correct)).toBe(true)
      expect(isQuestionPassed(id, correct, correct === 'A' ? 'B' : 'A')).toBe(false)
    }
  })

  it('attempts legacy removal even when removal of the current key fails', () => {
    const store = memoryStorage()
    store.setItem(DEFAULT_STORAGE_KEY, 'current')
    store.setItem(ITERATION001_STORAGE_KEY, JSON.stringify(oldSave(true)))
    store.setItem('unrelated', 'keep')
    const attempted: string[] = []
    const storage = {
      ...store,
      removeItem(key: string) {
        attempted.push(key)
        if (key === DEFAULT_STORAGE_KEY) throw new Error('denied')
        store.removeItem(key)
      },
    } as Storage
    expect(() => clearState(config(storage))).not.toThrow()
    expect(attempted).toEqual([DEFAULT_STORAGE_KEY, ITERATION001_STORAGE_KEY])
    expect(store.getItem(ITERATION001_STORAGE_KEY)).toBeNull()
    expect(store.getItem('unrelated')).toBe('keep')
    // Reset saves fresh progress after removal, even if removal was denied.
    expect(saveState(makeFreshPersistedState(config(storage)), config(storage))).toBeNull()
    const restored = loadState(config(store))!
    expect(restored.persisted.currentLessonId).toBe('lesson1')
    expect(restored.persisted.gapValues).toEqual({})
    expect(restored.migrationNotice).toBeNull()
  })

  it('removes only tutorial keys on reset', () => {
    const storage = memoryStorage()
    for (const key of [DEFAULT_STORAGE_KEY, ITERATION001_STORAGE_KEY, 'unrelated']) storage.setItem(key, 'saved')
    clearState(config(storage))
    expect(storage.getItem(DEFAULT_STORAGE_KEY)).toBeNull()
    expect(storage.getItem(ITERATION001_STORAGE_KEY)).toBeNull()
    expect(storage.getItem('unrelated')).toBe('saved')
  })
})
