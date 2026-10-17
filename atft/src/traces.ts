import { learnerRequestBody, learnerResponseBody, serviceBase } from './fixtures';
import { assembleCode, canonicalAnswers, extractRegion, getCanonicalCode, learnerFeatureFile, learnerImmunizationFile, learnerStepsFile, stripRegionMarkers } from './lessons';

export interface TraceExcerpt {
  label: string;
  content: string;
  highlight?: string;
}

export interface TraceConnection {
  id: string;
  title: string;
  excerpts: TraceExcerpt[];
  explanation: string;
}

export interface TraceDefinition {
  id: string;
  lessonId: string;
  buttonLabel: string;
  panelTitle: string;
  connections: TraceConnection[];
}

// Canonical lesson traces never depend on (or change) the learner's input.
const featureCode = getCanonicalCode(learnerFeatureFile.segments);
const modelCode = assembleCode(learnerImmunizationFile.segments, canonicalAnswers);
const stepsCode = assembleCode(learnerStepsFile.segments, canonicalAnswers);

function canonicalLine(code: string, text: string): string {
  const line = stripRegionMarkers(code).split('\n').find((candidate) => candidate.trim() === text);
  if (!line) throw new Error(`Missing canonical trace line: ${text}`);
  return line.trim();
}

function canonicalBlock(code: string, start: string, end: string): string {
  const lines = stripRegionMarkers(code).split('\n');
  const first = lines.findIndex((line) => line.trim() === start);
  const last = lines.findIndex((line, index) => index >= first && line.trim() === end);
  if (first < 0 || last < 0) throw new Error(`Missing canonical trace block: ${start} → ${end}`);
  return lines.slice(first, last + 1).join('\n');
}

const requestJson = JSON.stringify(learnerRequestBody, null, 2);
const responseJson = JSON.stringify(learnerResponseBody, null, 2);

