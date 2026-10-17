import { describe, expect, it } from 'vitest';
import { traces } from './traces';
import { assembleCode, canonicalAnswers, learnerFeatureFile, learnerImmunizationFile, learnerStepsFile, stripRegionMarkers } from './lessons';
import { learnerRequestBody, learnerResponseBody, serviceBase, statusCreated } from './fixtures';

describe('traces', () => {
  it('teaches the specified connections in order, including their evidence and explanation', () => {
    const expected: Record<string, Array<[string, string[], RegExp]>> = {
      'lesson2-given': [
        ['l2-given-gherkin', ['Given a vaccination for patient "Patient/patient-001"'], /Reqnroll.*\[Binding\].*attribute.*matches/i],
        ['l2-given-binding', ['[Binding]', '[Given("a vaccination for patient {string}")]', 'GivenAVaccination(string patientReference)'], /\{string\}.*captures.*method name and declaration order do not/i],
        ['l2-given-argument', ['Patient = new PatientReference { Reference = patientReference }'], /captured value.*patientReference.*Reference property/i],
        ['l2-given-serialized', ['"reference": "Patient\/patient-001"'], /patient\.reference.*JSON/i],
      ],
      'lesson2-when': [
        ['l2-when-gherkin', ['When I submit the vaccination'], /action/i],
        ['l2-when-binding', ['[When("I submit the vaccination")]', 'WhenISubmitTheVaccination()'], /expression matches.*method.*attribute.*not.*method name/i],
        ['l2-when-send', ['await Client.SendAsync(message)'], /submit.*real test.*without executing/i],
      ],
      'lesson2-then': [
        ['l2-then-gherkin', ['Then the response status is 201', 'And the recorded vaccination matches the request'], /And continues the preceding Then step type/i],
        ['l2-then-binding', ['[Then("the response status is {int}")]', 'ThenTheResponseStatusIs(int expectedStatus)'], /\{int\} captures 201.*expectedStatus/i],
        ['l2-then-assertion', ['_response.StatusCode', 'Is.EqualTo(expectedStatus)'], /actual HTTP status code.*captured/i],
        ['l2-then-and', ['[Then("the recorded vaccination matches the request")]', 'ThenTheRecordedVaccinationMatches()'], /And continues.*Then.*returned data/i],
      ],
      'lesson3-model': [
        ['l3-property', ['[JsonPropertyName("occurrenceDateTime")]', 'OccurrenceDateTime'], /attribute.*map.*C# property.*JSON field.*Property order.*does not/i],
        ['l3-value', ['"occurrenceDateTime": "2026-01-15"'], /fixed date.*serialized.*attribute supplies the JSON name.*property holds its value/i],
        ['l3-nested-class', ['PatientReference', '[JsonPropertyName("reference")]', 'Reference'], /Reference property.*JSON field name reference/i],
        ['l3-nested-json', ['"reference": "Patient\/patient-001"'], /patient\.reference.*Deserialization maps returned JSON back/i],
      ],
      'lesson4-request': [
        ['l4-given', ['Patient = new PatientReference { Reference = patientReference }', '_request'], /patient value captured.*stored in the _request/i],
        ['l4-post', ['HttpMethod.Post, "Immunization"', 'https://fhir.example.test/Immunization'], /POST.*relative URL.*full URL/i],
        ['l4-serialize', ['JsonSerializer.Serialize(_request)', 'message.Content'], /serialized into JSON.*message body/i],
        ['l4-sendasync', ['await Client.SendAsync(message)'], /submit.*real test.*without executing/i],
        ['l4-storage', ['_response = await Client.SendAsync(message)'], /stored in _response.*Simulation only/i],
      ],
      'lesson5-response': [
        ['l5-status-line', ['HTTP/1.1 201 Created', '_response.StatusCode', 'expectedStatus'], /status code matches.*201.*status alone does not prove.*data/i],
        ['l5-deserialize', ['JsonSerializer.Deserialize<Immunization>(json)'], /response body JSON.*deserialized.*model/i],
        ['l5-lot', ['actual.LotNumber, Is.EqualTo(_request.LotNumber)', '"lotNumber": "TRAINING-FLU-001"'], /returned lot number.*submitted value.*mismatch.*status/i],
        ['l5-patient', ['actual.Patient.Reference, Is.EqualTo(_request.Patient.Reference)', '"reference": "Patient\/patient-001"'], /returned patient reference.*value sent in the request/i],
      ],
    };
    expect(traces.map((trace) => trace.id)).toEqual(Object.keys(expected));
    for (const trace of traces) {
      expect(trace.connections.map((connection) => connection.id)).toEqual(expected[trace.id].map(([id]) => id));
      for (const [connection, [, evidence, explanation]] of trace.connections.map((c, i) => [c, expected[trace.id][i]] as const)) {
        const shown = connection.excerpts.map((excerpt) => excerpt.content).join('\n');
        for (const fragment of evidence) expect(shown, connection.id).toContain(fragment);
        expect(connection.explanation, connection.id).toMatch(explanation);
      }
    }
  });

  it('every highlight string appears in its excerpt content', () => {
    for (const trace of traces) {
      for (const connection of trace.connections) {
        for (const excerpt of connection.excerpts) {
          expect(excerpt.content).not.toMatch(/\/\/ (?:end)?region:/);
          if (excerpt.highlight !== undefined) {
            expect(
              excerpt.content.indexOf(excerpt.highlight),
              `Trace ${trace.id} connection ${connection.id} excerpt "${excerpt.label}" does not contain highlight: ${excerpt.highlight}`,
            ).toBeGreaterThanOrEqual(0);
          }
        }
      }
    }
  });

  it('maps every code and exchange excerpt to the canonical templates and fixtures', () => {
    const files: Record<string, string> = {
      'RecordVaccination.feature': stripRegionMarkers(assembleCode(learnerFeatureFile.segments, canonicalAnswers)),
      'Immunization.cs': stripRegionMarkers(assembleCode(learnerImmunizationFile.segments, canonicalAnswers)),
      'RecordVaccinationSteps.cs': stripRegionMarkers(assembleCode(learnerStepsFile.segments, canonicalAnswers)),
      'Request JSON': JSON.stringify(learnerRequestBody, null, 2),
      'Response JSON': JSON.stringify(learnerResponseBody, null, 2),
      'Response status': `HTTP/1.1 ${statusCreated} Created`,
      'Full URL': `POST ${serviceBase}Immunization`,
    };
    for (const trace of traces) {
      for (const connection of trace.connections) {
        for (const excerpt of connection.excerpts) {
          const source = files[excerpt.label];
          expect(source, `${connection.id}: unknown source ${excerpt.label}`).toBeDefined();
          // Each excerpt is a contiguous canonical block unless it explicitly
          // marks omitted lines with an ellipsis (the response storage excerpt).
          const sourceLines = source.split('\n').map((line) => line.trim());
          const chunks = excerpt.content.split(/\n\s*\.\.\.\s*\n/);
          let cursor = 0;
          for (const chunk of chunks) {
            const lines = chunk.split('\n').map((line) => line.trim());
            const first = sourceLines.findIndex((line, index) => index >= cursor && line === lines[0]);
            expect(first, `${connection.id}: ${excerpt.label} contains a noncanonical block: ${chunk}`).toBeGreaterThanOrEqual(0);
            expect(sourceLines.slice(first, first + lines.length), `${connection.id}: ${excerpt.label} drifted from its canonical source`).toEqual(lines);
            cursor = first + lines.length;
          }
        }
      }
    }
  });
});
