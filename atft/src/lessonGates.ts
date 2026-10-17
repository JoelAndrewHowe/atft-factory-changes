import { lessons } from './lessons';
import type { ProgressState, LessonStatus } from './progression';
import { getQuestionsForLesson, isQuestionPassed, type QuestionId } from './questions';

type Choice = 'A' | 'B' | 'C';
type Selections = Partial<Record<QuestionId, Choice>>;
export type GateStatus = LessonStatus | 'needs-understanding';

export interface LessonGate {
  status: GateStatus;
  codePassed: boolean;
  understandingPassed: number;
  understandingTotal: number;
  complete: boolean;
}

export function evaluateLessonGate(
  lessonId: string,
  codeStatus: LessonStatus,
  checked: Selections,
  selected: Selections,
): LessonGate {
  const assigned = getQuestionsForLesson(lessonId);
  const passed = assigned.filter(q => isQuestionPassed(q.id, checked[q.id], selected[q.id])).length;
  const codePassed = codeStatus === 'complete';
  const complete = codePassed && passed === assigned.length;
  return {
    status: codeStatus === 'locked' ? 'locked' : codePassed && !complete ? 'needs-understanding' : codeStatus,
    codePassed,
    understandingPassed: passed,
    understandingTotal: assigned.length,
    complete,
  };
}

export function evaluateTutorialGates(
  progress: ProgressState,
  readingComplete: boolean,
  checked: Selections,
  selected: Selections,
): { lessons: Record<string, LessonGate>; canRunSimulation: boolean } {
  const gates = Object.fromEntries(lessons.map(lesson => [
    lesson.id,
    evaluateLessonGate(lesson.id, progress.lessonStatuses[lesson.id] ?? 'locked', checked, selected),
  ])) as Record<string, LessonGate>;
  return {
    lessons: gates,
    canRunSimulation: readingComplete && lessons.every(lesson => gates[lesson.id].complete),
  };
}
