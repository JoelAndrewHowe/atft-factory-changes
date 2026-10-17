# Iteration 002 — Trace how the test fits together

Status: Core scope agreed through coaching on 2026-10-14. The detailed interaction and persistence defaults below make that scope implementable and are ready for review. Implementation is a separate task.

## Purpose and audience

Help a learner with coding experience, but new to API test automation, explain how a Gherkin step connects to a C# binding, how values reach the HTTP request, and how assertions check the response.

Build on `001-.md` and `../vision.md`. Iteration 001 remains the baseline for fixtures, canonical C# code, editable gaps, simulation, accessibility, and delivery. This document changes lesson completion and progress migration and adds tracing and understanding checks. All other iteration 001 requirements continue to apply.

The vision still mentions Selenium. Continue the iteration 001 decision to teach Reqnroll, HttpClient, System.Text.Json, and NUnit. Do not add Selenium or silently rewrite the vision.

## Agreed scope

- Offer optional guided tracing during coding lessons 2–5.
- Provide a final walkthrough after the successful simulated test.
- Lesson tracing uses a clearly labelled correct example, even when learner answers are blank or wrong. It never changes learner answers or passes their exercises.
- The final walkthrough uses the learner's completed code.
- Add five multiple-choice understanding checks: two in lesson 2 and one each in lessons 3, 4, and 5.
- Require both a successful code check and all understanding checks in a lesson before unlocking the next lesson.
- Give explanatory feedback and unlimited retries for incorrect answers.
- Preserve existing code, valid code checks, and unlocked lessons when upgrading iteration 001 progress. Introduce the five questions as unanswered and clear previous overall completion until the checks pass and the simulation is rerun.
- Editing code requires a fresh code check but preserves understanding answers and previously unlocked navigation.

## Boundaries

Keep the same five lessons, fictional vaccination scenario, fixtures, and code gaps. All tracing is an illustration based on explicit content mappings. Do not execute C#, parse arbitrary C# or Gherkin, send clinical requests, or suggest a real test ran.

Exclude additional tutorial tracks, failing API scenarios, free-form code editing, AI tutoring or scoring, accounts, a backend, deployment, and code export. The factory's OpenRouter reviewers are development machinery, not a learner-facing feature or runtime dependency.

Implement only under `atft/`. Preserve the vision, iteration 001 document, factory source/specs, assembly-line configuration, and Tetris targets.

## Guided tracing during lessons

Use a button labelled **Trace this step** beside each relevant concept. Open an inline trace panel with a title, a textual “Connection N of M” indicator, labelled code/JSON excerpts, an explanation, Back, Next, and Close controls. Disable Back on the first connection and Next on the last. Reopening a trace starts at its first connection; trace position does not need persistence.

Keep the exercise and its current answers available. Tracing never changes inputs, submits checks, unlocks lessons, or reveals whether an unsubmitted answer is correct. No trace must be visited to progress.

Label every lesson trace **Correct example — your answers are unchanged**. Use the canonical learner solution and learner fixture from iteration 001, including `Patient/patient-001`; this is distinct from the existing worked example using `Patient/patient-002`. Preserve that separate worked example and Show solution behavior.

Highlight the relevant text in each excerpt with a visible non-color-only marker and label. Display enough surrounding code to explain the connection. Use explicit stable identifiers for trace connections rather than inferred line numbers or source-code parsing. Reuse existing canonical templates and fixtures to avoid inconsistent copies.

### Lesson 2 — Describe the behavior

Provide three entry points:

1. **Given: from words to request data.** Show the canonical Given line, the `[Binding]` class, `[Given("a vaccination for patient {string}")]`, and `GivenAVaccination(string patientReference)`. Explain that Reqnroll matches the text to the attribute expression, captures the quoted value, and supplies it as the argument. Follow `patientReference` into `new PatientReference { Reference = patientReference }`, then the request's `patient.reference`. Explain that method naming and declaration order do not establish this connection.
2. **When: from words to an action.** Connect `When I submit the vaccination` to `[When("I submit the vaccination")]`, `WhenISubmitTheVaccination()`, and the request-sending statement.
3. **Then and And: from words to assertions.** Connect `Then the response status is 201` to `[Then("the response status is {int}")]`, the captured `expectedStatus`, and its assertion. Connect the following And step to `[Then("the recorded vaccination matches the request")]`; explain that And continues the preceding Then step type.

