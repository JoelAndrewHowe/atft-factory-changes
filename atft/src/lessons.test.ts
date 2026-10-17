import { describe, expect, it } from 'vitest';
import {
  ALL_GAP_IDS,
  assembleCode,
  canonicalAnswers,
  gapDefinitions,
  getCanonicalCode,
  stripRegionMarkers,
  getLessonById,
  getLessonByNumber,
  learnerFeatureFile,
  learnerImmunizationFile,
  learnerStepsFile,
  lessons,
  workedFeatureFile,
  workedImmunizationFile,
  workedStepsFile,
  type GapId,
  type Segment,
} from './lessons';

function collectGapIds(segments: Segment[]): GapId[] {
  return segments
    .filter((s): s is { type: 'gap'; gapId: GapId } => s.type === 'gap')
    .map((s) => s.gapId);
}

function collectText(segments: Segment[]): string {
  return segments
    .filter((s) => s.type === 'text')
    .map((s) => s.content)
    .join('');
}

describe('lessons', () => {
  it('has sequential lesson numbers starting at 1', () => {
    expect(lessons.map((l) => l.number)).toEqual([1, 2, 3, 4, 5]);
  });

  it('has unique lesson ids', () => {
    const ids = lessons.map((l) => l.id);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it('has unique lesson titles', () => {
    const titles = lessons.map((l) => l.title);
    expect(new Set(titles).size).toBe(titles.length);
  });

  it('has exactly one reading lesson and four coding lessons', () => {
    const reading = lessons.filter((l) => l.type === 'reading');
    const coding = lessons.filter((l) => l.type === 'coding');
    expect(reading).toHaveLength(1);
    expect(coding).toHaveLength(4);
  });

  it('lesson 1 is the reading lesson', () => {
    const l1 = getLessonByNumber(1);
    expect(l1).toBeDefined();
    expect(l1!.type).toBe('reading');
    expect(l1!.codeFile).toBeUndefined();
    expect(l1!.workedExample).toBeUndefined();
    expect(l1!.editableGaps).toHaveLength(0);
  });

  it('coding lessons have code files and worked examples', () => {
    for (const lesson of lessons.filter((l) => l.type === 'coding')) {
      expect(lesson.codeFile, `${lesson.id} codeFile`).toBeDefined();
      expect(lesson.workedExample, `${lesson.id} workedExample`).toBeDefined();
      expect(lesson.editableGaps.length, `${lesson.id} editableGaps`).toBeGreaterThan(0);
    }
  });

  it('every editable gap has a definition in its lesson', () => {
    for (const lesson of lessons) {
      const definedIds = new Set(lesson.gapDefinitions.map((g) => g.id));
      for (const gapId of lesson.editableGaps) {
        expect(
          definedIds.has(gapId),
          `${lesson.id} editable gap ${gapId} missing definition`,
        ).toBe(true);
      }
    }
  });

  it('every gap referenced in a template has a global definition', () => {
    const definedIds = new Set(ALL_GAP_IDS);
    const files = [learnerFeatureFile, learnerImmunizationFile, learnerStepsFile];
    for (const file of files) {
      for (const gapId of collectGapIds(file.segments)) {
        expect(
          definedIds.has(gapId),
          `${file.filename} references unknown gap ${gapId}`,
        ).toBe(true);
      }
    }
  });

  it('no text segment contains unresolved gap syntax', () => {
    const files = [
      learnerFeatureFile,
      workedFeatureFile,
      learnerImmunizationFile,
      workedImmunizationFile,
      learnerStepsFile,
      workedStepsFile,
    ];
    for (const file of files) {
      const text = collectText(file.segments);
      expect(text, file.filename).not.toMatch(/\{\{[a-z.]+\}\}/);
    }
  });

  it('canonical learner feature file matches spec', () => {
    const code = getCanonicalCode(learnerFeatureFile.segments);
    expect(code).toBe(
      'Feature: Record a vaccination\n' +
        '  Scenario: Record an administered vaccination for an existing patient\n' +
        '    Given a vaccination for patient "Patient/patient-001"\n' +
        '    When I submit the vaccination\n' +
        '    Then the response status is 201\n' +
        '    And the recorded vaccination matches the request',
    );
  });

  it('canonical learner immunization file matches spec', () => {
    const code = getCanonicalCode(learnerImmunizationFile.segments);
    expect(code).toBe(
      'using System.Text.Json.Serialization;\n' +
        '\n' +
        'public sealed class Immunization\n' +
        '{\n' +
        '    [JsonPropertyName("resourceType")]\n' +
        '    public string ResourceType { get; set; } = "Immunization";\n' +
        '\n' +
        '    [JsonPropertyName("id")]\n' +
        '    [JsonIgnore(Condition = JsonIgnoreCondition.WhenWritingNull)]\n' +
        '    public string? Id { get; set; }\n' +
        '\n' +
        '    [JsonPropertyName("status")]\n' +
        '    public string Status { get; set; } = "completed";\n' +
        '\n' +
        '    [JsonPropertyName("vaccineCode")]\n' +
        '    public CodeableConcept VaccineCode { get; set; } = new();\n' +
        '\n' +
        '    [JsonPropertyName("patient")]\n' +
        '    public PatientReference Patient { get; set; } = new();\n' +
        '\n' +
        '    [JsonPropertyName("occurrenceDateTime")]\n' +
        '    public string OccurrenceDateTime { get; set; } = "";\n' +
        '\n' +
        '    [JsonPropertyName("lotNumber")]\n' +
        '    public string LotNumber { get; set; } = "";\n' +
        '}\n' +
        '\n' +
        'public sealed class CodeableConcept\n' +
        '{\n' +
        '    [JsonPropertyName("text")]\n' +
        '    public string Text { get; set; } = "";\n' +
        '}\n' +
        '\n' +
        'public sealed class PatientReference\n' +
        '{\n' +
        '    [JsonPropertyName("reference")]\n' +
        '    public string Reference { get; set; } = "";\n' +
        '}',
    );
  });

  it('rendered text segments preserve code formatting without internal markers for blank and filled gaps', () => {
    for (const file of [learnerImmunizationFile, learnerStepsFile]) {
      const answerSets: Record<string, string>[] = [{}, canonicalAnswers];
      for (const values of answerSets) {
        const rendered = file.segments.map((segment) => segment.type === 'text'
          ? stripRegionMarkers(segment.content)
          : values[segment.gapId] ?? '').join('');
        expect(rendered).toBe(stripRegionMarkers(assembleCode(file.segments, values)));
        expect(rendered).not.toMatch(/\/\/ (?:end)?region:/);
      }
    }
    expect(getCanonicalCode(learnerImmunizationFile.segments)).toContain(
      'public sealed class PatientReference\n{\n    [JsonPropertyName("reference")]\n    public string Reference { get; set; } = "";\n}',
    );
  });

  it('canonical learner steps file matches spec', () => {
    const code = getCanonicalCode(learnerStepsFile.segments);
    expect(code).toBe(stripRegionMarkers(
      'using System;\n' +
        'using System.Net.Http;\n' +
        'using System.Net.Http.Headers;\n' +
        'using System.Text;\n' +
        'using System.Text.Json;\n' +
        'using System.Threading.Tasks;\n' +
        'using NUnit.Framework;\n' +
        'using Reqnroll;\n' +
        '\n' +
        '[Binding]\n' +
        'public sealed class RecordVaccinationSteps\n' +
        '{\n' +
        '    private static readonly HttpClient Client = new()\n' +
        '    {\n' +
        '        BaseAddress = new Uri("https://fhir.example.test/")\n' +
        '    };\n' +
        '    private Immunization _request = null!;\n' +
        '    private HttpResponseMessage _response = null!;\n' +
        '\n' +
        '    // region:given-body\n' +
        '    // region:given-binding\n' +
        '    [Given("a vaccination for patient {string}")]\n' +
        '    public void GivenAVaccination(string patientReference)\n' +
        '    // endregion:given-binding\n' +
        '    {\n' +
        '        _request = new Immunization\n' +
        '        {\n' +
        '            Status = "completed",\n' +
        '            Patient = new PatientReference { Reference = patientReference },\n' +
        '            VaccineCode = new CodeableConcept { Text = "Influenza vaccine" },\n' +
        '            OccurrenceDateTime = "2026-01-15",\n' +
        '            LotNumber = "TRAINING-FLU-001"\n' +
        '        };\n' +
        '    }\n' +
        '    // endregion:given-body\n' +
        '\n' +
        '    // region:when-binding\n' +
        '    [When("I submit the vaccination")]\n' +
        '    public async Task WhenISubmitTheVaccination()\n' +
        '    // endregion:when-binding\n' +
        '    {\n' +
        '        // region:request-message\n' +
        '        using var message = new HttpRequestMessage(HttpMethod.Post, "Immunization");\n' +
        '        // endregion:request-message\n' +
        '        message.Headers.Accept.Add(new MediaTypeWithQualityHeaderValue("application/fhir+json"));\n' +
        '        message.Headers.Add("Prefer", "return=representation");\n' +
        '        // region:serialize\n' +
        '        message.Content = new StringContent(\n' +
        '            JsonSerializer.Serialize(_request), Encoding.UTF8, "application/fhir+json");\n' +
        '        // endregion:serialize\n' +
        '        // region:sendasync\n' +
        '        _response = await Client.SendAsync(message);\n' +
        '        // endregion:sendasync\n' +
        '    }\n' +
        '\n' +
        '    // region:then-status-binding\n' +
        '    [Then("the response status is {int}")]\n' +
        '    public void ThenTheResponseStatusIs(int expectedStatus)\n' +
        '    // endregion:then-status-binding\n' +
        '    {\n' +
        '        // region:then-status-body\n' +
        '        Assert.That((int)_response.StatusCode, Is.EqualTo(expectedStatus));\n' +
        '        // endregion:then-status-body\n' +
        '    }\n' +
        '\n' +
        '    // region:then-data-binding\n' +
        '    [Then("the recorded vaccination matches the request")]\n' +
        '    public async Task ThenTheRecordedVaccinationMatches()\n' +
        '    // endregion:then-data-binding\n' +
        '    {\n' +
        '        var json = await _response.Content.ReadAsStringAsync();\n' +
        '        // region:deserialize\n' +
        '        var actual = JsonSerializer.Deserialize<Immunization>(json)\n' +
        '            ?? throw new InvalidOperationException("Expected an Immunization response.");\n' +
        '        // endregion:deserialize\n' +
        '        Assert.That(actual.Id, Is.Not.Null.And.Not.Empty);\n' +
        '        Assert.That(actual.ResourceType, Is.EqualTo("Immunization"));\n' +
        '        Assert.That(actual.Status, Is.EqualTo(_request.Status));\n' +
        '        // region:patient-assertion\n' +
        '        Assert.That(actual.Patient.Reference, Is.EqualTo(_request.Patient.Reference));\n' +
        '        // endregion:patient-assertion\n' +
        '        Assert.That(actual.VaccineCode.Text, Is.EqualTo(_request.VaccineCode.Text));\n' +
        '        Assert.That(actual.OccurrenceDateTime, Is.EqualTo(_request.OccurrenceDateTime));\n' +
        '        // region:lot-assertion\n' +
        '        Assert.That(actual.LotNumber, Is.EqualTo(_request.LotNumber));\n' +
        '        // endregion:lot-assertion\n' +
        '    }\n' +
        '\n' +
        '    [AfterScenario]\n' +
        '    public void Cleanup() => _response?.Dispose();\n' +
        '}',
    ));
  });

  it('worked feature file uses patient-002', () => {
    const text = collectText(workedFeatureFile.segments);
    expect(text).toContain('Patient/patient-002');
    expect(text).not.toContain('Patient/patient-001');
  });

  it('worked immunization file matches canonical learner immunization', () => {
    const worked = collectText(workedImmunizationFile.segments);
    const learner = getCanonicalCode(learnerImmunizationFile.segments);
    expect(worked).toBe(learner);
  });

  it('worked steps file uses worked fixture values', () => {
    const text = collectText(workedStepsFile.segments);
    expect(text).toContain('Hepatitis B vaccine');
    expect(text).toContain('2026-02-20');
    expect(text).toContain('TRAINING-HEPB-002');
    expect(text).not.toContain('Influenza vaccine');
    expect(text).not.toContain('2026-01-15');
    expect(text).not.toContain('TRAINING-FLU-001');
  });

  it('worked steps file uses patientReference parameter, not hardcoded patient-002', () => {
    const text = collectText(workedStepsFile.segments);
    expect(text).toContain('Reference = patientReference');
    expect(text).not.toContain('Patient/patient-002');
  });

  it('gap definitions match canonical answers and expected types', () => {
    expect(gapDefinitions['feature.given'].type).toBe('token');
    expect(canonicalAnswers['feature.given']).toBe('Given');

    expect(gapDefinitions['feature.patient'].type).toBe('string');
    expect(canonicalAnswers['feature.patient']).toBe('Patient/patient-001');

    expect(gapDefinitions['model.vaccine'].type).toBe('token');
    expect(canonicalAnswers['model.vaccine']).toBe('CodeableConcept');

    expect(gapDefinitions['request.media'].type).toBe('string');
    expect(canonicalAnswers['request.media']).toBe('application/fhir+json');

    expect(gapDefinitions['response.patient'].type).toBe('token');
    expect(canonicalAnswers['response.patient']).toBe('_request.Patient.Reference');
  });

  it('lesson 2 editable gaps are exactly the feature gaps', () => {
    const l2 = getLessonById('lesson2')!;
    expect(l2.editableGaps).toEqual([
      'feature.given',
      'feature.patient',
      'feature.when',
      'feature.then',
      'feature.status',
    ]);
  });

  it('lesson 3 editable gaps are exactly the model gaps', () => {
    const l3 = getLessonById('lesson3')!;
    expect(l3.editableGaps).toEqual(['model.vaccine', 'model.patient', 'model.date']);
  });

  it('lesson 4 editable gaps are exactly the request gaps', () => {
    const l4 = getLessonById('lesson4')!;
    expect(l4.editableGaps).toEqual([
      'request.status',
      'request.patient',
      'request.method',
      'request.endpoint',
      'request.media',
    ]);
  });

  it('lesson 5 editable gaps are exactly the response gaps', () => {
    const l5 = getLessonById('lesson5')!;
    expect(l5.editableGaps).toEqual([
      'response.status',
      'response.model',
      'response.patient',
      'response.lot',
    ]);
  });

  it('lessons 4 and 5 share the same learner code file object', () => {
    const l4 = getLessonById('lesson4')!;
    const l5 = getLessonById('lesson5')!;
    expect(l4.codeFile).toBe(l5.codeFile);
  });

  it('assembleCode replaces gaps with provided values', () => {
    const segments = learnerFeatureFile.segments;
    const code = assembleCode(segments, {
      'feature.given': 'Given',
      'feature.patient': 'Patient/patient-001',
      'feature.when': 'When',
      'feature.then': 'Then',
      'feature.status': '201',
    });
    expect(stripRegionMarkers(code)).toBe(getCanonicalCode(learnerFeatureFile.segments));
  });

  it('assembleCode leaves missing gaps empty', () => {
    const segments = learnerFeatureFile.segments;
    const code = assembleCode(segments, {});
    expect(code).toContain(' a vaccination for patient ""');
  });

  it('learner steps file contains all request and response gap references', () => {
    const gapIds = collectGapIds(learnerStepsFile.segments);
    expect(gapIds).toContain('request.status');
    expect(gapIds).toContain('request.patient');
    expect(gapIds).toContain('request.method');
    expect(gapIds).toContain('request.endpoint');
    expect(gapIds).toContain('request.media');
    expect(gapIds).toContain('response.status');
    expect(gapIds).toContain('response.model');
    expect(gapIds).toContain('response.patient');
    expect(gapIds).toContain('response.lot');
  });

  it('learner request body is embedded in the steps file context', () => {
    const code = getCanonicalCode(learnerStepsFile.segments);
    expect(code).toContain('"Influenza vaccine"');
    expect(code).toContain('"2026-01-15"');
    expect(code).toContain('"TRAINING-FLU-001"');
  });

  it('getLessonById and getLessonByNumber are consistent', () => {
    for (const lesson of lessons) {
      expect(getLessonById(lesson.id)).toBe(lesson);
      expect(getLessonByNumber(lesson.number)).toBe(lesson);
    }
  });

  it('all gap definitions have non-empty fields', () => {
    for (const id of ALL_GAP_IDS) {
      const def = gapDefinitions[id];
      expect(def.id).toBe(id);
      expect(def.label.length).toBeGreaterThan(0);
      expect(def.acceptedAnswer.length).toBeGreaterThan(0);
      expect(def.emptyFeedback.length).toBeGreaterThan(0);
      expect(def.incorrectFeedback.length).toBeGreaterThan(0);
    }
  });
});
