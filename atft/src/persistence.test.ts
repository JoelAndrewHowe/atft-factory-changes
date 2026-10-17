import { describe, expect, it } from 'vitest';
import {
  clearState,
  DEFAULT_CONTENT_VERSION,
  DEFAULT_SCHEMA_VERSION,
  DEFAULT_STORAGE_KEY,
  deriveProgressState,
  loadState,
  saveState,
  validatePersistedState,
  type LoadResult,
  type PersistenceConfig,
  type PersistedTutorialState,
} from './persistence';
import { ALL_GAP_IDS, lessons, type LessonData } from './lessons';
import { questions } from './questions';

class FakeStorage implements Storage {
  private store = new Map<string, string>();

  get length(): number {
    return this.store.size;
  }

  clear(): void {
    this.store.clear();
  }

  getItem(key: string): string | null {
    return this.store.get(key) ?? null;
  }

  setItem(key: string, value: string): void {
    this.store.set(key, String(value));
  }

  removeItem(key: string): void {
    this.store.delete(key);
  }

  key(index: number): string | null {
    return Array.from(this.store.keys())[index] ?? null;
  }
}

class ThrowingSetStorage extends FakeStorage {
  setItem(): void {
    throw new Error('quota exceeded');
  }
}

class ThrowingRemoveStorage extends FakeStorage {
  removeItem(): void {
    throw new Error('unavailable');
  }
}

function makeDefaultConfig(storage: Storage = new FakeStorage()): PersistenceConfig {
  return {
    storage,
    lessons,
    allGapIds: ALL_GAP_IDS as readonly string[],
    schemaVersion: DEFAULT_SCHEMA_VERSION,
    contentVersion: DEFAULT_CONTENT_VERSION,
    storageKey: DEFAULT_STORAGE_KEY,
  };
}

function makeMinimalPersistedState(
  config: PersistenceConfig,
  overrides: Partial<PersistedTutorialState> = {},
): PersistedTutorialState {
  return {
    schemaVersion: config.schemaVersion,
    contentVersion: config.contentVersion,
    currentLessonId: config.lessons[0].id,
    highestUnlockedLesson: 1,
    readingComplete: false,
    gapValues: {},
    lastCheckedValues: {},
    simulationComplete: false,
    questionSelections: {},
    checkedQuestionSelections: {},
    migrationNoticeShown: false,
    ...overrides,
  };
}

// Helper to assert LoadResult properties when corrupted or fresh.
function expectFreshResult(result: LoadResult, config: PersistenceConfig): void {
  expect(result.corrupted).toBe(true);
  expect(result.runtime.currentLessonId).toBe(config.lessons[0].id);
  expect(result.runtime.simulationComplete).toBe(false);
  expect(result.runtime.progress.lessonStatuses[config.lessons[0].id]).toBe('available');
  for (let i = 1; i < config.lessons.length; i++) {
    expect(result.runtime.progress.lessonStatuses[config.lessons[i].id]).toBe('locked');
  }
}

describe('validatePersistedState with synthetic data', () => {
  const syntheticLessons = [
    {
      id: 'read1',
      number: 1,
      title: 'Read',
      type: 'reading' as const,
      instructions: [],
      editableGaps: [] as never[],
      gapDefinitions: [],
    },
    {
      id: 'code1',
      number: 2,
      title: 'Code',
      type: 'coding' as const,
      instructions: [],
      editableGaps: ['gap.a', 'gap.b'] as never[],
      gapDefinitions: [],
    },
  ] as LessonData[];

  const syntheticConfig: PersistenceConfig = {
    storage: new FakeStorage(),
    lessons: syntheticLessons,
    allGapIds: ['gap.a', 'gap.b'] as readonly string[],
    schemaVersion: 'test-schema',
    contentVersion: 'test-content',
    storageKey: 'test-key',
  };

  it('returns true for a minimal valid state', () => {
    const data = makeMinimalPersistedState(syntheticConfig);
    expect(validatePersistedState(data, syntheticConfig)).toBe(true);
  });

  it('returns false when schemaVersion mismatches', () => {
    const data = makeMinimalPersistedState(syntheticConfig, { schemaVersion: 'wrong' });
    expect(validatePersistedState(data, syntheticConfig)).toBe(false);
  });

  it('returns false when contentVersion mismatches', () => {
    const data = makeMinimalPersistedState(syntheticConfig, { contentVersion: 'wrong' });
    expect(validatePersistedState(data, syntheticConfig)).toBe(false);
  });

  it('returns false for unknown currentLessonId', () => {
    const data = makeMinimalPersistedState(syntheticConfig, { currentLessonId: 'unknown' });
    expect(validatePersistedState(data, syntheticConfig)).toBe(false);
  });

  it('returns false when highestUnlockedLesson is out of range', () => {
    const data = makeMinimalPersistedState(syntheticConfig, { highestUnlockedLesson: 99 });
    expect(validatePersistedState(data, syntheticConfig)).toBe(false);
  });

  it('returns false when gap values contain an unknown lesson', () => {
    const data = makeMinimalPersistedState(syntheticConfig, {
      gapValues: { unknownLesson: { 'gap.a': 'A' } },
    });
    expect(validatePersistedState(data, syntheticConfig)).toBe(false);
  });

  it('returns false when gap values contain a gap not in the lesson', () => {
    const data = makeMinimalPersistedState(syntheticConfig, {
      gapValues: { code1: { 'gap.a': 'A', 'gap.c': 'C' } },
    });
    expect(validatePersistedState(data, syntheticConfig)).toBe(false);
  });

  it('returns false when readingComplete is false but highestUnlockedLesson > 1', () => {
    const data = makeMinimalPersistedState(syntheticConfig, {
      highestUnlockedLesson: 2,
      readingComplete: false,
    });
    expect(validatePersistedState(data, syntheticConfig)).toBe(false);
  });
});