These are illustrative connections in the supplied example, not a live Reqnroll binding resolver.

### Lesson 3 — Model the data

Trace `OccurrenceDateTime` through `[JsonPropertyName("occurrenceDateTime")]` to the JSON field and fixed date `2026-01-15`. Explain that the attribute supplies the JSON name while the C# property holds its value. Also show the nested `PatientReference.Reference` mapping to `patient.reference`. Serialization builds JSON; deserialization maps returned JSON back into these teaching classes.

### Lesson 4 — Build the request

Follow the patient value from Given into `_request`, then `JsonSerializer.Serialize(_request)` and `message.Content`. Show `HttpMethod.Post`, the `Immunization` relative URL, and the illustrative full URL from the existing fixture. Distinguish preparing the request from `await Client.SendAsync(message)`, which would send it in a real test. Show the result being stored in `_response`. Retain the simulation-only label.

### Lesson 5 — Verify the response

Show the illustrative 201 response and `_response.StatusCode` comparison with `expectedStatus`. Follow the response JSON through `JsonSerializer.Deserialize<Immunization>(json)` into `actual`. Highlight `Assert.That(actual.LotNumber, Is.EqualTo(_request.LotNumber))` and the matching fixture values. Explain why correct status alone does not establish correct returned data. Also connect the returned patient reference to its request-value assertion.

## Five understanding checks

Use a labelled radio group with three choices per question and a **Check understanding** button. Preserve the option order below and stable option IDs A, B, C. Show feedback only after submission. Submitting with no choice says “Choose an answer before checking.” Selecting an option alone never passes a check.

An incorrect submission retains the selection and shows the choice-specific explanation below. The learner can change the selection and retry without a score penalty or attempt limit. Tracing remains available. A correct submission shows the explanation and a textual Passed state.

### lesson2.binding — How do the words select a method?

Show `Given a vaccination for patient "Patient/patient-001"` above the question.

**Question:** How does Reqnroll connect this Gherkin step to a C# method?

- **A (correct):** It matches the step text to a binding attribute such as `[Given("a vaccination for patient {string}")]`, captures the quoted value, and passes it to the method.
- **B:** It converts the sentence into a C# method name and calls that method.
- **C:** It uses the step's position in the feature file to choose a method.

Feedback A: “The [Binding] class contains the step definitions. The [Given] expression matches this step, and {string} captures the quoted patient reference for the method's patientReference argument.”

Feedback B: “The method name does not determine which sentence matches. Look at the expression in the [Given] attribute.”

Feedback C: “Step order determines the scenario's sequence, but it does not choose the matching method. Look at the binding attribute's expression.”

### lesson2.patient — Where does the captured value go?

**Question:** Where does `"Patient/patient-001"` from the Given step end up in the request JSON?

- **A (correct):** `patient.reference`
- **B:** `id`
- **C:** `vaccineCode.text`

Feedback A: “The captured value becomes patientReference, is assigned to Patient.Reference, and is serialized as patient.reference.”

Feedback B: “The resource ID identifies the vaccination record and is assigned by the simulated server. Follow the Given method's Patient assignment.”

Feedback C: “vaccineCode.text describes the vaccine. Follow where the Given method stores the patientReference argument.”

### lesson3.json-name — How are the names connected?

**Question:** What connects the C# property `OccurrenceDateTime` to the JSON field `occurrenceDateTime` in this example?

- **A:** The property's position in the class.
- **B (correct):** Its `[JsonPropertyName("occurrenceDateTime")]` attribute.
- **C:** The Gherkin step's wording.

Feedback A: “Property order does not specify the JSON name. Inspect the attribute immediately above the property.”

Feedback B: “JsonPropertyName specifies the JSON field name used when mapping this C# property to or from JSON.”

Feedback C: “Gherkin selects step bindings; it does not name JSON fields. Inspect the model property's attribute.”

### lesson4.send — Which statement submits the request?

**Question:** Which statement submits the prepared HTTP request in the illustrated C# test?

- **A:** `JsonSerializer.Serialize(_request)`
- **B:** `new HttpRequestMessage(HttpMethod.Post, "Immunization")`
- **C (correct):** `await Client.SendAsync(message)`

Feedback A: “Serialization produces the JSON content; it does not send it. Find the call on the HTTP client.”

Feedback B: “Constructing the message prepares its method and URL. Find the call that uses the client to submit it.”

Feedback C: “SendAsync submits the message and returns the response, which this example stores in _response. This tutorial illustrates that call without executing it.”

