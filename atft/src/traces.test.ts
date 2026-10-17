import { describe, expect, it } from 'vitest';
import { lessonTraces } from './lessonTraces';
import { traces } from './traces';
import { assembleCode, canonicalAnswers, learnerFeatureFile, learnerImmunizationFile, learnerStepsFile, stripRegionMarkers } from './lessons';
import { learnerRequestBody, learnerResponseBody, learnerLocation, requestLines, serviceBase, statusCreated } from './fixtures';

const orderedIds = [
  ['lesson2.given.binding', 'lesson2.given.patient'],
  ['lesson2.when.action'],
  ['lesson2.then.status', 'lesson2.then.and'],
  ['lesson3.model.date', 'lesson3.model.patient', 'lesson3.model.roundtrip'],
  ['lesson4.request.patient', 'lesson4.request.serialize', 'lesson4.request.post', 'lesson4.request.send'],
  ['lesson5.response.status', 'lesson5.response.deserialize', 'lesson5.response.lot', 'lesson5.response.patient'],
];
const canonical = {
  'RecordVaccination.feature': stripRegionMarkers(assembleCode(learnerFeatureFile.segments, canonicalAnswers)),
  'Immunization.cs': stripRegionMarkers(assembleCode(learnerImmunizationFile.segments, canonicalAnswers)),
  'RecordVaccinationSteps.cs': stripRegionMarkers(assembleCode(learnerStepsFile.segments, canonicalAnswers)),
};

function fixtureSource(source: string): string | undefined {
  if (source === 'learnerRequestBody') return JSON.stringify(learnerRequestBody, null, 2);
  const match = /^(learnerRequestBody|learnerResponseBody)\.(\w+)$/.exec(source);
  if (match) {
    const body = (match[1] === 'learnerRequestBody' ? learnerRequestBody : learnerResponseBody) as unknown as Record<string, unknown>;
    if (!(match[2] in body)) return undefined;
    return JSON.stringify({ [match[2]]: body[match[2]] }, null, 2);
  }
  const fields: Record<string, string> = {
    serviceBase,
    'requestLines[0] (POST line)': requestLines[0],
    statusCreated: `HTTP ${statusCreated} Created`,
    learnerLocation,
  };
  return fields[source];
}