describe('deriveProgressState with real lesson data', () => {
  const config = makeDefaultConfig();

  it('unlocks lessons up to highestUnlockedLesson', () => {
    const progress = deriveProgressState({}, {}, 3, true, config);
    expect(progress.lessonStatuses['lesson1']).toBe('complete');
    expect(progress.lessonStatuses['lesson2']).toBe('available');
    expect(progress.lessonStatuses['lesson3']).toBe('available');
    expect(progress.lessonStatuses['lesson4']).toBe('locked');
    expect(progress.lessonStatuses['lesson5']).toBe('locked');
  });

  it('derives complete status from matching lastCheckedValues', () => {
    const gapValues = {
      lesson2: {
        'feature.given': 'Given',
        'feature.patient': 'Patient/patient-001',
        'feature.when': 'When',
        'feature.then': 'Then',
        'feature.status': '201',
      },
    };
    const lastChecked = { ...gapValues };
    const progress = deriveProgressState(gapValues, lastChecked, 2, true, config);
    expect(progress.lessonStatuses['lesson2']).toBe('complete');
    expect(progress.lessonStatuses['lesson3']).toBe('locked');
  });

  it('marks needs-check when current values differ from lastChecked', () => {
    const gapValues = {
      lesson2: { 'feature.given': 'Wrong' },
    };
    const lastChecked = {
      lesson2: { 'feature.given': 'Given' },
    };
    const progress = deriveProgressState(gapValues, lastChecked, 2, true, config);
    expect(progress.lessonStatuses['lesson2']).toBe('needs-check');
  });

  it('marks needs-check when there are current values but no lastChecked', () => {
    const gapValues = {
      lesson2: { 'feature.given': 'Given' },
    };
    const progress = deriveProgressState(gapValues, {}, 2, true, config);
    expect(progress.lessonStatuses['lesson2']).toBe('needs-check');
  });

  it('preserves later unlocks when earlier lesson is invalidated', () => {
    const gapValues = {
      lesson2: { 'feature.given': 'Wrong' },
    };
    const lastChecked = {
      lesson2: { 'feature.given': 'Given' },
    };
    const progress = deriveProgressState(gapValues, lastChecked, 3, true, config);
    expect(progress.lessonStatuses['lesson2']).toBe('needs-check');
    expect(progress.lessonStatuses['lesson3']).toBe('available');
  });

  it('restores gap values from stored data', () => {
    const gapValues = {
      lesson2: { 'feature.given': 'Giv', 'feature.patient': 'Patient/patient-00' },
    };
    const progress = deriveProgressState(gapValues, {}, 2, true, config);
    expect(progress.gapValues['lesson2']?.['feature.given']).toBe('Giv');
    expect(progress.gapValues['lesson2']?.['feature.patient']).toBe('Patient/patient-00');
  });
});

