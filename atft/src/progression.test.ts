import { describe, expect, it } from 'vitest';
import { lessons } from './lessons';
import {
  createProgressionEngine,
  type LessonStatus,
  type ProgressState,
} from './progression';

const LESSON_IDS = lessons.map((l) => l.id);

const {
  allComplete,
  canRunSimulation,
  completeLesson,
  createInitialProgress,
  getLessonStatus,
  isLessonAvailable,
  resetProgress,
  setGapValue,
} = createProgressionEngine(LESSON_IDS);

function statusMap(state: ProgressState): Record<string, LessonStatus> {
  const map: Record<string, LessonStatus> = {};
  for (const id of LESSON_IDS) {
    map[id] = getLessonStatus(state, id);
  }
  return map;
}

describe('engine decoupling', () => {
  it('works with an alternative lesson set', () => {
    const engine = createProgressionEngine(['a', 'b', 'c']);
    let state = engine.createInitialProgress();
    expect(engine.getLessonStatus(state, 'a')).toBe('available');
    expect(engine.getLessonStatus(state, 'b')).toBe('locked');
    state = engine.completeLesson(state, 'a');
    expect(engine.getLessonStatus(state, 'b')).toBe('available');
    expect(engine.getLessonStatus(state, 'c')).toBe('locked');
  });
});

describe('createInitialProgress', () => {
  it('has lesson1 available and the rest locked', () => {
    const state = createInitialProgress();
    expect(statusMap(state)).toEqual({
      lesson1: 'available',
      lesson2: 'locked',
      lesson3: 'locked',
      lesson4: 'locked',
      lesson5: 'locked',
    });
  });

  it('has empty gap values', () => {
    const state = createInitialProgress();
    expect(state.gapValues).toEqual({});
  });
});

describe('getLessonStatus', () => {
  it('throws on unknown lesson id', () => {
    const state = createInitialProgress();
    expect(() => getLessonStatus(state, 'lesson999')).toThrow('Unknown lesson ID');
  });
});

describe('isLessonAvailable', () => {
  it('returns true for available', () => {
    const state = createInitialProgress();
    expect(isLessonAvailable(state, 'lesson1')).toBe(true);
  });

  it('returns false for locked', () => {
    const state = createInitialProgress();
    expect(isLessonAvailable(state, 'lesson2')).toBe(false);
  });

  it('returns true for complete', () => {
    let state = createInitialProgress();
    state = completeLesson(state, 'lesson1');
    expect(isLessonAvailable(state, 'lesson1')).toBe(true);
  });

  it('returns true for needs-check', () => {
    let state = createInitialProgress();
    state = completeLesson(state, 'lesson1');
    state = completeLesson(state, 'lesson2');
    state = setGapValue(state, 'lesson2', 'feature.given', 'Given');
    expect(isLessonAvailable(state, 'lesson2')).toBe(true);
  });
});

