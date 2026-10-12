export type LessonStatus = 'locked' | 'available' | 'needs-check' | 'complete';

export interface ProgressState {
  lessonStatuses: Record<string, LessonStatus>;
  gapValues: Record<string, Record<string, string>>;
}

export function createProgressionEngine(lessonIds: readonly string[]) {
  const lessonIdSet = new Set(lessonIds);

  function assertLessonId(lessonId: string): void {
    if (!lessonIdSet.has(lessonId)) {
      throw new Error(`Unknown lesson ID: ${lessonId}`);
    }
  }

  function getNextLessonId(lessonId: string): string | undefined {
    const index = lessonIds.indexOf(lessonId);
    if (index >= 0 && index < lessonIds.length - 1) {
      return lessonIds[index + 1];
    }
    return undefined;
  }

  function createInitialProgress(): ProgressState {
    const lessonStatuses: Record<string, LessonStatus> = {};
    for (let i = 0; i < lessonIds.length; i++) {
      lessonStatuses[lessonIds[i]] = i === 0 ? 'available' : 'locked';
    }
    return {
      lessonStatuses,
      gapValues: {},
    };
  }

  function getLessonStatus(state: ProgressState, lessonId: string): LessonStatus {
    assertLessonId(lessonId);
    return state.lessonStatuses[lessonId] ?? 'locked';
  }

  function isLessonAvailable(state: ProgressState, lessonId: string): boolean {
    return getLessonStatus(state, lessonId) !== 'locked';
  }

  function completeLesson(state: ProgressState, lessonId: string): ProgressState {
    assertLessonId(lessonId);
    const currentStatus = state.lessonStatuses[lessonId];
    if (currentStatus === 'complete') {
      return state;
    }

    const nextId = getNextLessonId(lessonId);
    const newStatuses = { ...state.lessonStatuses, [lessonId]: 'complete' as LessonStatus };
    if (nextId && newStatuses[nextId] === 'locked') {
      newStatuses[nextId] = 'available';
    }

    return {
      ...state,
      lessonStatuses: newStatuses,
    };
  }

  function setGapValue(
    state: ProgressState,
    lessonId: string,
    gapId: string,
    value: string,
  ): ProgressState {
    assertLessonId(lessonId);
    const lessonGapValues = state.gapValues[lessonId] ?? {};
    const newLessonGapValues = { ...lessonGapValues, [gapId]: value };
    const newGapValues = { ...state.gapValues, [lessonId]: newLessonGapValues };

    const currentStatus = state.lessonStatuses[lessonId];
    if (currentStatus === 'complete') {
      return {
        ...state,
        lessonStatuses: { ...state.lessonStatuses, [lessonId]: 'needs-check' },
        gapValues: newGapValues,
      };
    }

    return {
      ...state,
      gapValues: newGapValues,
    };
  }

  function allComplete(state: ProgressState): boolean {
    return lessonIds.every((id) => state.lessonStatuses[id] === 'complete');
  }

  function canRunSimulation(state: ProgressState): boolean {
    return allComplete(state);
  }

  function resetProgress(): ProgressState {
    return createInitialProgress();
  }

  return {
    createInitialProgress,
    getLessonStatus,
    isLessonAvailable,
    completeLesson,
    setGapValue,
    allComplete,
    canRunSimulation,
    resetProgress,
  };
}