### lesson5.assertion — Why check the returned values?

**Question:** Why compare the returned lot number with the submitted one?

- **A:** A 201 status automatically guarantees every returned field is correct.
- **B (correct):** A successful HTTP status alone does not prove the returned data matches the request.
- **C:** The comparison changes an incorrect returned lot number to the submitted value.

Feedback A: “A successful creation status and correct returned data are separate expectations. A field may still differ from what was submitted.”

Feedback B: “The assertion checks actual.LotNumber against _request.LotNumber. It detects a mismatch even if the response status indicates success.”

Feedback C: “An assertion checks a condition; it does not repair the response. A mismatch would fail the assertion in a real test.”

## Completion and invalidation

Keep separate code-check and understanding-check state. Display both so a learner can see, for example, “Code passed · Understanding 1 of 2 passed.”

- Lesson 1 retains Continue and needs no new question.
- Lessons 2–5 are complete only when their current code has passed Check my work and all assigned understanding questions have passed for their current selections.
- Passing either requirement first is allowed. Completing the remaining requirement completes the lesson and unlocks its successor.
- An incorrect or unanswered question does not erase a valid code check.
- Editing code invalidates that lesson's code pass and clears simulation results/overall completion, while preserving all question selections and question passes.
- Changing a question selection invalidates that question's pass until resubmitted, marks the lesson incomplete, and clears simulation results/overall completion. It does not invalidate the code check or other questions.
- Previously unlocked lessons remain accessible after either kind of edit. Other lessons' answers and valid checks remain intact.
- Show solution and tracing never count as checks.
- Enable Run simulated test only when lesson 1 is complete, all four current code checks pass, and all five current understanding checks pass. Revalidate these conditions when running and when restoring saved state.
- Maintain Locked, Available, Needs check, and Complete navigation states. Use Needs check for an accessible lesson that has passed code but still needs understanding checks, with text identifying the missing requirement.

## Final walkthrough

After a successful simulation, offer **Walk through my test** alongside the existing recap and review actions. The walkthrough is optional and has no additional quiz or completion gate.

Use the learner's assembled completed files and the existing deterministic request/response, preserving accepted formatting in their answers. Label the view **Your completed test — simulated walkthrough**. Do not execute or interpret learner code. Explicit mappings identify the relevant template regions and fixture fields.

Provide five ordered stages with Back, Next, and Close:

1. Given sentence → binding attribute → captured patient argument → request patient reference.
2. Model properties → JSON names and nested fields.
3. When sentence → binding → prepared POST message → SendAsync → stored response.
4. Then status sentence → integer argument → status assertion.
5. And data sentence → Then binding → deserialized response → patient and lot comparisons.

Show the relevant code and exchange fragments with a plain-language explanation at each stage. Opening, navigating, or closing never changes answers or completion. If an edit invalidates the simulation, close/hide this final walkthrough until a new successful simulation; lesson traces remain available.

## Persistence and migration

Keep browser-local progress and the existing storage-error behavior. Introduce storage key and schema version `atft.iteration002.progress.v1`, with content version `2`. Retain the iteration 001 state fields and add question selections and last-successfully-checked selections keyed by the five question IDs. Derive question pass states from known option IDs, equality with the last checked selection, and the canonical correct option; never trust a stored pass flag.

If iteration 002 state exists, load it without falling back to stale iteration 001 state. Apply the existing malformed/incompatible-state recovery behavior to invalid state. If no iteration 002 state exists, look for `atft.iteration001.progress.v1` with its known schema and content version `1`:

1. Validate it using iteration 001's contract.
2. Preserve gap values, last checked code values, current lesson, reading completion, and highest unlocked lesson.
3. Revalidate code checks against the retained canonical answers. Store code passes independently of the new composite lesson status.
4. Initialize all five understanding checks unanswered and unchecked. Clear simulation completion and rendered results even if iteration 001 was completed.
5. Preserve previously unlocked navigation. Do not unlock additional lessons solely because migrated code passes.
6. Show: “We’ve added checks to help you understand how the test fits together. Your work is saved. Complete the new checks to finish the updated tutorial.”
7. Save the migrated state to the iteration 002 key. Remove the old key only after the new save succeeds. If saving fails, retain the old key and continue with migrated in-memory progress plus the existing storage warning.

