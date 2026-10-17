import { assembleCode, extractRegion, learnerFeatureFile, learnerImmunizationFile, learnerStepsFile } from './lessons';
import { learnerRequestBody, learnerResponseBody } from './fixtures';

export interface WalkthroughExcerpt {
  label: string;
  content: string;
  highlight?: string;
}

export interface WalkthroughStage {
  id: string;
  title: string;
  excerpts: WalkthroughExcerpt[];
  explanation: string;
}

// Region IDs map illustration stages to template content, not to interpreted C#.
function region(code: string, id: string, highlight?: number | string): WalkthroughExcerpt {
  const content = extractRegion(code, id) ?? '';
  return { label: 'RecordVaccinationSteps.cs', content, highlight: highlight === undefined ? content.trim() : typeof highlight === 'number' ? content.split('\n')[highlight]?.trim() : highlight };
}

function sentence(code: string, id: string): WalkthroughExcerpt {
  const content = extractRegion(code, id) ?? '';
  return { label: 'RecordVaccination.feature', content, highlight: content.trim() };
}

export function buildWalkthroughStages(allGapValues: Record<string, string>): WalkthroughStage[] {
  const feature = assembleCode(learnerFeatureFile.segments, allGapValues);
  const model = assembleCode(learnerImmunizationFile.segments, allGapValues);
  const steps = assembleCode(learnerStepsFile.segments, allGapValues);
  const requestJson = JSON.stringify(learnerRequestBody, null, 2);
  const responseJson = JSON.stringify(learnerResponseBody, null, 2);
  const jsonExcerpt = (label: string, content: string, highlight: string): WalkthroughExcerpt => ({ label, content, highlight });
  return [
    {
      id: 'wt-given', title: 'Given step: from words to request data',
      excerpts: [sentence(feature, 'feature-given'), region(steps, 'given-binding', 0), region(steps, 'given-body', `Reference = ${allGapValues['request.patient'] ?? ''}`),
        jsonExcerpt('Request JSON', requestJson, '"reference": "Patient/patient-001"')],
      explanation: 'Reqnroll matches the Given sentence to the [Given] attribute, captures the patient reference, and passes it to the method. The value is stored in the request object and serialized as patient.reference.',
    },
    {
      id: 'wt-model', title: 'Model properties and JSON names',
      excerpts: [
        { label: 'Immunization.cs', content: extractRegion(model, 'occurrenceDateTime') ?? '', highlight: (extractRegion(model, 'occurrenceDateTime') ?? '').split('\n')[0]?.trim() },
        jsonExcerpt('Request JSON', requestJson, '"occurrenceDateTime": "2026-01-15"'),
        { label: 'Immunization.cs', content: extractRegion(model, 'patientReference') ?? '', highlight: '[JsonPropertyName("reference")]' },
        jsonExcerpt('Request JSON', requestJson, '"reference": "Patient/patient-001"'),
      ],
      explanation: 'JsonPropertyName attributes map C# properties to JSON fields, including nested PatientReference.Reference → patient.reference. The same classes serialize the request and deserialize the response.',
    },
    {
      id: 'wt-request', title: 'When step: preparing and sending the request',
      excerpts: [sentence(feature, 'feature-when'), region(steps, 'when-binding', 0), region(steps, 'request-message'),
        region(steps, 'serialize'), region(steps, 'sendasync')],
      explanation: 'The When step binds to the method that builds the POST message, sets headers, and calls SendAsync. The response is stored in _response. In this tutorial the call is illustrated without executing it.',
    },
    {
      id: 'wt-status', title: 'Then step: checking the response status',
      excerpts: [sentence(feature, 'feature-then'), region(steps, 'then-status-binding', 0), region(steps, 'then-status-body')],
      explanation: 'The Then step captures the expected status (201) as the integer argument expectedStatus and asserts that the actual response matches it.',
    },
    {
      id: 'wt-data', title: 'And step: checking the returned data',
      excerpts: [sentence(feature, 'feature-and'), region(steps, 'then-data-binding', 0), region(steps, 'deserialize', 0),
        region(steps, 'patient-assertion'), jsonExcerpt('Response JSON', responseJson, '"reference": "Patient/patient-001"'),
        region(steps, 'lot-assertion'), jsonExcerpt('Response JSON', responseJson, '"lotNumber": "TRAINING-FLU-001"')],
      explanation: 'And continues the Then step type. The response body is deserialized and each property is compared with the request. A 201 status alone does not prove the data is correct.',
    },
  ];
}
