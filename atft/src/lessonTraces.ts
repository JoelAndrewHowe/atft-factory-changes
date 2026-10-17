import {
  learner, learnerRequestBody, learnerResponseBody, learnerLocation,
  requestLines, serviceBase, statusCreated,
} from './fixtures';
import {
  assembleCode, canonicalAnswers, extractRegion, stripRegionMarkers,
  learnerFeatureFile, learnerImmunizationFile, learnerStepsFile,
} from './lessons';

/** Display-only canonical examples. IDs describe relationships, not positions or text. */
export type TraceLessonId = 'lesson2' | 'lesson3' | 'lesson4' | 'lesson5';
export type LessonTraceEntryId = 'lesson2.given' | 'lesson2.when' | 'lesson2.then'
  | 'lesson3.model' | 'lesson4.request' | 'lesson5.response';
export type LessonTraceConnectionId =
  | 'lesson2.given.binding' | 'lesson2.given.patient'
  | 'lesson2.when.action' | 'lesson2.then.status' | 'lesson2.then.and'
  | 'lesson3.model.date' | 'lesson3.model.patient' | 'lesson3.model.roundtrip'
  | 'lesson4.request.patient' | 'lesson4.request.serialize' | 'lesson4.request.post' | 'lesson4.request.send'
  | 'lesson5.response.status' | 'lesson5.response.deserialize' | 'lesson5.response.lot' | 'lesson5.response.patient';
export interface LessonTraceExcerpt {
  label: string;
  source: string; // named template region/context or fixture field
  content: string;
  highlight: string; // visible token/value on this labelled side of the relationship
}
export interface LessonTraceConnection {
  id: LessonTraceConnectionId;
  title: string;
  excerpts: readonly LessonTraceExcerpt[];
  explanation: string;
}
export interface LessonTraceEntry {
  id: LessonTraceEntryId;
  label: string;
  notice: 'Correct example — your answers are unchanged';
  connections: readonly LessonTraceConnection[];
}

const feature = assembleCode(learnerFeatureFile.segments, canonicalAnswers);
const model = assembleCode(learnerImmunizationFile.segments, canonicalAnswers);
const steps = assembleCode(learnerStepsFile.segments, canonicalAnswers);
const notice = 'Correct example — your answers are unchanged';

// Only named, authored regions and exact template contexts are shown. Neither
// arbitrary learner code nor line numbers are searched to infer a binding.
function region(code: string, name: string): string {
  const value = extractRegion(code, name);
  if (value === undefined) throw new Error(`Missing canonical trace region: ${name}`);
  return stripRegionMarkers(value);
}
function context(code: string, name: string, literal: string): string {
  if (!stripRegionMarkers(code).includes(literal)) throw new Error(`Missing canonical template context: ${name}`);
  return literal;
}
function excerpt(label: string, source: string, content: string, highlight: string): LessonTraceExcerpt {
  return { label, source, content, highlight };
}
const f = (name: string, highlight: string) => excerpt('RecordVaccination.feature', `feature-${name} region`, region(feature, `feature-${name}`), highlight);
const s = (name: string, highlight: string) => excerpt('RecordVaccinationSteps.cs', `${name} region`, region(steps, name), highlight);
const m = (name: string, highlight: string) => excerpt('Immunization.cs', `${name} region`, region(model, name), highlight);
const sc = (name: string, literal: string, highlight: string) => excerpt('RecordVaccinationSteps.cs', `${name} template context`, context(steps, name, literal), highlight);
const mc = (name: string, literal: string, highlight: string) => excerpt('Immunization.cs', `${name} template context`, context(model, name, literal), highlight);
const rq = (field: keyof typeof learnerRequestBody, highlight: string) => excerpt('Request JSON — learner fixture', `learnerRequestBody.${field}`, JSON.stringify({ [field]: learnerRequestBody[field] }, null, 2), highlight);
const rs = (field: keyof typeof learnerResponseBody, highlight: string) => excerpt('Response JSON — learner fixture', `learnerResponseBody.${field}`, JSON.stringify({ [field]: learnerResponseBody[field] }, null, 2), highlight);
const patient = `"reference": "${learner.patientReference}"`;
const lot = `"lotNumber": "${learner.lotNumber}"`;
const date = `"occurrenceDateTime": "${learner.occurrenceDateTime}"`;
const requestBody = excerpt('Request JSON — learner fixture', 'learnerRequestBody', JSON.stringify(learnerRequestBody, null, 2), '"patient": {');
const bindingClass = sc('binding class', '[Binding]\npublic sealed class RecordVaccinationSteps', '[Binding]');
const requestField = sc('request field', 'private Immunization _request = null!;', '_request');
const responseField = sc('response field', 'private HttpResponseMessage _response = null!;', '_response');
const readResponse = sc('response reading', 'var json = await _response.Content.ReadAsStringAsync();', '_response.Content.ReadAsStringAsync()');
const modelPatient = mc('Immunization.Patient', '[JsonPropertyName("patient")]\n    public PatientReference Patient { get; set; } = new();', '[JsonPropertyName("patient")]');