export const traces: TraceDefinition[] = [
  {
    id: 'lesson2-given',
    lessonId: 'lesson2',
    buttonLabel: 'Trace this step: Given',
    panelTitle: 'Given: from words to request data',
    connections: [
      {
        id: 'l2-given-gherkin',
        title: 'Gherkin step',
        excerpts: [
          {
            label: 'RecordVaccination.feature',
            content: canonicalLine(featureCode, 'Given a vaccination for patient "Patient/patient-001"'),
            highlight: 'Given a vaccination for patient "Patient/patient-001"',
          },
        ],
        explanation:
          "This Gherkin step describes the scenario's starting state. Reqnroll will search the [Binding] class for an attribute that matches this text.",
      },
      {
        id: 'l2-given-binding',
        title: 'Reqnroll binding',
        excerpts: [
          {
            label: 'RecordVaccinationSteps.cs',
            content:
              canonicalBlock(stepsCode, '[Binding]', 'public void GivenAVaccination(string patientReference)'),
            highlight: '[Given("a vaccination for patient {string}")]',
          },
        ],
        explanation:
          'The [Given] attribute expression matches the step text. The {string} placeholder captures the quoted patient reference. The method name and declaration order do not establish this connection.',
      },
      {
        id: 'l2-given-argument',
        title: 'Captured argument',
        excerpts: [
          {
            label: 'RecordVaccinationSteps.cs',
            content:
              canonicalLine(stepsCode, 'Patient = new PatientReference { Reference = patientReference },'),
            highlight: 'Reference = patientReference',
          },
        ],
        explanation:
          'The captured value is passed as the patientReference argument and assigned to the Reference property of a new PatientReference object.',
      },
      {
        id: 'l2-given-serialized',
        title: 'Serialized request',
        excerpts: [
          {
            label: 'Request JSON',
            content: requestJson,
            highlight: '"reference": "Patient/patient-001"',
          },
        ],
        explanation:
          'When the request object is serialized, the C# property becomes the patient.reference field in the JSON body sent to the API.',
      },
    ],
  },
  {
    id: 'lesson2-when',
    lessonId: 'lesson2',
    buttonLabel: 'Trace this step: When',
    panelTitle: 'When: from words to an action',
    connections: [
      {
        id: 'l2-when-gherkin',
        title: 'Gherkin step',
        excerpts: [
          {
            label: 'RecordVaccination.feature',
            content: canonicalLine(featureCode, 'When I submit the vaccination'),
            highlight: 'When I submit the vaccination',
          },
        ],
        explanation: 'This step describes the action being tested.',
      },
      {
        id: 'l2-when-binding',
        title: 'Reqnroll binding',
        excerpts: [
          {
            label: 'RecordVaccinationSteps.cs',
            content:
              canonicalBlock(stepsCode, '[When("I submit the vaccination")]', 'public async Task WhenISubmitTheVaccination()'),
            highlight: '[When("I submit the vaccination")]',
          },
        ],
        explanation:
          'The [When] expression matches the step text to this method. The connection is made by the attribute, not by the method name.',
      },
      {
        id: 'l2-when-send',
        title: 'Request sending',
        excerpts: [
          {
            label: 'RecordVaccinationSteps.cs',
            content: canonicalLine(stepsCode, '_response = await Client.SendAsync(message);'),
            highlight: 'await Client.SendAsync(message);',
          },
        ],
        explanation:
          'This call would submit the prepared request in a real test. This tutorial illustrates the call without executing it.',
      },
    ],
  },
  {
    id: 'lesson2-then',
    lessonId: 'lesson2',
    buttonLabel: 'Trace this step: Then and And',
    panelTitle: 'Then and And: from words to assertions',
    connections: [
      {
        id: 'l2-then-gherkin',
        title: 'Gherkin assertions',
        excerpts: [
          {
            label: 'RecordVaccination.feature',
            content:
              canonicalBlock(featureCode, 'Then the response status is 201', 'And the recorded vaccination matches the request'),
            highlight: 'Then the response status is 201',
          },
        ],
        explanation:
          'Then introduces an expected outcome. And continues the preceding Then step type, adding another assertion.',
      },
      {
        id: 'l2-then-binding',
        title: 'Status binding',
        excerpts: [
          {
            label: 'RecordVaccinationSteps.cs',
            content:
              canonicalBlock(stepsCode, '[Then("the response status is {int}")]', 'public void ThenTheResponseStatusIs(int expectedStatus)'),
            highlight: '[Then("the response status is {int}")]',
          },
        ],
        explanation:
          'The [Then] expression matches the status step. {int} captures 201 and passes it as expectedStatus.',
      },
      {
        id: 'l2-then-assertion',
        title: 'Status assertion',
        excerpts: [
          {
            label: 'RecordVaccinationSteps.cs',
            content:
              canonicalLine(stepsCode, 'Assert.That((int)_response.StatusCode, Is.EqualTo(expectedStatus));'),
            highlight: 'Is.EqualTo(expectedStatus)',
          },
        ],
        explanation:
          'The assertion compares the actual HTTP status code with the value captured from the Gherkin step.',
      },
      {
        id: 'l2-then-and',
        title: 'And binding',
        excerpts: [
          {
            label: 'RecordVaccinationSteps.cs',
            content:
              canonicalBlock(stepsCode, '[Then("the recorded vaccination matches the request")]', 'public async Task ThenTheRecordedVaccinationMatches()'),
            highlight: '[Then("the recorded vaccination matches the request")]',
          },
        ],
        explanation:
          'And continues the preceding Then step type. This second [Then] binding verifies the returned data against the request.',
      },
    ],
  },
  {
    id: 'lesson3-model',
    lessonId: 'lesson3',
    buttonLabel: 'Trace this step: Model and JSON',
    panelTitle: 'Model properties and JSON mapping',
    connections: [
      {
        id: 'l3-property',
        title: 'C# property and JSON name',
        excerpts: [
          {
            label: 'Immunization.cs',
            content: extractRegion(modelCode, 'occurrenceDateTime') ?? '',
            highlight: '[JsonPropertyName("occurrenceDateTime")]',
          },
        ],
        explanation:
          'The [JsonPropertyName] attribute tells System.Text.Json to map this C# property to the JSON field occurrenceDateTime. Property order in the class does not determine the JSON name.',
      },
      {
        id: 'l3-value',
        title: 'Serialized value',
        excerpts: [
          {
            label: 'Request JSON',
            content: requestJson,
            highlight: '"occurrenceDateTime": "2026-01-15"',
          },
        ],
        explanation:
          'The fixed date from the scenario setup is serialized into this JSON field. The attribute supplies the JSON name while the C# property holds its value.',
      },
      {
        id: 'l3-nested-class',
        title: 'Nested reference class',
        excerpts: [
          {
            label: 'Immunization.cs',
            content: extractRegion(modelCode, 'patientReference') ?? '',
            highlight: '[JsonPropertyName("reference")]',
          },
        ],
        explanation:
          'The PatientReference class also uses JsonPropertyName to map its Reference property to the JSON field name reference.',
      },
      {
        id: 'l3-nested-json',
        title: 'Nested JSON result',
        excerpts: [
          {
            label: 'Request JSON',
            content: requestJson,
            highlight: '"reference": "Patient/patient-001"',
          },
        ],
        explanation:
          'The nested C# property becomes the nested JSON field patient.reference. Deserialization maps returned JSON back into these same classes.',
      },
    ],
  },
  {
    id: 'lesson4-request',
    lessonId: 'lesson4',
    buttonLabel: 'Trace this step: Build and send request',
    panelTitle: 'Building the request and sending it',
    connections: [
      {
        id: 'l4-given',
        title: 'Given builds the request',
        excerpts: [
          {
            label: 'RecordVaccinationSteps.cs',
            content: extractRegion(stepsCode, 'given-body') ?? '',
            highlight: 'Patient = new PatientReference { Reference = patientReference }',
          },
        ],
        explanation:
          'The patient value captured from the Gherkin step is stored in the _request object.',
      },
      {
        id: 'l4-post',
        title: 'POST and URL',
        excerpts: [
          {
            label: 'RecordVaccinationSteps.cs',
            content: extractRegion(stepsCode, 'request-message') ?? '',
            highlight: 'HttpMethod.Post, "Immunization"',
          },
          {
            label: 'Full URL',
            content: `POST ${serviceBase}Immunization`,
            highlight: `${serviceBase}Immunization`,
          },
        ],
        explanation:
          `The message uses POST and the Immunization relative URL. In a real test, the full URL would be ${serviceBase}Immunization.`,
      },
      {
        id: 'l4-serialize',
        title: 'Serialize to JSON',
        excerpts: [
          {
            label: 'RecordVaccinationSteps.cs',
            content: extractRegion(stepsCode, 'serialize') ?? '',
            highlight: 'JsonSerializer.Serialize(_request)',
          },
        ],
        explanation:
          'The _request object is serialized into JSON and placed in the message body.',
      },
      {
        id: 'l4-sendasync',
        title: 'Send the request',
        excerpts: [
          {
            label: 'RecordVaccinationSteps.cs',
            content: extractRegion(stepsCode, 'sendasync') ?? '',
            highlight: 'await Client.SendAsync(message);',
          },
        ],
        explanation:
          'SendAsync would submit the message in a real test. This tutorial illustrates the call without executing it.',
      },
      {
        id: 'l4-storage',
        title: 'Store the response',
        excerpts: [
          {
            label: 'RecordVaccinationSteps.cs',
            content:
              '    private HttpResponseMessage _response = null!;\n    ...\n        _response = await Client.SendAsync(message);',
            highlight: '_response = await Client.SendAsync(message);',
          },
        ],
        explanation:
          'The result is stored in _response so the Then assertions can inspect it. Simulation only — no request is actually sent.',
      },
    ],
  },
  {
    id: 'lesson5-response',
    lessonId: 'lesson5',
    buttonLabel: 'Trace this step: Verify response',
    panelTitle: 'Verifying the response',
    connections: [
      {
        id: 'l5-status-line',
        title: 'Illustrative 201 response',
        excerpts: [
          {
            label: 'Response status',
            content: 'HTTP/1.1 201 Created',
            highlight: '201 Created',
          },
          {
            label: 'RecordVaccinationSteps.cs',
            content: extractRegion(stepsCode, 'then-status-body') ?? '',
            highlight: 'Is.EqualTo(expectedStatus)',
          },
        ],
        explanation:
          'The Then step checks that the response status code matches the expected 201. A successful HTTP status alone does not prove the returned data is correct.',
      },
      {
        id: 'l5-deserialize',
        title: 'Deserialize',
        excerpts: [
          {
            label: 'RecordVaccinationSteps.cs',
            content: extractRegion(stepsCode, 'deserialize') ?? '',
            highlight: 'JsonSerializer.Deserialize<Immunization>(json)',
          },
        ],
        explanation:
          'The response body JSON is deserialized back into the Immunization model so each property can be asserted individually.',
      },
      {
        id: 'l5-lot',
        title: 'Lot assertion',
        excerpts: [
          {
            label: 'RecordVaccinationSteps.cs',
            content: extractRegion(stepsCode, 'lot-assertion') ?? '',
            highlight: 'actual.LotNumber, Is.EqualTo(_request.LotNumber)',
          },
          {
            label: 'Response JSON',
            content: responseJson,
            highlight: '"lotNumber": "TRAINING-FLU-001"',
          },
        ],
        explanation:
          'This assertion compares the returned lot number with the submitted value. It would detect a mismatch even when the status indicates success.',
      },
      {
        id: 'l5-patient',
        title: 'Patient assertion',
        excerpts: [
          {
            label: 'RecordVaccinationSteps.cs',
            content: extractRegion(stepsCode, 'patient-assertion') ?? '',
            highlight: 'actual.Patient.Reference, Is.EqualTo(_request.Patient.Reference)',
          },
          {
            label: 'Response JSON',
            content: responseJson,
            highlight: '"reference": "Patient/patient-001"',
          },
        ],
        explanation:
          'The returned patient reference is compared with the value sent in the request, checking that the server preserved the association.',
      },
    ],
  },
];
