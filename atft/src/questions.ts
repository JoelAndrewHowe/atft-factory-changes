export type QuestionId =
  | 'lesson2.binding'
  | 'lesson2.patient'
  | 'lesson3.json-name'
  | 'lesson4.send'
  | 'lesson5.assertion';

export interface QuestionChoice {
  id: 'A' | 'B' | 'C';
  text: string;
}

export interface QuestionDefinition {
  id: QuestionId;
  lessonId: string;
  prompt: string;
  question: string;
  choices: QuestionChoice[];
  correctChoiceId: 'A' | 'B' | 'C';
  feedback: Record<'A' | 'B' | 'C', string>;
}

export const questions: QuestionDefinition[] = [
  {
    id: 'lesson2.binding',
    lessonId: 'lesson2',
    prompt: 'Given a vaccination for patient "Patient/patient-001"',
    question: 'How does Reqnroll connect this Gherkin step to a C# method?',
    choices: [
      {
        id: 'A',
        text: 'It matches the step text to a binding attribute such as [Given("a vaccination for patient {string}")], captures the quoted value, and passes it to the method.',
      },
      {
        id: 'B',
        text: 'It converts the sentence into a C# method name and calls that method.',
      },
      {
        id: 'C',
        text: 'It uses the step\'s position in the feature file to choose a method.',
      },
    ],
    correctChoiceId: 'A',
    feedback: {
      A: 'The [Binding] class contains the step definitions. The [Given] expression matches this step, and {string} captures the quoted patient reference for the method\'s patientReference argument.',
      B: 'The method name does not determine which sentence matches. Look at the expression in the [Given] attribute.',
      C: 'Step order determines the scenario\'s sequence, but it does not choose the matching method. Look at the binding attribute\'s expression.',
    },
  },
  {
    id: 'lesson2.patient',
    lessonId: 'lesson2',
    prompt: '',
    question: 'Where does "Patient/patient-001" from the Given step end up in the request JSON?',
    choices: [
      { id: 'A', text: 'patient.reference' },
      { id: 'B', text: 'id' },
      { id: 'C', text: 'vaccineCode.text' },
    ],
    correctChoiceId: 'A',
    feedback: {
      A: 'The captured value becomes patientReference, is assigned to Patient.Reference, and is serialized as patient.reference.',
      B: 'The resource ID identifies the vaccination record and is assigned by the simulated server. Follow the Given method\'s Patient assignment.',
      C: 'vaccineCode.text describes the vaccine. Follow where the Given method stores the patientReference argument.',
    },
  },
  {
    id: 'lesson3.json-name',
    lessonId: 'lesson3',
    prompt: '',
    question: 'What connects the C# property OccurrenceDateTime to the JSON field occurrenceDateTime in this example?',
    choices: [
      { id: 'A', text: 'The property\'s position in the class.' },
      { id: 'B', text: 'Its [JsonPropertyName("occurrenceDateTime")] attribute.' },
      { id: 'C', text: 'The Gherkin step\'s wording.' },
    ],
    correctChoiceId: 'B',
    feedback: {
      A: 'Property order does not specify the JSON name. Inspect the attribute immediately above the property.',
      B: 'JsonPropertyName specifies the JSON field name used when mapping this C# property to or from JSON.',
      C: 'Gherkin selects step bindings; it does not name JSON fields. Inspect the model property\'s attribute.',
    },
  },
  {
    id: 'lesson4.send',
    lessonId: 'lesson4',
    prompt: '',
    question: 'Which statement submits the prepared HTTP request in the illustrated C# test?',
    choices: [
      { id: 'A', text: 'JsonSerializer.Serialize(_request)' },
      { id: 'B', text: 'new HttpRequestMessage(HttpMethod.Post, "Immunization")' },
      { id: 'C', text: 'await Client.SendAsync(message)' },
    ],
    correctChoiceId: 'C',
    feedback: {
      A: 'Serialization produces the JSON content; it does not send it. Find the call on the HTTP client.',
      B: 'Constructing the message prepares its method and URL. Find the call that uses the client to submit it.',
      C: 'SendAsync submits the message and returns the response, which this example stores in _response. This tutorial illustrates that call without executing it.',
    },
  },
  {
    id: 'lesson5.assertion',
    lessonId: 'lesson5',
    prompt: '',
    question: 'Why compare the returned lot number with the submitted one?',
    choices: [
      { id: 'A', text: 'A 201 status automatically guarantees every returned field is correct.' },
      { id: 'B', text: 'A successful HTTP status alone does not prove the returned data matches the request.' },
      { id: 'C', text: 'The comparison changes an incorrect returned lot number to the submitted value.' },
    ],
    correctChoiceId: 'B',
    feedback: {
      A: 'A successful creation status and correct returned data are separate expectations. A field may still differ from what was submitted.',
      B: 'The assertion checks actual.LotNumber against _request.LotNumber. It detects a mismatch even if the response status indicates success.',
      C: 'An assertion checks a condition; it does not repair the response. A mismatch would fail the assertion in a real test.',
    },
  },
];

export const QUESTION_IDS: readonly QuestionId[] = questions.map((q) => q.id);

export function getQuestionsForLesson(lessonId: string): QuestionDefinition[] {
  return questions.filter((q) => q.lessonId === lessonId);
}

export function isQuestionPassed(
  questionId: QuestionId,
  checkedSelection: 'A' | 'B' | 'C' | undefined,
  currentSelection: 'A' | 'B' | 'C' | undefined,
): boolean {
  const question = questions.find((q) => q.id === questionId);
  return !!question && !!currentSelection && checkedSelection === currentSelection && checkedSelection === question.correctChoiceId;
}