/** Ordered entry points and connections for optional inline lesson panels. */
export const lessonTraces: { readonly [K in TraceLessonId]: readonly LessonTraceEntry[] } = {
  lesson2: [
    {
      id: 'lesson2.given', label: 'Given: from words to request data', notice,
      connections: [
        {
          id: 'lesson2.given.binding', title: 'Given words select a binding',
          excerpts: [f('given', 'Given a vaccination for patient "Patient/patient-001"'), bindingClass,
            s('given-binding', '[Given("a vaccination for patient {string}")]'),
            s('given-binding', 'GivenAVaccination(string patientReference)')],
          explanation: `Reqnroll matches the Given sentence to the [Given] attribute on the [Binding] class. {string} captures "${learner.patientReference}" and supplies the patientReference argument. Method name and declaration order do not select the binding.`,
        },
        {
          id: 'lesson2.given.patient', title: 'Captured patient becomes request data',
          excerpts: [f('given', learner.patientReference), s('given-binding', 'patientReference'),
            s('given-body', 'new PatientReference { Reference = patientReference }'), rq('patient', patient)],
          explanation: 'The captured patientReference is assigned to _request.Patient.Reference; serialization places it in the nested request patient.reference field.',
        },
      ],
    },
    {
      id: 'lesson2.when', label: 'When: from words to an action', notice,
      connections: [{
        id: 'lesson2.when.action', title: 'When words select the send action',
        excerpts: [f('when', 'When I submit the vaccination'), s('when-binding', '[When("I submit the vaccination")]'),
          s('when-binding', 'WhenISubmitTheVaccination()'), s('sendasync', '_response = await Client.SendAsync(message)')],
        explanation: 'The [When] expression matches the When sentence, not the method name. The method would send the prepared message and store the response in _response in a real test; this tutorial only simulates it.',
      }],
    },
    {
      id: 'lesson2.then', label: 'Then and And: from words to assertions', notice,
      connections: [
        {
          id: 'lesson2.then.status', title: 'Then captures and checks 201',
          excerpts: [f('then', 'Then the response status is 201'), s('then-status-binding', '[Then("the response status is {int}")]'),
            s('then-status-binding', 'expectedStatus'),
            s('then-status-body', 'Assert.That((int)_response.StatusCode, Is.EqualTo(expectedStatus))')],
          explanation: 'Reqnroll matches the [Then] expression and captures 201 as the integer expectedStatus. The assertion compares _response.StatusCode with that argument.',
        },
        {
          id: 'lesson2.then.and', title: 'And continues Then for data assertions',
          excerpts: [f('then', 'Then the response status is 201'), f('and', 'And the recorded vaccination matches the request'),
            s('then-data-binding', '[Then("the recorded vaccination matches the request")]'),
            s('then-data-binding', 'ThenTheRecordedVaccinationMatches()'),
            s('patient-assertion', 'actual.Patient.Reference, Is.EqualTo(_request.Patient.Reference)'),
            s('lot-assertion', 'actual.LotNumber, Is.EqualTo(_request.LotNumber)')],
          explanation: 'And continues the preceding Then step type, so this [Then] binding checks returned patient and lot data against the request; status alone does not check those fields.',
        },
      ],
    },
  ],
  lesson3: [{
    id: 'lesson3.model', label: 'Model properties and JSON mapping', notice,
    connections: [
      {
        id: 'lesson3.model.date', title: 'Date property and JSON name',
        excerpts: [m('occurrenceDateTime', '[JsonPropertyName("occurrenceDateTime")]'),
          m('occurrenceDateTime', 'public string OccurrenceDateTime'),
          s('given-body', 'OccurrenceDateTime = "2026-01-15"'),
          rq('occurrenceDateTime', date), rs('occurrenceDateTime', date)],
        explanation: `The model initializes OccurrenceDateTime to an empty string; the Given body sets it to ${learner.occurrenceDateTime} on _request. Its JsonPropertyName attribute supplies the JSON field name occurrenceDateTime in both request and response.`,
      },
      {
        id: 'lesson3.model.patient', title: 'Nested patient reference',
        excerpts: [modelPatient, m('patientReference', '[JsonPropertyName("reference")]'),
          m('patientReference', 'public string Reference'),
          rq('patient', patient), rs('patient', patient)],
        explanation: 'Immunization.Patient is a PatientReference; its Reference property maps via [JsonPropertyName("reference")] to nested patient.reference in both bodies, not to a top-level ID.',
      },
      {
        id: 'lesson3.model.roundtrip', title: 'Teaching model maps both ways',
        excerpts: [s('serialize', 'JsonSerializer.Serialize(_request)'), rq('patient', patient),
          rs('id', `"id": "${learnerResponseBody.id}"`), readResponse, s('deserialize', 'JsonSerializer.Deserialize<Immunization>(json)')],
        explanation: 'Serialization maps the request teaching classes to JSON; reading the illustrative response and deserializing maps JSON back into Immunization. The returned imm-001 ID is server-assigned, not sent in the request. No C# runs here.',
      },
    ],
  }],
  lesson4: [{
    id: 'lesson4.request', label: 'Build and send the request', notice,
    connections: [
      {
        id: 'lesson4.request.patient', title: 'Given fills _request',
        excerpts: [f('given', learner.patientReference), s('given-binding', 'patientReference'), requestField,
          s('given-body', 'Reference = patientReference'), rq('patient', patient)],
        explanation: 'The Given binding receives Patient/patient-001 as patientReference, then builds _request with that value in Patient.Reference; the request JSON has nested patient.reference.',
      },
      {
        id: 'lesson4.request.serialize', title: 'Serialize into message content',
        excerpts: [s('serialize', 'JsonSerializer.Serialize(_request)'),
          s('serialize', 'message.Content = new StringContent('), s('serialize', 'application/fhir+json'),
          requestBody],
        explanation: 'JsonSerializer.Serialize(_request) produces the illustrated JSON body; StringContent assigns it to message.Content with application/fhir+json. Preparing content does not send it.',
      },
      {
        id: 'lesson4.request.post', title: 'POST to the collection',
        excerpts: [s('request-message', 'HttpMethod.Post, "Immunization"'),
          excerpt('Service base — learner fixture', 'serviceBase', serviceBase, serviceBase),
          excerpt('Request line — learner fixture', 'requestLines[0] (POST line)', requestLines[0], 'POST https://fhir.example.test/Immunization')],
        explanation: 'HttpMethod.Post and the relative Immunization path combine with the fixture service base to illustrate POST https://fhir.example.test/Immunization.',
      },
      {
        id: 'lesson4.request.send', title: 'Send and store the response',
        excerpts: [s('request-message', 'message'), s('serialize', 'message.Content'),
          s('sendasync', '_response = await Client.SendAsync(message)')],
        explanation: 'Only Client.SendAsync(message) would submit the prepared message in a real test; its result is stored in _response. Simulation only — no request is sent here.',
      },
    ],
  }],
  lesson5: [{
    id: 'lesson5.response', label: 'Verify the response', notice,
    connections: [
      {
        id: 'lesson5.response.status', title: 'Compare returned status to 201',
        excerpts: [excerpt('Illustrative response status — learner fixture', 'statusCreated', `HTTP ${statusCreated} Created`, String(statusCreated)),
          f('then', '201'), s('then-status-binding', 'expectedStatus'), responseField,
          s('then-status-body', 'Assert.That((int)_response.StatusCode, Is.EqualTo(expectedStatus))')],
        explanation: 'The Then binding captures 201 as expectedStatus and compares it with _response.StatusCode. A successful status does not establish equality of returned fields.',
      },
      {
        id: 'lesson5.response.deserialize', title: 'Read returned JSON into actual',
        excerpts: [rs('id', `"id": "${learnerResponseBody.id}"`), rs('patient', patient),
          excerpt('Illustrative Location — learner fixture', 'learnerLocation', learnerLocation, 'imm-001'),
          readResponse, s('deserialize', 'var actual = JsonSerializer.Deserialize<Immunization>(json)')],
        explanation: 'The illustrative response body includes the server-assigned imm-001 ID and nested patient.reference. ReadAsStringAsync obtains JSON; Deserialize<Immunization>(json) maps it into actual in the illustrated C# test, not in this tutorial.',
      },
      {
        id: 'lesson5.response.lot', title: 'Compare returned and submitted lot',
        excerpts: [rs('lotNumber', lot), rq('lotNumber', lot), s('lot-assertion', 'actual.LotNumber, Is.EqualTo(_request.LotNumber)')],
        explanation: 'Assert.That(actual.LotNumber, Is.EqualTo(_request.LotNumber)) checks TRAINING-FLU-001 returned against TRAINING-FLU-001 submitted. HTTP 201 alone cannot prove data equality.',
      },
      {
        id: 'lesson5.response.patient', title: 'Compare returned and submitted patient',
        excerpts: [rs('patient', patient), rq('patient', patient), s('patient-assertion', 'actual.Patient.Reference, Is.EqualTo(_request.Patient.Reference)')],
        explanation: 'Assert.That(actual.Patient.Reference, Is.EqualTo(_request.Patient.Reference)) compares the returned and submitted nested Patient/patient-001 references.',
      },
    ],
  }],
};