describe('loadState', () => {
  it('returns null when nothing is stored', () => {
    const config = makeDefaultConfig();
    expect(loadState(config)).toBeNull();
  });

  it.each(['questionSelections', 'checkedQuestionSelections'] as const)(
    'recovers safely when an iteration 002 save omits %s', (field) => {
      const storage = new FakeStorage();
      const config = makeDefaultConfig(storage);
      const saved: Record<string, unknown> = { ...makeMinimalPersistedState(config) };
      delete saved[field];
      storage.setItem(config.storageKey, JSON.stringify(saved));
      const result = loadState(config)!;
      expectFreshResult(result, config);
      expect(result.error).toContain('incompatible');
      expect(result.runtime.questionSelections).toEqual({});
      expect(result.runtime.checkedQuestionSelections).toEqual({});
    },
  );

  it('returns fresh state when schema version mismatches', () => {
    const storage = new FakeStorage();
    const config = makeDefaultConfig(storage);
    const badConfig = { ...config, schemaVersion: 'old-version' };
    storage.setItem(
      config.storageKey,
      JSON.stringify(makeMinimalPersistedState(config)),
    );
    const result = loadState(badConfig)!;
    expectFreshResult(result, badConfig);
    expect(result.error).toContain('incompatible');
  });

  it('returns fresh state for malformed JSON', () => {
    const storage = new FakeStorage();
    const config = makeDefaultConfig(storage);
    storage.setItem(config.storageKey, 'not-json{');
    const result = loadState(config)!;
    expect(result.corrupted).toBe(true);
    expect(result.error).toContain('corrupted');
  });

  it('returns fresh state when currentLessonId is unknown', () => {
    const storage = new FakeStorage();
    const config = makeDefaultConfig(storage);
    storage.setItem(
      config.storageKey,
      JSON.stringify(makeMinimalPersistedState(config, { currentLessonId: 'lesson999' })),
    );
    const result = loadState(config)!;
    expectFreshResult(result, config);
  });

  it('returns fresh state when highestUnlockedLesson is out of range', () => {
    const storage = new FakeStorage();
    const config = makeDefaultConfig(storage);
    storage.setItem(
      config.storageKey,
      JSON.stringify(makeMinimalPersistedState(config, { highestUnlockedLesson: 99 })),
    );
    const result = loadState(config)!;
    expectFreshResult(result, config);
  });

  it('returns fresh state when gap values reference an unknown lesson', () => {
    const storage = new FakeStorage();
    const config = makeDefaultConfig(storage);
    storage.setItem(
      config.storageKey,
      JSON.stringify(
        makeMinimalPersistedState(config, {
          gapValues: { lesson999: { 'feature.given': 'Given' } },
        }),
      ),
    );
    const result = loadState(config)!;
    expectFreshResult(result, config);
  });

  it('returns fresh state when gap values reference a gap not in the lesson', () => {
    const storage = new FakeStorage();
    const config = makeDefaultConfig(storage);
    storage.setItem(
      config.storageKey,
      JSON.stringify(
        makeMinimalPersistedState(config, {
          gapValues: { lesson1: { 'feature.given': 'Given' } },
        }),
      ),
    );
    const result = loadState(config)!;
    expectFreshResult(result, config);
  });

  it('returns fresh state when readingComplete is false but highestUnlockedLesson > 1', () => {
    const storage = new FakeStorage();
    const config = makeDefaultConfig(storage);
    storage.setItem(
      config.storageKey,
      JSON.stringify(
        makeMinimalPersistedState(config, {
          highestUnlockedLesson: 2,
          readingComplete: false,
        }),
      ),
    );
    const result = loadState(config)!;
    expectFreshResult(result, config);
  });

  it('unlocks lessons up to highestUnlockedLesson', () => {
    const storage = new FakeStorage();
    const config = makeDefaultConfig(storage);
    storage.setItem(
      config.storageKey,
      JSON.stringify(
        makeMinimalPersistedState(config, {
          currentLessonId: 'lesson3',
          highestUnlockedLesson: 3,
          readingComplete: true,
        }),
      ),
    );
    const result = loadState(config)!;
    expect(result.corrupted).toBe(false);
    expect(result.runtime.progress.lessonStatuses['lesson1']).toBe('complete');
    expect(result.runtime.progress.lessonStatuses['lesson2']).toBe('available');
    expect(result.runtime.progress.lessonStatuses['lesson3']).toBe('available');
    expect(result.runtime.progress.lessonStatuses['lesson4']).toBe('locked');
    expect(result.runtime.progress.lessonStatuses['lesson5']).toBe('locked');
  });

  it('marks reading lesson complete when readingComplete is true', () => {
    const storage = new FakeStorage();
    const config = makeDefaultConfig(storage);
    storage.setItem(
      config.storageKey,
      JSON.stringify(
        makeMinimalPersistedState(config, {
          highestUnlockedLesson: 2,
          readingComplete: true,
        }),
      ),
    );
    const result = loadState(config)!;
    expect(result.runtime.progress.lessonStatuses['lesson1']).toBe('complete');
    expect(result.runtime.progress.lessonStatuses['lesson2']).toBe('available');
  });

  it('derives complete status from matching lastCheckedValues', () => {
    const storage = new FakeStorage();
    const config = makeDefaultConfig(storage);
    storage.setItem(
      config.storageKey,
      JSON.stringify(
        makeMinimalPersistedState(config, {
          highestUnlockedLesson: 2,
          readingComplete: true,
          gapValues: {
            lesson2: {
              'feature.given': 'Given',
              'feature.patient': 'Patient/patient-001',
              'feature.when': 'When',
              'feature.then': 'Then',
              'feature.status': '201',
            },
          },
          lastCheckedValues: {
            lesson2: {
              'feature.given': 'Given',
              'feature.patient': 'Patient/patient-001',
              'feature.when': 'When',
              'feature.then': 'Then',
              'feature.status': '201',
            },
          },
        }),
      ),
    );
    const result = loadState(config)!;
    expect(result.runtime.progress.lessonStatuses['lesson2']).toBe('complete');
    expect(result.runtime.progress.lessonStatuses['lesson3']).toBe('locked');
  });

  it('marks needs-check when current values differ from lastChecked', () => {
    const storage = new FakeStorage();
    const config = makeDefaultConfig(storage);
    storage.setItem(
      config.storageKey,
      JSON.stringify(
        makeMinimalPersistedState(config, {
          highestUnlockedLesson: 2,
          readingComplete: true,
          gapValues: { lesson2: { 'feature.given': 'Wrong' } },
          lastCheckedValues: { lesson2: { 'feature.given': 'Given' } },
        }),
      ),
    );
    const result = loadState(config)!;
    expect(result.runtime.progress.lessonStatuses['lesson2']).toBe('needs-check');
  });

  it('marks needs-check when there are current values but no lastChecked', () => {
    const storage = new FakeStorage();
    const config = makeDefaultConfig(storage);
    storage.setItem(
      config.storageKey,
      JSON.stringify(
        makeMinimalPersistedState(config, {
          highestUnlockedLesson: 2,
          readingComplete: true,
          gapValues: { lesson2: { 'feature.given': 'Given' } },
          lastCheckedValues: {},
        }),
      ),
    );
    const result = loadState(config)!;
    expect(result.runtime.progress.lessonStatuses['lesson2']).toBe('needs-check');
  });

  it('clears simulationComplete when not all lessons are complete', () => {
    const storage = new FakeStorage();
    const config = makeDefaultConfig(storage);
    storage.setItem(
      config.storageKey,
      JSON.stringify(
        makeMinimalPersistedState(config, {
          highestUnlockedLesson: 3,
          readingComplete: true,
          simulationComplete: true,
        }),
      ),
    );
    const result = loadState(config)!;
    expect(result.runtime.simulationComplete).toBe(false);
  });

  it('preserves simulationComplete when all lessons are complete', () => {
    const storage = new FakeStorage();
    const config = makeDefaultConfig(storage);
    storage.setItem(
      config.storageKey,
      JSON.stringify(
        makeMinimalPersistedState(config, {
          highestUnlockedLesson: 5,
          readingComplete: true,
          gapValues: {
            lesson2: {
              'feature.given': 'Given',
              'feature.patient': 'Patient/patient-001',
              'feature.when': 'When',
              'feature.then': 'Then',
              'feature.status': '201',
            },
            lesson3: {
              'model.vaccine': 'CodeableConcept',
              'model.patient': 'PatientReference',
              'model.date': 'occurrenceDateTime',
            },
            lesson4: {
              'request.status': 'completed',
              'request.patient': 'patientReference',
              'request.method': 'Post',
              'request.endpoint': 'Immunization',
              'request.media': 'application/fhir+json',
            },
            lesson5: {
              'response.status': 'expectedStatus',
              'response.model': 'Immunization',
              'response.patient': '_request.Patient.Reference',
              'response.lot': '_request.LotNumber',
            },
          },
          lastCheckedValues: {
            lesson2: {
              'feature.given': 'Given',
              'feature.patient': 'Patient/patient-001',
              'feature.when': 'When',
              'feature.then': 'Then',
              'feature.status': '201',
            },
            lesson3: {
              'model.vaccine': 'CodeableConcept',
              'model.patient': 'PatientReference',
              'model.date': 'occurrenceDateTime',
            },
            lesson4: {
              'request.status': 'completed',
              'request.patient': 'patientReference',
              'request.method': 'Post',
              'request.endpoint': 'Immunization',
              'request.media': 'application/fhir+json',
            },
            lesson5: {
              'response.status': 'expectedStatus',
              'response.model': 'Immunization',
              'response.patient': '_request.Patient.Reference',
              'response.lot': '_request.LotNumber',
            },
          },
          simulationComplete: true,
          questionSelections: Object.fromEntries(questions.map((q) => [q.id, q.correctChoiceId])),
          checkedQuestionSelections: Object.fromEntries(questions.map((q) => [q.id, q.correctChoiceId])),
        }),
      ),
    );
    const result = loadState(config)!;
    expect(result.runtime.simulationComplete).toBe(true);
    for (const lesson of lessons) {
      expect(result.runtime.progress.lessonStatuses[lesson.id]).toBe('complete');
    }
  });

  it('preserves later unlocks when earlier lesson is invalidated', () => {
    const storage = new FakeStorage();
    const config = makeDefaultConfig(storage);
    storage.setItem(
      config.storageKey,
      JSON.stringify(
        makeMinimalPersistedState(config, {
          currentLessonId: 'lesson3',
          highestUnlockedLesson: 3,
          readingComplete: true,
          gapValues: { lesson2: { 'feature.given': 'Wrong' } },
          lastCheckedValues: { lesson2: { 'feature.given': 'Given' } },
        }),
      ),
    );
    const result = loadState(config)!;
    expect(result.runtime.progress.lessonStatuses['lesson2']).toBe('needs-check');
    expect(result.runtime.progress.lessonStatuses['lesson3']).toBe('available');
  });

  it('restores current lesson id from stored data', () => {
    const storage = new FakeStorage();
    const config = makeDefaultConfig(storage);
    storage.setItem(
      config.storageKey,
      JSON.stringify(
        makeMinimalPersistedState(config, {
          currentLessonId: 'lesson4',
          highestUnlockedLesson: 4,
          readingComplete: true,
        }),
      ),
    );
    const result = loadState(config)!;
    expect(result.runtime.currentLessonId).toBe('lesson4');
  });

  it('restores gap values from stored data', () => {
    const storage = new FakeStorage();
    const config = makeDefaultConfig(storage);
    storage.setItem(
      config.storageKey,
      JSON.stringify(
        makeMinimalPersistedState(config, {
          highestUnlockedLesson: 2,
          readingComplete: true,
          gapValues: {
            lesson2: {
              'feature.given': 'Giv',
              'feature.patient': 'Patient/patient-00',
            },
          },
        }),
      ),
    );
    const result = loadState(config)!;
    expect(result.runtime.progress.gapValues['lesson2']?.['feature.given']).toBe('Giv');
    expect(result.runtime.progress.gapValues['lesson2']?.['feature.patient']).toBe(
      'Patient/patient-00',
    );
  });
});