describe('canonical lesson trace content', () => {
  it('has the specified entry order and 16 unique, stable relationship IDs', () => {
    expect(Object.keys(lessonTraces)).toEqual(['lesson2', 'lesson3', 'lesson4', 'lesson5']);
    expect(Object.values(lessonTraces).map((entries) => entries.length)).toEqual([3, 1, 1, 1]);
    expect(traces.map((trace) => trace.connections.map((c) => c.id))).toEqual(orderedIds);
    const ids = orderedIds.flat();
    expect(ids).toHaveLength(16);
    expect(new Set(ids).size).toBe(16);
    for (const trace of traces) {
      expect(trace.connections.every((c) => c.id.startsWith(`${trace.id}.`))).toBe(true);
    }
  });

  it('renders the authored mapping in the UI adapter, including labelled, visible highlights', () => {
    for (const [lessonId, entries] of Object.entries(lessonTraces)) {
      for (const entry of entries) {
        const trace = traces.find((t) => t.id === entry.id);
        expect(trace?.lessonId).toBe(lessonId);
        expect(trace?.panelTitle).toBe(entry.label);
        expect(entry.notice).toBe('Correct example — your answers are unchanged');
        expect(trace?.connections.map((c) => c.id)).toEqual(entry.connections.map((c) => c.id));
        for (const [index, connection] of entry.connections.entries()) {
          expect(connection.explanation.length).toBeGreaterThan(30);
          expect(connection.excerpts.length).toBeGreaterThanOrEqual(2);
          for (const [i, excerpt] of connection.excerpts.entries()) {
            expect(excerpt.label).toBeTruthy();
            expect(excerpt.source).toBeTruthy();
            expect(excerpt.highlight).toBeTruthy();
            expect(excerpt.content, connection.id).toContain(excerpt.highlight);
            expect(excerpt.content).not.toMatch(/\/\/ (?:end)?region:/);
            expect(trace?.connections[index].excerpts[i]).toEqual({
              label: `${excerpt.label} — ${excerpt.source}`,
              content: excerpt.content,
              highlight: excerpt.highlight,
            });
          }
        }
      }
    }
  });

  it('explains the actual teaching relationship for every stable connection ID', () => {
    const claims: Record<string, RegExp[]> = {
      'lesson2.given.binding': [/\[Given\].*attribute.*\[Binding\]/i, /\{string\} captures.*patientReference/i, /method name and declaration order do not select/i],
      'lesson2.given.patient': [/captured patientReference.*_request\.Patient\.Reference/i, /nested request patient\.reference/i],
      'lesson2.when.action': [/\[When\] expression matches.*not the method name/i, /send.*store.*_response.*real test.*simulates/i],
      'lesson2.then.status': [/\[Then\] expression.*captures 201.*integer expectedStatus/i, /compares _response\.StatusCode.*argument/i],
      'lesson2.then.and': [/And continues the preceding Then step type/i, /\[Then\] binding checks returned patient and lot.*request/i],
      'lesson3.model.date': [/Given body sets.*2026-01-15.*_request/i, /JsonPropertyName attribute supplies.*JSON field name occurrenceDateTime.*request and response/i],
      'lesson3.model.patient': [/Immunization\.Patient is a PatientReference/i, /Reference property maps via.*JsonPropertyName.*nested patient\.reference.*both bodies/i],
      'lesson3.model.roundtrip': [/Serialization maps.*request.*JSON/i, /deserializing maps JSON back into Immunization/i, /imm-001.*server-assigned.*not sent in the request/i],
      'lesson4.request.patient': [/Given binding receives Patient\/patient-001 as patientReference/i, /_request.*Patient\.Reference.*nested patient\.reference/i],
      'lesson4.request.serialize': [/Serialize\(_request\).*JSON body/i, /message\.Content.*application\/fhir\+json/i, /Preparing content does not send/i],
      'lesson4.request.post': [/HttpMethod\.Post.*relative Immunization path.*fixture service base.*POST https:\/\/fhir\.example\.test\/Immunization/i],
      'lesson4.request.send': [/Only Client\.SendAsync\(message\) would submit.*real test/i, /result is stored in _response.*Simulation only.*no request is sent/i],
      'lesson5.response.status': [/Then binding captures 201 as expectedStatus.*_response\.StatusCode/i, /status does not establish equality of returned fields/i],
      'lesson5.response.deserialize': [/response body.*server-assigned imm-001.*nested patient\.reference/i, /ReadAsStringAsync obtains JSON.*Deserialize<Immunization>\(json\) maps it into actual/i],
      'lesson5.response.lot': [/actual\.LotNumber.*_request\.LotNumber.*TRAINING-FLU-001 returned.*TRAINING-FLU-001 submitted/i, /HTTP 201 alone cannot prove data equality/i],
      'lesson5.response.patient': [/actual\.Patient\.Reference.*_request\.Patient\.Reference.*returned and submitted nested Patient\/patient-001/i],
    };
    expect(Object.keys(claims).sort()).toEqual(orderedIds.flat().sort());
    for (const trace of traces) for (const connection of trace.connections) {
      for (const claim of claims[connection.id]) expect(connection.explanation, connection.id).toMatch(claim);
    }
  });

  it('keeps every excerpt anchored to its declared canonical template or fixture', () => {
    for (const entries of Object.values(lessonTraces)) for (const entry of entries) for (const connection of entry.connections) {
      for (const excerpt of connection.excerpts) {
        if (excerpt.label in canonical) {
          const code = canonical[excerpt.label as keyof typeof canonical];
          // Region and named context snippets must be contiguous in the assembled template.
          expect(code, `${connection.id}: ${excerpt.source}`).toContain(excerpt.content);
        } else {
          expect(excerpt.content, `${connection.id}: ${excerpt.source}`).toBe(fixtureSource(excerpt.source));
        }
      }
    }
  });

  it('shows both ends of each relationship with the expected learner values, never the worked example', () => {
    const evidence: Record<string, string[]> = {
      'lesson2.given.binding': ['Given a vaccination for patient "Patient/patient-001"', '[Binding]', '[Given("a vaccination for patient {string}")]', 'GivenAVaccination(string patientReference)'],
      'lesson2.given.patient': ['patientReference', 'Reference = patientReference', '"reference": "Patient/patient-001"'],
      'lesson2.when.action': ['When I submit the vaccination', '[When("I submit the vaccination")]', 'WhenISubmitTheVaccination()', 'Client.SendAsync(message)'],
      'lesson2.then.status': ['Then the response status is 201', '[Then("the response status is {int}")]', 'expectedStatus', '_response.StatusCode'],
      'lesson2.then.and': ['And the recorded vaccination matches the request', '[Then("the recorded vaccination matches the request")]', 'actual.Patient.Reference', 'actual.LotNumber'],
      'lesson3.model.date': ['OccurrenceDateTime', '[JsonPropertyName("occurrenceDateTime")]', '"occurrenceDateTime": "2026-01-15"'],
      'lesson3.model.patient': ['[JsonPropertyName("patient")]', '[JsonPropertyName("reference")]', '"reference": "Patient/patient-001"'],
      'lesson3.model.roundtrip': ['JsonSerializer.Serialize(_request)', 'JsonSerializer.Deserialize<Immunization>(json)', '"id": "imm-001"'],
      'lesson4.request.patient': ['Patient/patient-001', 'Reference = patientReference', '_request', '"reference": "Patient/patient-001"'],
      'lesson4.request.serialize': ['JsonSerializer.Serialize(_request)', 'message.Content', 'application/fhir+json', '"status": "completed"', '"text": "Influenza vaccine"'],
      'lesson4.request.post': ['HttpMethod.Post', '"Immunization"', 'POST https://fhir.example.test/Immunization'],
      'lesson4.request.send': ['message.Content', '_response = await Client.SendAsync(message)'],
      'lesson5.response.status': ['201', 'expectedStatus', '_response.StatusCode'],
      'lesson5.response.deserialize': ['"id": "imm-001"', '_response.Content.ReadAsStringAsync()', 'JsonSerializer.Deserialize<Immunization>(json)', 'actual'],
      'lesson5.response.lot': ['"lotNumber": "TRAINING-FLU-001"', 'actual.LotNumber', '_request.LotNumber'],
      'lesson5.response.patient': ['"reference": "Patient/patient-001"', 'actual.Patient.Reference', '_request.Patient.Reference'],
    };
    for (const trace of traces) for (const connection of trace.connections) {
      const shown = connection.excerpts.map((e) => e.content).join('\n');
      for (const token of evidence[connection.id]) expect(shown, connection.id).toContain(token);
      expect(shown + connection.explanation).not.toContain('patient-002');
    }
  });
});