describe('completeLesson', () => {
  it('marks a lesson complete', () => {
    let state = createInitialProgress();
    state = completeLesson(state, 'lesson1');
    expect(getLessonStatus(state, 'lesson1')).toBe('complete');
  });

  it('unlocks the next lesson when available completes', () => {
    let state = createInitialProgress();
    state = completeLesson(state, 'lesson1');
    expect(getLessonStatus(state, 'lesson2')).toBe('available');
  });

  it('does not unlock beyond the next lesson', () => {
    let state = createInitialProgress();
    state = completeLesson(state, 'lesson1');
    expect(getLessonStatus(state, 'lesson3')).toBe('locked');
  });

  it('is idempotent for already-complete lessons', () => {
    let state = createInitialProgress();
    state = completeLesson(state, 'lesson1');
    const afterFirst = state;
    state = completeLesson(state, 'lesson1');
    expect(state).toBe(afterFirst);
  });

  it('unlocks lessons sequentially through the chain', () => {
    let state = createInitialProgress();
    for (let i = 0; i < LESSON_IDS.length; i++) {
      const id = LESSON_IDS[i];
      expect(isLessonAvailable(state, id)).toBe(true);
      state = completeLesson(state, id);
      expect(getLessonStatus(state, id)).toBe('complete');
      if (i < LESSON_IDS.length - 1) {
        expect(getLessonStatus(state, LESSON_IDS[i + 1])).toBe('available');
      }
    }
  });

  it('does not re-lock already-unlocked later lessons', () => {
    let state = createInitialProgress();
    state = completeLesson(state, 'lesson1');
    state = completeLesson(state, 'lesson2');
    state = completeLesson(state, 'lesson3');
    // lesson4 is available, lesson5 is locked
    // go back and complete lesson1 again (idempotent)
    state = completeLesson(state, 'lesson1');
    expect(getLessonStatus(state, 'lesson4')).toBe('available');
    expect(getLessonStatus(state, 'lesson5')).toBe('locked');
  });

  it('completing the last lesson does not throw', () => {
    let state = createInitialProgress();
    for (const id of LESSON_IDS) {
      state = completeLesson(state, id);
    }
    expect(getLessonStatus(state, 'lesson5')).toBe('complete');
  });

  it('does not skip unlocking when a locked lesson is completed directly', () => {
    let state = createInitialProgress();
    state = completeLesson(state, 'lesson2');
    expect(getLessonStatus(state, 'lesson1')).toBe('available');
    expect(getLessonStatus(state, 'lesson2')).toBe('complete');
    expect(getLessonStatus(state, 'lesson3')).toBe('available');
  });

  it('throws on unknown lesson id', () => {
    const state = createInitialProgress();
    expect(() => completeLesson(state, 'lesson999')).toThrow('Unknown lesson ID');
  });
});

describe('setGapValue', () => {
  it('stores a gap value for an available lesson without changing status', () => {
    let state = createInitialProgress();
    state = completeLesson(state, 'lesson1');
    state = setGapValue(state, 'lesson2', 'feature.given', 'Given');
    expect(state.gapValues['lesson2']?.['feature.given']).toBe('Given');
    expect(getLessonStatus(state, 'lesson2')).toBe('available');
  });

  it('invalidates a complete lesson to needs-check', () => {
    let state = createInitialProgress();
    state = completeLesson(state, 'lesson1');
    state = completeLesson(state, 'lesson2');
    expect(getLessonStatus(state, 'lesson2')).toBe('complete');
    state = setGapValue(state, 'lesson2', 'feature.given', 'Given');
    expect(getLessonStatus(state, 'lesson2')).toBe('needs-check');
  });

  it('does not invalidate other lessons when one is edited', () => {
    let state = createInitialProgress();
    state = completeLesson(state, 'lesson1');
    state = completeLesson(state, 'lesson2');
    state = completeLesson(state, 'lesson3');
    state = setGapValue(state, 'lesson2', 'feature.given', 'Given');
    expect(getLessonStatus(state, 'lesson2')).toBe('needs-check');
    expect(getLessonStatus(state, 'lesson3')).toBe('complete');
  });

  it('keeps needs-check status when edited again', () => {
    let state = createInitialProgress();
    state = completeLesson(state, 'lesson1');
    state = completeLesson(state, 'lesson2');
    state = setGapValue(state, 'lesson2', 'feature.given', 'Given');
    state = setGapValue(state, 'lesson2', 'feature.patient', 'Patient/patient-001');
    expect(getLessonStatus(state, 'lesson2')).toBe('needs-check');
  });

  it('does not change locked lesson status', () => {
    const state = createInitialProgress();
    const next = setGapValue(state, 'lesson2', 'feature.given', 'Given');
    expect(getLessonStatus(next, 'lesson2')).toBe('locked');
  });

  it('preserves other gap values in the same lesson', () => {
    let state = createInitialProgress();
    state = completeLesson(state, 'lesson1');
    state = setGapValue(state, 'lesson2', 'feature.given', 'Given');
    state = setGapValue(state, 'lesson2', 'feature.when', 'When');
    expect(state.gapValues['lesson2']?.['feature.given']).toBe('Given');
    expect(state.gapValues['lesson2']?.['feature.when']).toBe('When');
  });

  it('preserves gap values in other lessons', () => {
    let state = createInitialProgress();
    state = completeLesson(state, 'lesson1');
    state = setGapValue(state, 'lesson2', 'feature.given', 'Given');
    state = setGapValue(state, 'lesson3', 'model.vaccine', 'CodeableConcept');
    expect(state.gapValues['lesson2']?.['feature.given']).toBe('Given');
    expect(state.gapValues['lesson3']?.['model.vaccine']).toBe('CodeableConcept');
  });

  it('allows setting gap values on a needs-check lesson', () => {
    let state = createInitialProgress();
    state = completeLesson(state, 'lesson1');
    state = completeLesson(state, 'lesson2');
    state = setGapValue(state, 'lesson2', 'feature.given', 'Given');
    state = setGapValue(state, 'lesson2', 'feature.given', 'GivenAgain');
    expect(getLessonStatus(state, 'lesson2')).toBe('needs-check');
    expect(state.gapValues['lesson2']?.['feature.given']).toBe('GivenAgain');
  });

  it('throws on unknown lesson id', () => {
    const state = createInitialProgress();
    expect(() => setGapValue(state, 'lesson999', 'feature.given', 'Given')).toThrow('Unknown lesson ID');
  });
});