describe('saveState', () => {
  it('stores valid state in storage', () => {
    const storage = new FakeStorage();
    const config = makeDefaultConfig(storage);
    const state = makeMinimalPersistedState(config, {
      currentLessonId: 'lesson2',
      highestUnlockedLesson: 2,
      readingComplete: true,
      gapValues: { lesson2: { 'feature.given': 'Given' } },
    });
    const error = saveState(state, config);
    expect(error).toBeNull();
    const raw = storage.getItem(config.storageKey);
    expect(raw).not.toBeNull();
    const parsed = JSON.parse(raw!);
    expect(parsed.currentLessonId).toBe('lesson2');
    expect(parsed.schemaVersion).toBe(config.schemaVersion);
  });

  it('catches storage quota errors', () => {
    const storage = new ThrowingSetStorage();
    const config = makeDefaultConfig(storage);
    const error = saveState(makeMinimalPersistedState(config), config);
    expect(error).toBe('Progress cannot be saved in this browser session.');
  });
});

describe('clearState', () => {
  it('removes the storage key', () => {
    const storage = new FakeStorage();
    const config = makeDefaultConfig(storage);
    storage.setItem(config.storageKey, JSON.stringify(makeMinimalPersistedState(config)));
    clearState(config);
    expect(storage.getItem(config.storageKey)).toBeNull();
  });

  it('does not throw when storage is unavailable', () => {
    const storage = new ThrowingRemoveStorage();
    const config = makeDefaultConfig(storage);
    expect(() => clearState(config)).not.toThrow();
  });
});
