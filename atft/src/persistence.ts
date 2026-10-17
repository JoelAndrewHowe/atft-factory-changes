import type { LessonData } from './lessons';
import { createProgressionEngine, type ProgressState } from './progression';
import { allValid, validateGaps } from './validation';
import { QUESTION_IDS, isQuestionPassed, type QuestionId } from './questions';

export const ITERATION001_STORAGE_KEY = 'atft.iteration001.progress.v1';
export const ITERATION001_SCHEMA_VERSION = 'atft.iteration001.progress.v1';
export const ITERATION001_CONTENT_VERSION = '1';

export const DEFAULT_STORAGE_KEY = 'atft.iteration002.progress.v1';
export const DEFAULT_SCHEMA_VERSION = 'atft.iteration002.progress.v1';
export const DEFAULT_CONTENT_VERSION = '2';

export interface PersistedTutorialState {
  schemaVersion: string;
  contentVersion: string;
  currentLessonId: string;
  highestUnlockedLesson: number;
  readingComplete: boolean;
  gapValues: Record<string, Record<string, string>>;
  lastCheckedValues: Record<string, Record<string, string>>;
  simulationComplete: boolean;
  questionSelections: Partial<Record<QuestionId, 'A' | 'B' | 'C'>>;
  checkedQuestionSelections: Partial<Record<QuestionId, 'A' | 'B' | 'C'>>;
  migrationNoticeShown?: boolean;
}

export interface RuntimeTutorialState {
  currentLessonId: string;
  progress: ProgressState;
  simulationComplete: boolean;
  questionSelections: Partial<Record<QuestionId, 'A' | 'B' | 'C'>>;
  checkedQuestionSelections: Partial<Record<QuestionId, 'A' | 'B' | 'C'>>;
  migrationNoticeShown: boolean;
}

export interface LoadResult {
  runtime: RuntimeTutorialState;
  persisted: PersistedTutorialState;
  corrupted: boolean;
  error: string | null;
  migrationNotice: string | null;
}

export interface PersistenceConfig {
  storage: Storage;
  lessons: LessonData[];
  allGapIds: readonly string[];
  schemaVersion: string;
  contentVersion: string;
  storageKey: string;
}

function getLessonIds(lessons: LessonData[]): string[] {
  return lessons.map((l) => l.id);
}

function isValidGapValues(
  values: unknown,
  config: Pick<PersistenceConfig, 'lessons' | 'allGapIds'>,
): boolean {
  const { lessons, allGapIds } = config;
  if (typeof values !== 'object' || values === null) return false;
  for (const [lessonId, gaps] of Object.entries(values as Record<string, unknown>)) {
    const lesson = lessons.find((l) => l.id === lessonId);
    if (!lesson) return false;
    if (typeof gaps !== 'object' || gaps === null) return false;
    for (const [gapId, value] of Object.entries(gaps as Record<string, unknown>)) {
      if (!allGapIds.includes(gapId)) return false;
      if (typeof value !== 'string') return false;
      if (!lesson.editableGaps.includes(gapId as never)) return false;
    }
  }
  return true;
}

function isValidQuestionSelections(
  values: unknown,
): values is Partial<Record<QuestionId, 'A' | 'B' | 'C'>> {
  if (typeof values !== 'object' || values === null) return false;
  for (const [key, value] of Object.entries(values as Record<string, unknown>)) {
    if (!QUESTION_IDS.includes(key as QuestionId)) return false;
    if (value !== 'A' && value !== 'B' && value !== 'C') return false;
  }
  return true;
}

