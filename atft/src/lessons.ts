export type GapId =
  | 'feature.given'
  | 'feature.patient'
  | 'feature.when'
  | 'feature.then'
  | 'feature.status'
  | 'model.vaccine'
  | 'model.patient'
  | 'model.date'
  | 'request.status'
  | 'request.patient'
  | 'request.method'
  | 'request.endpoint'
  | 'request.media'
  | 'response.status'
  | 'response.model'
  | 'response.patient'
  | 'response.lot';

export type GapType = 'string' | 'token';

export interface GapDefinition {
  id: GapId;
  type: GapType;
  label: string;
  acceptedAnswer: string;
  emptyFeedback: string;
  incorrectFeedback: string;
}

export type Segment =
  | { type: 'text'; content: string }
  | { type: 'gap'; gapId: GapId };

export interface CodeFile {
  filename: string;
  language: string;
  segments: Segment[];
}

export type LessonType = 'reading' | 'coding';

export interface LessonData {
  id: string;
  number: number;
  title: string;
  type: LessonType;
  instructions: string[];
  codeFile?: CodeFile;
  editableGaps: GapId[];
  gapDefinitions: GapDefinition[];
  workedExample?: CodeFile;
}

export const ALL_GAP_IDS: readonly GapId[] = [
  'feature.given',
  'feature.patient',
  'feature.when',
  'feature.then',
  'feature.status',
  'model.vaccine',
  'model.patient',
  'model.date',
  'request.status',
  'request.patient',
  'request.method',
  'request.endpoint',
  'request.media',
  'response.status',
  'response.model',
  'response.patient',
  'response.lot',
];

function parseTemplate(template: string): Segment[] {
  const segments: Segment[] = [];
  const regex = /\{\{([a-z]+(?:\.[a-z]+)*)\}\}/g;
  let lastIndex = 0;
  let match: RegExpExecArray | null;

  while ((match = regex.exec(template)) !== null) {
    if (match.index > lastIndex) {
      segments.push({ type: 'text', content: template.slice(lastIndex, match.index) });
    }
    const gapId = match[1];
    if (!ALL_GAP_IDS.includes(gapId as GapId)) {
      throw new Error(`Unknown gap ID in template: ${gapId}`);
    }
    segments.push({ type: 'gap', gapId: gapId as GapId });
    lastIndex = match.index + match[0].length;
  }

  if (lastIndex < template.length) {
    segments.push({ type: 'text', content: template.slice(lastIndex) });
  }

  return segments;
}

function textFile(filename: string, language: string, content: string): CodeFile {
  return { filename, language, segments: [{ type: 'text', content }] };
}

