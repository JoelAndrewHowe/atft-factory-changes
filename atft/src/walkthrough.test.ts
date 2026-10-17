import { describe, expect, it } from 'vitest';
import { buildWalkthroughStages } from './walkthrough';
import { assembleCode, canonicalAnswers, learnerFeatureFile, learnerImmunizationFile, learnerStepsFile, stripRegionMarkers } from './lessons';

describe('walkthrough', () => {
  const stages = buildWalkthroughStages(canonicalAnswers as unknown as Record<string, string>);

  it('every highlight string appears in its excerpt content', () => {
    for (const stage of stages) {
      for (const excerpt of stage.excerpts) {
        if (excerpt.highlight !== undefined) {
          expect(
            excerpt.content.indexOf(excerpt.highlight),
            `Walkthrough stage ${stage.id} excerpt "${excerpt.label}" does not contain highlight: ${excerpt.highlight}`,
          ).toBeGreaterThanOrEqual(0);
        }
      }
    }
  });

  it('maps each stage to its intended Gherkin sentence, independently of line positions', () => {
    const expected = [
      'Given a vaccination for patient "Patient/patient-001"',
      'When I submit the vaccination',
      'Then the response status is 201',
      'And the recorded vaccination matches the request',
    ];
    for (const [index, stageId] of ['wt-given', 'wt-request', 'wt-status', 'wt-data'].entries()) {
      const stage = stages.find((item) => item.id === stageId)!;
      expect(stage.excerpts[0].label).toBe('RecordVaccination.feature');
      expect(stage.excerpts[0].content.trim()).toBe(expected[index]);
      expect(stage.excerpts[0].highlight).toBe(expected[index]);
    }
  });

  it('connects the captured patient argument to its request assignment in stage 1', () => {
    const assignment = stages[0].excerpts[2];
    expect(assignment.label).toBe('RecordVaccinationSteps.cs');
    expect(assignment.content).toContain('Patient = new PatientReference { Reference = patientReference }');
    expect(assignment.highlight).toBe('Reference = patientReference');
  });

  it('keeps accepted whitespace variants in mapped excerpts and highlights', () => {
    const variants = {
      ...canonicalAnswers,
      'feature.given': ' Given ',
      'feature.patient': ' Patient/patient-001 ',
      'request.method': ' Post ',
      'response.patient': '_request . Patient . Reference',
      'response.lot': ' _request.LotNumber ',
    };
    const result = buildWalkthroughStages(variants);
    expect(result[0].excerpts[0].content).toContain(' Given  a vaccination');
    expect(result[0].excerpts[2].highlight).toBe('Reference = patientReference');
    expect(result[2].excerpts[2].content).toContain('HttpMethod. Post ');
    expect(result[4].excerpts[3].content).toContain('_request . Patient . Reference');
    const assembled = [learnerFeatureFile, learnerImmunizationFile, learnerStepsFile].map((file) =>
      stripRegionMarkers(assembleCode(file.segments, variants)),
    );
    for (const stage of result) {
      for (const excerpt of stage.excerpts) {
        expect(excerpt.content).not.toMatch(/\/\/ (?:end)?region:/);
        if (excerpt.highlight) expect(excerpt.content).toContain(excerpt.highlight);
        if (excerpt.label.endsWith('.cs') || excerpt.label.endsWith('.feature')) {
          expect(assembled.some((source) => source.includes(excerpt.content.trim())), `${stage.id}: ${excerpt.content}`).toBe(true);
        }
      }
    }
  });
});