export function validatePersistedState(
  data: unknown,
  config: Pick<PersistenceConfig, 'schemaVersion' | 'contentVersion' | 'lessons' | 'allGapIds'>,
): data is PersistedTutorialState {
  const { schemaVersion, contentVersion, lessons, allGapIds } = config;
  if (typeof data !== 'object' || data === null) return false;
  const d = data as Record<string, unknown>;

  if (d.schemaVersion !== schemaVersion) return false;
  if (d.contentVersion !== contentVersion) return false;

  const lessonIds = getLessonIds(lessons);

  if (typeof d.currentLessonId !== 'string') return false;
  if (!lessonIds.includes(d.currentLessonId)) return false;

  if (typeof d.highestUnlockedLesson !== 'number') return false;
  if (!Number.isInteger(d.highestUnlockedLesson)) return false;
  if (d.highestUnlockedLesson < 1 || d.highestUnlockedLesson > lessons.length) return false;

  if (typeof d.readingComplete !== 'boolean') return false;
  if (d.highestUnlockedLesson > 1 && !d.readingComplete) return false;

  if (!isValidGapValues(d.gapValues, { lessons, allGapIds })) return false;
  if (!isValidGapValues(d.lastCheckedValues, { lessons, allGapIds })) return false;

  if (typeof d.simulationComplete !== 'boolean') return false;

  // Both maps are required in iteration 002. A missing map must not be
  // accepted as valid state that the UI then tries to read.
  if (!isValidQuestionSelections(d.questionSelections)) return false;
  if (!isValidQuestionSelections(d.checkedQuestionSelections)) return false;

  return true;
}

// Remove the submission itself on edit, not just its current-value match.
// Otherwise restoring the old text would silently reinstate a code pass.
export function invalidateCodeCheck(state: PersistedTutorialState, lessonId: string): PersistedTutorialState {
  const lastCheckedValues = { ...state.lastCheckedValues };
  delete lastCheckedValues[lessonId];
  return { ...state, lastCheckedValues, simulationComplete: false };
}

export function deriveProgressState(
  gapValues: Record<string, Record<string, string>>,
  lastCheckedValues: Record<string, Record<string, string>>,
  highestUnlockedLesson: number,
  readingComplete: boolean,
  config: Pick<PersistenceConfig, 'lessons' | 'allGapIds'>,
): ProgressState {
  const { lessons } = config;
  const lessonIds = getLessonIds(lessons);
  const engine = createProgressionEngine(lessonIds);
  let state = engine.createInitialProgress();

  const highestIndex = Math.min(Math.max(1, highestUnlockedLesson), lessons.length);
  for (let i = 1; i < highestIndex; i++) {
    const lessonId = lessons[i].id;
    if (state.lessonStatuses[lessonId] === 'locked') {
      state = {
        ...state,
        lessonStatuses: { ...state.lessonStatuses, [lessonId]: 'available' as const },
      };
    }
  }

  for (const [lessonId, gaps] of Object.entries(gapValues)) {
    if (!lessonIds.includes(lessonId)) continue;
    for (const [gapId, value] of Object.entries(gaps)) {
      state = engine.setGapValue(state, lessonId, gapId, value);
    }
  }

  if (readingComplete) {
    state = engine.completeLesson(state, lessons[0].id);
  }

  for (const lesson of lessons) {
    if (lesson.type === 'reading') continue;

    const lastChecked = lastCheckedValues[lesson.id];
    if (!lastChecked) continue;

    const current = state.gapValues[lesson.id] ?? {};
    const matches = lesson.editableGaps.every((gapId) => current[gapId] === lastChecked[gapId]);
    if (!matches) continue;

    const results = validateGaps(lesson.editableGaps as never, current as never);
    if (allValid(results)) {
      // A valid code check is independent of the understanding gate. Only
      // highestUnlockedLesson records navigation that was actually earned.
      state = {
        ...state,
        lessonStatuses: { ...state.lessonStatuses, [lesson.id]: 'complete' },
      };
    }
  }

  for (const lesson of lessons) {
    const status = state.lessonStatuses[lesson.id];
    if (status !== 'available' && status !== 'complete') continue;
    if (lesson.type === 'reading') continue;

    const current = state.gapValues[lesson.id] ?? {};
    const lastChecked = lastCheckedValues[lesson.id];

    if (!lastChecked) {
      const hasAnyValue = lesson.editableGaps.some((gapId) => (current[gapId] ?? '').length > 0);
      if (hasAnyValue) {
        state = {
          ...state,
          lessonStatuses: { ...state.lessonStatuses, [lesson.id]: 'needs-check' as const },
        };
      }
      continue;
    }

    const matches = lesson.editableGaps.every((gapId) => current[gapId] === lastChecked[gapId]);
    if (!matches) {
      state = {
        ...state,
        lessonStatuses: { ...state.lessonStatuses, [lesson.id]: 'needs-check' as const },
      };
    }
  }

  return state;
}