const gapDefsArray: GapDefinition[] = [
  {
    id: 'feature.given',
    type: 'token',
    label: 'first step keyword',
    acceptedAnswer: 'Given',
    emptyFeedback: 'Enter a value for the first step keyword.',
    incorrectFeedback: 'Use the keyword that establishes the scenario\'s starting context.',
  },
  {
    id: 'feature.patient',
    type: 'string',
    label: 'patient reference',
    acceptedAnswer: 'Patient/patient-001',
    emptyFeedback: 'Enter a value for the patient reference.',
    incorrectFeedback: 'Use the exercise patient reference, including the resource type.',
  },
  {
    id: 'feature.when',
    type: 'token',
    label: 'submission step keyword',
    acceptedAnswer: 'When',
    emptyFeedback: 'Enter a value for the submission step keyword.',
    incorrectFeedback: 'Use the keyword that describes the action under test.',
  },
  {
    id: 'feature.then',
    type: 'token',
    label: 'status step keyword',
    acceptedAnswer: 'Then',
    emptyFeedback: 'Enter a value for the status step keyword.',
    incorrectFeedback: 'Use the keyword that introduces an expected outcome.',
  },
  {
    id: 'feature.status',
    type: 'token',
    label: 'expected HTTP status',
    acceptedAnswer: '201',
    emptyFeedback: 'Enter a value for the expected HTTP status.',
    incorrectFeedback: 'Check the API contract\'s successful creation status.',
  },
  {
    id: 'model.vaccine',
    type: 'token',
    label: 'VaccineCode property type',
    acceptedAnswer: 'CodeableConcept',
    emptyFeedback: 'Enter a value for the VaccineCode property type.',
    incorrectFeedback: 'The vaccine is represented by a nested concept object.',
  },
  {
    id: 'model.patient',
    type: 'token',
    label: 'Patient property type',
    acceptedAnswer: 'PatientReference',
    emptyFeedback: 'Enter a value for the Patient property type.',
    incorrectFeedback: 'Use the teaching class that contains a patient reference.',
  },
  {
    id: 'model.date',
    type: 'string',
    label: 'OccurrenceDateTime JsonPropertyName',
    acceptedAnswer: 'occurrenceDateTime',
    emptyFeedback: 'Enter a value for the OccurrenceDateTime JSON property name.',
    incorrectFeedback: 'Match the administration-date property in the JSON fixture, including case.',
  },
  {
    id: 'request.status',
    type: 'string',
    label: 'status initializer',
    acceptedAnswer: 'completed',
    emptyFeedback: 'Enter a value for the status initializer.',
    incorrectFeedback: 'Describe a vaccination that has already been administered.',
  },
  {
    id: 'request.patient',
    type: 'token',
    label: 'reference initializer',
    acceptedAnswer: 'patientReference',
    emptyFeedback: 'Enter a value for the reference initializer.',
    incorrectFeedback: 'Use the parameter captured from the Gherkin step.',
  },
  {
    id: 'request.method',
    type: 'token',
    label: 'HTTP method',
    acceptedAnswer: 'Post',
    emptyFeedback: 'Enter a value for the HTTP method.',
    incorrectFeedback: 'Choose the HTTP method used to create the resource.',
  },
  {
    id: 'request.endpoint',
    type: 'string',
    label: 'relative request URL',
    acceptedAnswer: 'Immunization',
    emptyFeedback: 'Enter a value for the relative request URL.',
    incorrectFeedback: 'Send the request to the resource collection in the contract.',
  },
  {
    id: 'request.media',
    type: 'string',
    label: 'content media type',
    acceptedAnswer: 'application/fhir+json',
    emptyFeedback: 'Enter a value for the content media type.',
    incorrectFeedback: 'Use the FHIR JSON media type.',
  },
  {
    id: 'response.status',
    type: 'token',
    label: 'status assertion argument',
    acceptedAnswer: 'expectedStatus',
    emptyFeedback: 'Enter a value for the status assertion argument.',
    incorrectFeedback: 'Compare with the status passed from the scenario.',
  },
  {
    id: 'response.model',
    type: 'token',
    label: 'deserialize type argument',
    acceptedAnswer: 'Immunization',
    emptyFeedback: 'Enter a value for the deserialize type argument.',
    incorrectFeedback: 'Deserialize into the resource model you completed.',
  },
  {
    id: 'response.patient',
    type: 'token',
    label: 'patient assertion argument',
    acceptedAnswer: '_request.Patient.Reference',
    emptyFeedback: 'Enter a value for the patient assertion argument.',
    incorrectFeedback: 'Compare the returned patient reference with the submitted reference.',
  },
  {
    id: 'response.lot',
    type: 'token',
    label: 'lot assertion argument',
    acceptedAnswer: '_request.LotNumber',
    emptyFeedback: 'Enter a value for the lot assertion argument.',
    incorrectFeedback: 'Compare the returned lot number with the submitted lot number.',
  },
];

export const gapDefinitions: Record<GapId, GapDefinition> = Object.fromEntries(
  gapDefsArray.map((def) => [def.id, def]),
) as Record<GapId, GapDefinition>;

export const canonicalAnswers: Record<GapId, string> = Object.fromEntries(
  gapDefsArray.map((def) => [def.id, def.acceptedAnswer]),
) as Record<GapId, string>;

export const learnerFeatureFile: CodeFile = {
  filename: 'RecordVaccination.feature',
  language: 'gherkin',
  segments: parseTemplate(
    'Feature: Record a vaccination\n' +
      '  Scenario: Record an administered vaccination for an existing patient\n' +
      '    {{feature.given}} a vaccination for patient "{{feature.patient}}"\n' +
      '    {{feature.when}} I submit the vaccination\n' +
      '    {{feature.then}} the response status is {{feature.status}}\n' +
      '    And the recorded vaccination matches the request',
  ),
};