describe('allComplete', () => {
  it('returns false initially', () => {
    expect(allComplete(createInitialProgress())).toBe(false);
  });

  it('returns false when some lessons are complete', () => {
    let state = createInitialProgress();
    state = completeLesson(state, 'lesson1');
    state = completeLesson(state, 'lesson2');
    expect(allComplete(state)).toBe(false);
  });

  it('returns true when all lessons are complete', () => {
    let state = createInitialProgress();
    for (const id of LESSON_IDS) {
      state = completeLesson(state, id);
    }
    expect(allComplete(state)).toBe(true);
  });

  it('returns false when a complete lesson is invalidated', () => {
    let state = createInitialProgress();
    for (const id of LESSON_IDS) {
      state = completeLesson(state, id);
    }
    state = setGapValue(state, 'lesson2', 'feature.given', 'Given');
    expect(allComplete(state)).toBe(false);
  });
});

describe('canRunSimulation', () => {
  it('returns false initially', () => {
    expect(canRunSimulation(createInitialProgress())).toBe(false);
  });

  it('returns true when all lessons are complete', () => {
    let state = createInitialProgress();
    for (const id of LESSON_IDS) {
      state = completeLesson(state, id);
    }
    expect(canRunSimulation(state)).toBe(true);
  });

  it('returns false when any lesson is needs-check', () => {
    let state = createInitialProgress();
    for (const id of LESSON_IDS) {
      state = completeLesson(state, id);
    }
    state = setGapValue(state, 'lesson4', 'request.method', 'Post');
    expect(canRunSimulation(state)).toBe(false);
  });

  it('returns false when any lesson is available', () => {
    let state = createInitialProgress();
    state = completeLesson(state, 'lesson1');
    expect(canRunSimulation(state)).toBe(false);
  });
});

describe('resetProgress', () => {
  it('returns an initial progress state', () => {
    const fresh = createInitialProgress();
    const reset = resetProgress();
    expect(statusMap(reset)).toEqual(statusMap(fresh));
    expect(reset.gapValues).toEqual(fresh.gapValues);
  });

  it('returns a distinct object instance', () => {
    const reset1 = resetProgress();
    const reset2 = resetProgress();
    expect(reset1).not.toBe(reset2);
    expect(reset1.lessonStatuses).not.toBe(reset2.lessonStatuses);
  });
});