function makeFreshRuntimeState(config: Pick<PersistenceConfig, 'lessons'>): RuntimeTutorialState {
  const lessonIds = getLessonIds(config.lessons);
  const engine = createProgressionEngine(lessonIds);
  return {
    currentLessonId: config.lessons[0].id,
    progress: engine.createInitialProgress(),
    simulationComplete: false,
    questionSelections: {},
    checkedQuestionSelections: {},
    migrationNoticeShown: false,
  };
}

export function makeFreshPersistedState(config: PersistenceConfig): PersistedTutorialState {
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
  };
}

function isValidIteration001State(
  data: unknown,
  config: Pick<PersistenceConfig, 'lessons' | 'allGapIds'>,
): boolean {
  if (typeof data !== 'object' || data === null) return false;
  const d = data as Record<string, unknown>;

  if (d.schemaVersion !== ITERATION001_SCHEMA_VERSION) return false;
  if (d.contentVersion !== ITERATION001_CONTENT_VERSION) return false;

  const lessonIds = getLessonIds(config.lessons);
  if (typeof d.currentLessonId !== 'string') return false;
  if (!lessonIds.includes(d.currentLessonId)) return false;

  if (typeof d.highestUnlockedLesson !== 'number') return false;
  if (!Number.isInteger(d.highestUnlockedLesson)) return false;
  if (d.highestUnlockedLesson < 1 || d.highestUnlockedLesson > config.lessons.length) return false;

  if (typeof d.readingComplete !== 'boolean') return false;
  if (d.highestUnlockedLesson > 1 && !d.readingComplete) return false;

  if (!isValidGapValues(d.gapValues, config)) return false;
  if (!isValidGapValues(d.lastCheckedValues, config)) return false;

  if (typeof d.simulationComplete !== 'boolean') return false;

  return true;
}

function migrateIteration001State(
  data: unknown,
  config: PersistenceConfig,
): { persisted: PersistedTutorialState; migrationNotice: string | null } {
  if (!isValidIteration001State(data, config)) {
    return { persisted: makeFreshPersistedState(config), migrationNotice: null };
  }

  const old = data as Record<string, unknown> & {
    currentLessonId: string;
    highestUnlockedLesson: number;
    readingComplete: boolean;
    gapValues: Record<string, Record<string, string>>;
    lastCheckedValues: Record<string, Record<string, string>>;
    simulationComplete: boolean;
  };

  // Revalidate code checks against canonical answers
  const revalidatedLastChecked: Record<string, Record<string, string>> = {};
  for (const lesson of config.lessons) {
    if (lesson.type !== 'coding') continue;
    const lastChecked = old.lastCheckedValues[lesson.id];
    if (!lastChecked) continue;
    const current = old.gapValues[lesson.id] ?? {};
    const matches = lesson.editableGaps.every((gapId) => current[gapId] === lastChecked[gapId]);
    if (matches) {
      const results = validateGaps(lesson.editableGaps as never, current as never);
      if (allValid(results)) {
        revalidatedLastChecked[lesson.id] = { ...lastChecked };
      }
    }
  }

  const migrated: PersistedTutorialState = {
    schemaVersion: config.schemaVersion,
    contentVersion: config.contentVersion,
    currentLessonId: old.currentLessonId,
    highestUnlockedLesson: old.highestUnlockedLesson,
    readingComplete: old.readingComplete,
    gapValues: { ...old.gapValues },
    lastCheckedValues: revalidatedLastChecked,
    simulationComplete: false,
    questionSelections: {},
    checkedQuestionSelections: {},
    migrationNoticeShown: true,
  };

  return {
    persisted: migrated,
    migrationNotice:
      "We've added checks to help you understand how the test fits together. Your work is saved. Complete the new checks to finish the updated tutorial.",
  };
}

function invalidStoredState(config: PersistenceConfig, error: string): LoadResult {
  return {
    runtime: makeFreshRuntimeState(config),
    persisted: makeFreshPersistedState(config),
    corrupted: true,
    error,
    migrationNotice: null,
  };
}

function storageReadFailure(config: PersistenceConfig): LoadResult {
  return invalidStoredState(config, 'Progress cannot be saved in this browser session.');
}