Persist new selections and checked selections with the existing edits/navigation. A refresh restores valid question and code checks without granting a pass merely for selecting the correct answer. Trace panel navigation need not be saved. The migration notice appears for the migration session; a successful subsequent load need not repeat it.

Start over retains the existing confirmation. Cancel changes nothing. Confirm clears both tutorial version keys so old progress cannot reappear, but leaves unrelated localStorage entries intact. Preserve graceful in-memory operation when storage access is denied or writes fail.

## Accessibility and presentation

Extend the current IDE-style layout rather than introducing a new application shell. Radio groups use fieldsets/legends or equivalent accessible semantics; every option has a readable label. Associate feedback with its question and announce submissions through a live region. Convey incomplete/passed state in text, not just color.

Use keyboard-operable buttons and visible focus. On opening a trace, focus its labelled heading; on closing, return focus to its trigger. Next and Back retain predictable focus and announce the new connection. Do not trap focus in the inline panel. Keep controls and explanations usable at the iteration 001 desktop and narrow viewport sizes. Render all code and learner values as text.

## Implementation guidance

Keep questions, correct options, choice-specific feedback, and trace connections in explicit lesson content. Reuse fixture/code-template sources. Extend pure progression and persistence helpers to track independent code and understanding checks; do not derive one from the other. Keep rendering separate from validation and migration logic. No AI service, language runtime, general-purpose parser, or new backend is necessary.

## Acceptance criteria and verification

1. Lessons 2–5 expose the specified optional traces, all marked as correct examples. Blank or incorrect learner answers remain unchanged after opening, navigating, and closing a trace.
2. Traces explicitly explain Reqnroll's attribute matching, [Binding], captured string/integer arguments, and And continuing Then. They do not imply natural-language guessing, method-name matching, or method-order matching.
3. Model, request, and response traces display the canonical fixture values and explain the specified connections without drifting from iteration 001 code.
4. All five questions have the specified three choices and feedback. Empty submissions request a selection; wrong submissions allow retries; only a submitted correct choice passes.
5. Lesson 2 requires both questions plus its code exercise. Lessons 3–5 each require their question plus their code exercise. Completing requirements in either order unlocks the successor exactly when both requirements are met.
6. Changing a passed code answer preserves understanding passes, invalidates the code pass, and blocks simulation. Changing a passed question selection preserves the code pass but requires the question to be checked again. Neither change relocks previously unlocked navigation.
7. Tracing and Show solution do not alter progress. The final simulation requires all five checks and all existing code/reading requirements and still produces the same simulated result.
8. The optional final walkthrough appears only after a successful simulation, uses the learner's assembled completed code, covers all five stages, and adds no new assessment gate. Invalidating completion removes stale walkthrough/results.
9. Migrating valid partial and completed iteration 001 saves preserves code, valid code checks, and unlocked navigation; introduces five unanswered questions; clears completion; and shows the migration explanation. Merely changing version constants and resetting progress does not satisfy this criterion.
10. Refresh preserves newly submitted correct answers and distinguishes them from unsubmitted selections. Known iteration 002 state takes precedence over old state. Invalid storage recovers safely; failed migration writes preserve the old save and allow in-memory learning.
11. Reset cancellation preserves state; confirmation clears both tutorial keys and no unrelated keys. Old progress does not return after reset and reload.
12. All new interactions work with keyboard navigation, labelled choices, associated feedback, visible focus, non-color-only highlights, and narrow layouts. No code execution or unexpected external requests are introduced.

Extend Vitest tests for independent checks, both completion orders, edits/rechecks, migration of partial and completed saves, version precedence, and denied storage. Extend Playwright flows for a trace round-trip without mutation, wrong-answer retries, both lesson 2 questions, updated completion gates, final walkthrough, refresh, migration, and reset. Retain existing iteration 001 regression coverage with expected progression assertions updated for the new gates.

From `atft/`, run `npm test`, `npm run test:e2e`, and `npm run build`. Update the application README to explain tracing, the five required checks, and retained progress. No implementation or tests are run as part of authoring this specification.

## Agreement and next step

The user agreed to optional tracing during lessons plus a final walkthrough, required multiple-choice understanding checks, preserved existing progress, correct-example lesson traces, and an additional question about Reqnroll binding natural-language steps to coded methods. The detailed wording, trace sequence, and storage defaults in this document turn those decisions into a reviewable implementation specification.

Review this document before a separate implementation task. Do not fetch a new factory-course iteration or run the factory automatically: this is iteration 002 of the ATFT product.
