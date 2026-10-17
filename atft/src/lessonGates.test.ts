import { describe, expect, it } from 'vitest';
import { evaluateLessonGate, evaluateTutorialGates } from './lessonGates';
import type { ProgressState } from './progression';

const correct = {
  'lesson2.binding': 'A', 'lesson2.patient': 'A', 'lesson3.json-name': 'B',
  'lesson4.send': 'C', 'lesson5.assertion': 'B',
} as const;
const codePassed: ProgressState = {
  gapValues: {}, lessonStatuses: {
    lesson1: 'complete', lesson2: 'complete', lesson3: 'complete',
    lesson4: 'complete', lesson5: 'complete',
  },
};

describe('combined lesson and simulation gates', () => {
  it('requires every lesson 2 question to be submitted as well as a current code pass', () => {
    const selected = { 'lesson2.binding': 'A', 'lesson2.patient': 'A' } as const;
    expect(evaluateLessonGate('lesson2', 'complete', {}, selected)).toMatchObject({
      status: 'needs-understanding', understandingPassed: 0, understandingTotal: 2, complete: false,
    });
    expect(evaluateLessonGate('lesson2', 'complete', { 'lesson2.binding': 'A' }, selected)).toMatchObject({
      understandingPassed: 1, complete: false,
    });
    expect(evaluateLessonGate('lesson2', 'complete', selected, selected)).toMatchObject({
      status: 'complete', understandingPassed: 2, complete: true,
    });
  });

  it('completes when code is checked first and then questions are checked', () => {
    expect(evaluateLessonGate('lesson3', 'complete', {}, { 'lesson3.json-name': 'B' }).complete).toBe(false);
    expect(evaluateLessonGate('lesson3', 'complete', { 'lesson3.json-name': 'B' }, { 'lesson3.json-name': 'B' }).complete).toBe(true);
  });

  it('completes when questions are checked first and then code is checked', () => {
    const checked = { 'lesson3.json-name': 'B' } as const;
    expect(evaluateLessonGate('lesson3', 'available', checked, checked)).toMatchObject({
      understandingPassed: 1, codePassed: false, complete: false,
    });
    expect(evaluateLessonGate('lesson3', 'complete', checked, checked).complete).toBe(true);
  });

  it('keeps checks independent after editing code or changing a selection', () => {
    expect(evaluateLessonGate('lesson2', 'needs-check', correct, correct)).toMatchObject({
      understandingPassed: 2, codePassed: false, complete: false,
    });
    expect(evaluateLessonGate('lesson2', 'complete', correct, { ...correct, 'lesson2.binding': 'B' })).toMatchObject({
      understandingPassed: 1, codePassed: true, complete: false,
    });
  });

  it('blocks simulation until reading, all code, and all five submitted correct choices pass', () => {
    expect(evaluateTutorialGates(codePassed, false, correct, correct).canRunSimulation).toBe(false);
    expect(evaluateTutorialGates(codePassed, true, correct, correct).canRunSimulation).toBe(true);
    expect(evaluateTutorialGates(codePassed, true, { ...correct, 'lesson5.assertion': 'A' }, correct).canRunSimulation).toBe(false);
    expect(evaluateTutorialGates({ ...codePassed, lessonStatuses: { ...codePassed.lessonStatuses, lesson4: 'needs-check' } }, true, correct, correct).canRunSimulation).toBe(false);
  });
});
