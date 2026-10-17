import { lessonTraces } from './lessonTraces';
import type { LessonTraceConnectionId, LessonTraceEntryId, TraceLessonId } from './lessonTraces';

export interface TraceExcerpt {
  label: string;
  content: string;
  highlight: string;
}
export interface TraceConnection {
  id: LessonTraceConnectionId;
  title: string;
  excerpts: TraceExcerpt[];
  explanation: string;
}
export interface TraceDefinition {
  id: LessonTraceEntryId;
  lessonId: TraceLessonId;
  buttonLabel: string;
  panelTitle: string;
  connections: TraceConnection[];
}

// UI adapter only: the authored lessonTraces map owns the canonical content and IDs.
const buttons: Record<LessonTraceEntryId, string> = {
  'lesson2.given': 'Trace this step: Given',
  'lesson2.when': 'Trace this step: When',
  'lesson2.then': 'Trace this step: Then and And',
  'lesson3.model': 'Trace this step: Model and JSON',
  'lesson4.request': 'Trace this step: Build and send request',
  'lesson5.response': 'Trace this step: Verify response',
};

export const traces: TraceDefinition[] = (Object.entries(lessonTraces) as [TraceLessonId, typeof lessonTraces[TraceLessonId]][])
  .flatMap(([lessonId, entries]) => entries.map((entry) => ({
    id: entry.id,
    lessonId,
    buttonLabel: buttons[entry.id],
    panelTitle: entry.label,
    connections: entry.connections.map((connection) => ({
      id: connection.id,
      title: connection.title,
      explanation: connection.explanation,
      excerpts: connection.excerpts.map((item) => ({
        label: `${item.label} — ${item.source}`,
        content: item.content,
        highlight: item.highlight,
      })),
    })),
  })));