export const workedFeatureFile: CodeFile = textFile(
  'RecordVaccination.feature',
  'gherkin',
  'Feature: Record a vaccination\n' +
    '  Scenario: Record an administered vaccination for an existing patient\n' +
    '    Given a vaccination for patient "Patient/patient-002"\n' +
    '    When I submit the vaccination\n' +
    '    Then the response status is 201\n' +
    '    And the recorded vaccination matches the request',
);

export const learnerImmunizationFile: CodeFile = {
  filename: 'Immunization.cs',
  language: 'csharp',
  segments: parseTemplate(
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
      '    public {{model.vaccine}} VaccineCode { get; set; } = new();\n' +
      '\n' +
      '    [JsonPropertyName("patient")]\n' +
      '    public {{model.patient}} Patient { get; set; } = new();\n' +
      '\n' +
      '    [JsonPropertyName("{{model.date}}")]\n' +
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
  ),
};

export const workedImmunizationFile: CodeFile = textFile(
  'Immunization.cs',
  'csharp',
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

export const learnerStepsFile: CodeFile = {
  filename: 'RecordVaccinationSteps.cs',
  language: 'csharp',
  segments: parseTemplate(
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
      '    [Given("a vaccination for patient {string}")]\n' +
      '    public void GivenAVaccination(string patientReference)\n' +
      '    {\n' +
      '        _request = new Immunization\n' +
      '        {\n' +
      '            Status = "{{request.status}}",\n' +
      '            Patient = new PatientReference { Reference = {{request.patient}} },\n' +
      '            VaccineCode = new CodeableConcept { Text = "Influenza vaccine" },\n' +
      '            OccurrenceDateTime = "2026-01-15",\n' +
      '            LotNumber = "TRAINING-FLU-001"\n' +
      '        };\n' +
      '    }\n' +
      '\n' +
      '    [When("I submit the vaccination")]\n' +
      '    public async Task WhenISubmitTheVaccination()\n' +
      '    {\n' +
      '        using var message = new HttpRequestMessage(HttpMethod.{{request.method}}, "{{request.endpoint}}");\n' +
      '        message.Headers.Accept.Add(new MediaTypeWithQualityHeaderValue("application/fhir+json"));\n' +
      '        message.Headers.Add("Prefer", "return=representation");\n' +
      '        message.Content = new StringContent(\n' +
      '            JsonSerializer.Serialize(_request), Encoding.UTF8, "{{request.media}}");\n' +
      '        _response = await Client.SendAsync(message);\n' +
      '    }\n' +
      '\n' +
      '    [Then("the response status is {int}")]\n' +
      '    public void ThenTheResponseStatusIs(int expectedStatus)\n' +
      '    {\n' +
      '        Assert.That((int)_response.StatusCode, Is.EqualTo({{response.status}}));\n' +
      '    }\n' +
      '\n' +
      '    [Then("the recorded vaccination matches the request")]\n' +
      '    public async Task ThenTheRecordedVaccinationMatches()\n' +
      '    {\n' +
      '        var json = await _response.Content.ReadAsStringAsync();\n' +
      '        var actual = JsonSerializer.Deserialize<{{response.model}}>(json)\n' +
      '            ?? throw new InvalidOperationException("Expected an Immunization response.");\n' +
      '        Assert.That(actual.Id, Is.Not.Null.And.Not.Empty);\n' +
      '        Assert.That(actual.ResourceType, Is.EqualTo("Immunization"));\n' +
      '        Assert.That(actual.Status, Is.EqualTo(_request.Status));\n' +
      '        Assert.That(actual.Patient.Reference, Is.EqualTo({{response.patient}}));\n' +
      '        Assert.That(actual.VaccineCode.Text, Is.EqualTo(_request.VaccineCode.Text));\n' +
      '        Assert.That(actual.OccurrenceDateTime, Is.EqualTo(_request.OccurrenceDateTime));\n' +
      '        Assert.That(actual.LotNumber, Is.EqualTo({{response.lot}}));\n' +
      '    }\n' +
      '\n' +
      '    [AfterScenario]\n' +
      '    public void Cleanup() => _response?.Dispose();\n' +
      '}',
  ),
};

export const workedStepsFile: CodeFile = textFile(
  'RecordVaccinationSteps.cs',
  'csharp',
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
    '    [Given("a vaccination for patient {string}")]\n' +
    '    public void GivenAVaccination(string patientReference)\n' +
    '    {\n' +
    '        _request = new Immunization\n' +
    '        {\n' +
    '            Status = "completed",\n' +
    '            Patient = new PatientReference { Reference = patientReference },\n' +
    '            VaccineCode = new CodeableConcept { Text = "Hepatitis B vaccine" },\n' +
    '            OccurrenceDateTime = "2026-02-20",\n' +
    '            LotNumber = "TRAINING-HEPB-002"\n' +
    '        };\n' +
    '    }\n' +
    '\n' +
    '    [When("I submit the vaccination")]\n' +
    '    public async Task WhenISubmitTheVaccination()\n' +
    '    {\n' +
    '        using var message = new HttpRequestMessage(HttpMethod.Post, "Immunization");\n' +
    '        message.Headers.Accept.Add(new MediaTypeWithQualityHeaderValue("application/fhir+json"));\n' +
    '        message.Headers.Add("Prefer", "return=representation");\n' +
    '        message.Content = new StringContent(\n' +
    '            JsonSerializer.Serialize(_request), Encoding.UTF8, "application/fhir+json");\n' +
    '        _response = await Client.SendAsync(message);\n' +
    '    }\n' +
    '\n' +
    '    [Then("the response status is {int}")]\n' +
    '    public void ThenTheResponseStatusIs(int expectedStatus)\n' +
    '    {\n' +
    '        Assert.That((int)_response.StatusCode, Is.EqualTo(expectedStatus));\n' +
    '    }\n' +
    '\n' +
    '    [Then("the recorded vaccination matches the request")]\n' +
    '    public async Task ThenTheRecordedVaccinationMatches()\n' +
    '    {\n' +
    '        var json = await _response.Content.ReadAsStringAsync();\n' +
    '        var actual = JsonSerializer.Deserialize<Immunization>(json)\n' +
    '            ?? throw new InvalidOperationException("Expected an Immunization response.");\n' +
    '        Assert.That(actual.Id, Is.Not.Null.And.Not.Empty);\n' +
    '        Assert.That(actual.ResourceType, Is.EqualTo("Immunization"));\n' +
    '        Assert.That(actual.Status, Is.EqualTo(_request.Status));\n' +
    '        Assert.That(actual.Patient.Reference, Is.EqualTo(_request.Patient.Reference));\n' +
    '        Assert.That(actual.VaccineCode.Text, Is.EqualTo(_request.VaccineCode.Text));\n' +
    '        Assert.That(actual.OccurrenceDateTime, Is.EqualTo(_request.OccurrenceDateTime));\n' +
    '        Assert.That(actual.LotNumber, Is.EqualTo(_request.LotNumber));\n' +
    '    }\n' +
    '\n' +
    '    [AfterScenario]\n' +
    '    public void Cleanup() => _response?.Dispose();\n' +
    '}',
);

export function assembleCode(segments: Segment[], values: Record<string, string>): string {
  return segments
    .map((segment) => {
      if (segment.type === 'text') return segment.content;
      return values[segment.gapId] ?? '';
    })
    .join('');
}

export function getCanonicalCode(segments: Segment[]): string {
  return assembleCode(segments, canonicalAnswers as unknown as Record<string, string>);
}

export const lessons: LessonData[] = [
  {
    id: 'lesson1',
    number: 1,
    title: 'Understand the API',
    type: 'reading',
    instructions: [
      'This tutorial teaches API test automation by recording a vaccination for a fictional patient. You have coding experience but are new to API test automation.',
      'We use a FHIR REST API. FHIR (Fast Healthcare Interoperability Resources) is a standard for exchanging healthcare data electronically. The Immunization resource records that a vaccine was administered to a patient.',
      'Our test sends a POST request to the Immunization endpoint. The request body contains the vaccination details: a reference to the existing patient, the vaccine name, the date it was administered, and the lot number.',
      'We include the Prefer: return=representation header to ask the server to return the created resource in its response. The simulated service honors this request.',
      'A successful creation returns HTTP 201 Created, a Location header pointing to the new resource, and the created Immunization resource with a server-assigned ID in the response body.',
      'Simulation only — no code runs and no API requests are sent from your browser. All requests and responses are illustrative.',
    ],
    editableGaps: [],
    gapDefinitions: [],
  },
  {
    id: 'lesson2',
    number: 2,
    title: 'Describe the behavior',
    type: 'coding',
    instructions: [
      'Gherkin is a plain-language format for describing software behavior. A Feature groups related scenarios. Each Scenario has steps: Given sets up the starting state, When describes the action, and Then asserts the expected outcome. And adds another assertion.',
      'Step text is matched to C# methods by Reqnroll bindings. The {string} placeholder in a step captures a value and passes it to the binding method as a parameter.',
      'Complete the feature file below so it describes recording a vaccination for the exercise patient and checks that the response indicates successful creation and that the returned data matches what was sent.',
    ],
    codeFile: learnerFeatureFile,
    editableGaps: ['feature.given', 'feature.patient', 'feature.when', 'feature.then', 'feature.status'],
    gapDefinitions: gapDefsArray.filter((g) => g.id.startsWith('feature.')),
    workedExample: workedFeatureFile,
  },
  {
    id: 'lesson3',
    number: 3,
    title: 'Model the data',
    type: 'coding',
    instructions: [
      'To send and receive FHIR JSON, we use small C# classes with properties marked by JsonPropertyName attributes. The attribute tells System.Text.Json how to map each C# property to the JSON field name.',
      'The same class can represent both the request and the response. The Id property is nullable and marked with JsonIgnore(Condition = JsonIgnoreCondition.WhenWritingNull) because we do not send an ID when creating a resource; the server assigns one and returns it in the response.',
      'OccurrenceDateTime is stored as a string in this teaching example to preserve the exact fixture date. These classes are an educational subset; they do not validate arbitrary FHIR dates or resources.',
      'Complete the Immunization model and its supporting classes below.',
    ],
    codeFile: learnerImmunizationFile,
    editableGaps: ['model.vaccine', 'model.patient', 'model.date'],
    gapDefinitions: gapDefsArray.filter((g) => g.id.startsWith('model.')),
    workedExample: workedImmunizationFile,
  },
  {
    id: 'lesson4',
    number: 4,
    title: 'Build the request',
    type: 'coding',
    instructions: [
      'Reqnroll bindings connect Gherkin steps to C# methods. The [Binding] attribute marks the class, and attributes like [Given], [When], and [Then] map step text to methods. A captured {string} parameter becomes a method argument.',
      'Fields like _request and _response store per-scenario state. The Given step builds the request object. The When step serializes it to JSON, sets the Accept, Prefer, and Content-Type headers, and sends the POST request with HttpClient.',
      'These methods are displayed for education; they are not executed in the browser. Complete the Given and When methods below.',
    ],
    codeFile: learnerStepsFile,
    editableGaps: ['request.status', 'request.patient', 'request.method', 'request.endpoint', 'request.media'],
    gapDefinitions: gapDefsArray.filter((g) => g.id.startsWith('request.')),
    workedExample: workedStepsFile,
  },
  {
    id: 'lesson5',
    number: 5,
    title: 'Verify the response',
    type: 'coding',
    instructions: [
      'The Then steps verify the response. First we check the HTTP status code. Then we read the response body and deserialize it back into our Immunization model using System.Text.Json.',
      'Each Assert.That statement compares a returned value with the value we sent. If they differ, the test fails and reports the mismatch. Checking status separately from data is good practice: a 201 with wrong data is still a bug.',
      'Reqnroll connects Gherkin to C#, HttpClient handles HTTP, System.Text.Json maps JSON, and NUnit supplies assertions. These are educational illustrations, not browser dependencies.',
      'Complete the Then assertions below.',
    ],
    codeFile: learnerStepsFile,
    editableGaps: ['response.status', 'response.model', 'response.patient', 'response.lot'],
    gapDefinitions: gapDefsArray.filter((g) => g.id.startsWith('response.')),
    workedExample: workedStepsFile,
  },
];

export function getLessonById(id: string): LessonData | undefined {
  return lessons.find((l) => l.id === id);
}

export function getLessonByNumber(num: number): LessonData | undefined {
  return lessons.find((l) => l.number === num);
}