export function loadState(config: PersistenceConfig): LoadResult | null {
  let raw: string | null;
  try {
    raw = config.storage.getItem(config.storageKey);
  } catch {
    return storageReadFailure(config);
  }
  if (raw === null) {
    // Check for iteration 001 state to migrate
    let oldRaw: string | null;
    try {
      oldRaw = config.storage.getItem(ITERATION001_STORAGE_KEY);
    } catch {
      return storageReadFailure(config);
    }
    if (oldRaw !== null) {
      let oldParsed: unknown;
      try {
        oldParsed = JSON.parse(oldRaw);
      } catch {
        return invalidStoredState(config, 'Saved progress was corrupted and has been reset.');
      }
      const migrated = migrateIteration001State(oldParsed, config);
      if (migrated.migrationNotice) {
        // Save migrated state
        const saveError = saveState(migrated.persisted, config);
        if (!saveError) {
          try {
            config.storage.removeItem(ITERATION001_STORAGE_KEY);
          } catch {
            // ignore removal failure
          }
        }
        const progress = deriveProgressState(
          migrated.persisted.gapValues,
          migrated.persisted.lastCheckedValues,
          migrated.persisted.highestUnlockedLesson,
          migrated.persisted.readingComplete,
          config,
        );
        const lessonIds = getLessonIds(config.lessons);
        const allComplete = lessonIds.every((id) => progress.lessonStatuses[id] === 'complete');
        return {
          runtime: {
            currentLessonId: migrated.persisted.currentLessonId,
            progress,
            simulationComplete: allComplete ? migrated.persisted.simulationComplete : false,
            questionSelections: migrated.persisted.questionSelections,
            checkedQuestionSelections: migrated.persisted.checkedQuestionSelections,
            migrationNoticeShown: true,
          },
          persisted: migrated.persisted,
          corrupted: false,
          error: saveError,
          migrationNotice: saveError
            ? "We've added checks to help you understand how the test fits together. Your earlier work remains in its old save, but changes in this session cannot currently be saved. Complete the new checks to finish the updated tutorial."
            : migrated.migrationNotice,
        };
      }
      return invalidStoredState(config, 'Saved progress is from an incompatible version and has been reset.');
    }
    return null;
  }

  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    return invalidStoredState(config, 'Saved progress was corrupted and has been reset.');
  }

  if (!validatePersistedState(parsed, config)) {
    return invalidStoredState(config, 'Saved progress is from an incompatible version and has been reset.');
  }

  const persisted = parsed as PersistedTutorialState;
  const progress = deriveProgressState(
    persisted.gapValues,
    persisted.lastCheckedValues,
    persisted.highestUnlockedLesson,
    persisted.readingComplete,
    config,
  );

  const lessonIds = getLessonIds(config.lessons);
  const allLessonsComplete = lessonIds.every((id) => progress.lessonStatuses[id] === 'complete');
  const allQuestionsComplete = QUESTION_IDS.every((id) =>
    isQuestionPassed(id, persisted.checkedQuestionSelections?.[id], persisted.questionSelections?.[id]),
  );
  const simulationComplete = allLessonsComplete && allQuestionsComplete ? persisted.simulationComplete : false;
  const restored = { ...persisted, simulationComplete };

  return {
    runtime: {
      currentLessonId: persisted.currentLessonId,
      progress,
      simulationComplete,
      questionSelections: persisted.questionSelections ?? {},
      checkedQuestionSelections: persisted.checkedQuestionSelections ?? {},
      migrationNoticeShown: persisted.migrationNoticeShown ?? false,
    },
    persisted: restored,
    corrupted: false,
    error: null,
    migrationNotice: null,
  };
}

export function saveState(state: PersistedTutorialState, config: PersistenceConfig): string | null {
  try {
    const serialized = JSON.stringify(state);
    config.storage.setItem(config.storageKey, serialized);
    return null;
  } catch {
    return 'Progress cannot be saved in this browser session.';
  }
}

export function clearState(config: PersistenceConfig): void {
  // Attempt both independently: a failure removing the current save must not
  // leave the legacy save behind to be migrated on a later visit.
  for (const key of [config.storageKey, ITERATION001_STORAGE_KEY]) {
    try {
      config.storage.removeItem(key);
    } catch {
      // Storage may be denied; the caller still resets in-memory progress.
    }
  }
}
