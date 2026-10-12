import type { LessonData } from './lessons';
import { createProgressionEngine, type ProgressState } from './progression';
import { allValid, validateGaps } from './validation';

export const DEFAULT_STORAGE_KEY = 'atft.iteration001.progress.v1';
export const DEFAULT_SCHEMA_VERSION = 'atft.iteration001.progress.v1';
export const DEFAULT_CONTENT_VERSION = '1';

export interface PersistedTutorialState {
  schemaVersion: string;
  contentVersion: string;
  currentLessonId: string;
  highestUnlockedLesson: number;
  readingComplete: boolean;
  gapValues: Record<string, Record<string, string>>;
  lastCheckedValues: Record<string, Record<string, string>>;
  simulationComplete: boolean;
}

export interface RuntimeTutorialState {
  currentLessonId: string;
  progress: ProgressState;
  simulationComplete: boolean;
}

export interface LoadResult {
  runtime: RuntimeTutorialState;
  persisted: PersistedTutorialState;
  corrupted: boolean;
  error: string | null;
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

  return true;
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
      state = engine.completeLesson(state, lesson.id);
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
  };
}

function makeFreshPersistedState(config: PersistenceConfig): PersistedTutorialState {
  return {
    schemaVersion: config.schemaVersion,
    contentVersion: config.contentVersion,
    currentLessonId: config.lessons[0].id,
    highestUnlockedLesson: 1,
    readingComplete: false,
    gapValues: {},
    lastCheckedValues: {},
    simulationComplete: false,
  };
}

export function loadState(config: PersistenceConfig): LoadResult | null {
  const raw = config.storage.getItem(config.storageKey);
  if (raw === null) return null;

  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    return {
      runtime: makeFreshRuntimeState(config),
      persisted: makeFreshPersistedState(config),
      corrupted: true,
      error: 'Saved progress was corrupted and has been reset.',
    };
  }

  if (!validatePersistedState(parsed, config)) {
    return {
      runtime: makeFreshRuntimeState(config),
      persisted: makeFreshPersistedState(config),
      corrupted: true,
      error: 'Saved progress is from an incompatible version and has been reset.',
    };
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
  const simulationComplete = allLessonsComplete ? persisted.simulationComplete : false;

  return {
    runtime: {
      currentLessonId: persisted.currentLessonId,
      progress,
      simulationComplete,
    },
    persisted,
    corrupted: false,
    error: null,
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
  try {
    config.storage.removeItem(config.storageKey);
  } catch {
    // ignore
  }
}
