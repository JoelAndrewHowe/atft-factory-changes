import { describe, expect, it } from 'vitest';
import { questions } from './questions';

describe('specified understanding checks', () => {
  it('keeps the prescribed option order, correct choices and choice-specific feedback', () => {
    expect(questions.map(({ id, correctChoiceId, choices, feedback }) => ({
      id, correctChoiceId, choices: choices.map(({ id, text }) => [id, text]), feedback,
    }))).toEqual([
      {
        id: 'lesson2.binding', correctChoiceId: 'A',
        choices: [
          ['A', 'It matches the step text to a binding attribute such as [Given("a vaccination for patient {string}")], captures the quoted value, and passes it to the method.'],
          ['B', 'It converts the sentence into a C# method name and calls that method.'],
          ['C', "It uses the step's position in the feature file to choose a method."],
        ],
        feedback: {
          A: "The [Binding] class contains the step definitions. The [Given] expression matches this step, and {string} captures the quoted patient reference for the method's patientReference argument.",
          B: 'The method name does not determine which sentence matches. Look at the expression in the [Given] attribute.',
          C: "Step order determines the scenario's sequence, but it does not choose the matching method. Look at the binding attribute's expression.",
        },
      },
      {
        id: 'lesson2.patient', correctChoiceId: 'A',
        choices: [['A', 'patient.reference'], ['B', 'id'], ['C', 'vaccineCode.text']],
        feedback: {
          A: 'The captured value becomes patientReference, is assigned to Patient.Reference, and is serialized as patient.reference.',
          B: "The resource ID identifies the vaccination record and is assigned by the simulated server. Follow the Given method's Patient assignment.",
          C: 'vaccineCode.text describes the vaccine. Follow where the Given method stores the patientReference argument.',
        },
      },
      {
        id: 'lesson3.json-name', correctChoiceId: 'B',
        choices: [['A', "The property's position in the class."], ['B', 'Its [JsonPropertyName("occurrenceDateTime")] attribute.'], ['C', "The Gherkin step's wording."]],
        feedback: {
          A: 'Property order does not specify the JSON name. Inspect the attribute immediately above the property.',
          B: 'JsonPropertyName specifies the JSON field name used when mapping this C# property to or from JSON.',
          C: "Gherkin selects step bindings; it does not name JSON fields. Inspect the model property's attribute.",
        },
      },
      {
        id: 'lesson4.send', correctChoiceId: 'C',
        choices: [['A', 'JsonSerializer.Serialize(_request)'], ['B', 'new HttpRequestMessage(HttpMethod.Post, "Immunization")'], ['C', 'await Client.SendAsync(message)']],
        feedback: {
          A: 'Serialization produces the JSON content; it does not send it. Find the call on the HTTP client.',
          B: 'Constructing the message prepares its method and URL. Find the call that uses the client to submit it.',
          C: 'SendAsync submits the message and returns the response, which this example stores in _response. This tutorial illustrates that call without executing it.',
        },
      },
      {
        id: 'lesson5.assertion', correctChoiceId: 'B',
        choices: [['A', 'A 201 status automatically guarantees every returned field is correct.'], ['B', 'A successful HTTP status alone does not prove the returned data matches the request.'], ['C', 'The comparison changes an incorrect returned lot number to the submitted value.']],
        feedback: {
          A: 'A successful creation status and correct returned data are separate expectations. A field may still differ from what was submitted.',
          B: 'The assertion checks actual.LotNumber against _request.LotNumber. It detects a mismatch even if the response status indicates success.',
          C: 'An assertion checks a condition; it does not repair the response. A mismatch would fail the assertion in a real test.',
        },
      },
    ]);
  });
});
