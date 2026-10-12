import { describe, expect, it } from 'vitest';
import {
  allValid,
  assertGapCoverage,
  firstInvalidGapId,
  normalizeGap,
  validateGap,
  validateGaps,
} from './validation';
import { ALL_GAP_IDS, canonicalAnswers, gapDefinitions } from './lessons';

describe('normalizeGap', () => {
  it('trims surrounding whitespace for all gaps', () => {
    expect(normalizeGap('feature.given', '  Given  ')).toBe('Given');
    expect(normalizeGap('feature.patient', '  Patient/patient-001  ')).toBe('Patient/patient-001');
    expect(normalizeGap('model.vaccine', '  CodeableConcept  ')).toBe('CodeableConcept');
  });

  it('preserves internal whitespace for string gaps', () => {
    expect(normalizeGap('feature.patient', 'Patient / patient-001')).toBe('Patient / patient-001');
    expect(normalizeGap('request.media', 'application / fhir+json')).toBe('application / fhir+json');
  });

  it('does not modify tokens without dots', () => {
    expect(normalizeGap('feature.given', 'Given')).toBe('Given');
    expect(normalizeGap('feature.when', 'When')).toBe('When');
    expect(normalizeGap('model.vaccine', 'CodeableConcept')).toBe('CodeableConcept');
  });

  it('allows and normalizes whitespace around dots for response.patient', () => {
    expect(normalizeGap('response.patient', '_request.Patient.Reference')).toBe(
      '_request.Patient.Reference',
    );
    expect(normalizeGap('response.patient', '_request . Patient . Reference')).toBe(
      '_request.Patient.Reference',
    );
    expect(normalizeGap('response.patient', '  _request .Patient.  Reference  ')).toBe(
      '_request.Patient.Reference',
    );
  });

  it('allows and normalizes whitespace around dots for response.lot', () => {
    expect(normalizeGap('response.lot', '_request.LotNumber')).toBe('_request.LotNumber');
    expect(normalizeGap('response.lot', '_request . LotNumber')).toBe('_request.LotNumber');
    expect(normalizeGap('response.lot', '  _request  .  LotNumber  ')).toBe('_request.LotNumber');
  });

  it('preserves case exactly', () => {
    expect(normalizeGap('feature.given', 'given')).toBe('given');
    expect(normalizeGap('model.vaccine', 'codeableConcept')).toBe('codeableConcept');
  });

  it('preserves internal string whitespace for occurrenceDateTime', () => {
    expect(normalizeGap('model.date', 'occurrenceDateTime')).toBe('occurrenceDateTime');
  });
});

describe('validateGap', () => {
  it('passes every canonical answer exactly', () => {
    for (const id of ALL_GAP_IDS) {
      const result = validateGap(id, canonicalAnswers[id]);
      expect(result.valid, `canonical answer for ${id} should pass`).toBe(true);
      expect(result.isEmpty).toBe(false);
      expect(result.feedback).toBe('');
    }
  });

  it('passes canonical answers with surrounding whitespace', () => {
    for (const id of ALL_GAP_IDS) {
      const result = validateGap(id, `  ${canonicalAnswers[id]}  `);
      expect(result.valid, `whitespace-surrounded answer for ${id} should pass`).toBe(true);
    }
  });

  it('passes dotted expressions with whitespace around dots', () => {
    expect(validateGap('response.patient', '_request . Patient . Reference').valid).toBe(true);
    expect(validateGap('response.lot', '_request . LotNumber').valid).toBe(true);
  });

  it('fails empty input with emptyFeedback', () => {
    for (const id of ALL_GAP_IDS) {
      const result = validateGap(id, '');
      expect(result.valid).toBe(false);
      expect(result.isEmpty).toBe(true);
      expect(result.feedback).toBe(gapDefinitions[id].emptyFeedback);
    }
  });

  it('fails whitespace-only input as empty', () => {
    for (const id of ALL_GAP_IDS) {
      const result = validateGap(id, '   \t\n  ');
      expect(result.valid).toBe(false);
      expect(result.isEmpty).toBe(true);
    }
  });

  it('fails wrong case', () => {
    expect(validateGap('feature.given', 'given').valid).toBe(false);
    expect(validateGap('feature.when', 'when').valid).toBe(false);
    expect(validateGap('model.vaccine', 'codeableconcept').valid).toBe(false);
  });

  it('fails altered string contents', () => {
    expect(validateGap('feature.patient', 'Patient/patient-002').valid).toBe(false);
    expect(validateGap('request.status', 'complete').valid).toBe(false);
    expect(validateGap('request.endpoint', 'Immunizations').valid).toBe(false);
  });

  it('fails extra quotes in string gaps', () => {
    expect(validateGap('feature.patient', '"Patient/patient-001"').valid).toBe(false);
    expect(validateGap('request.status', '"completed"').valid).toBe(false);
    expect(validateGap('request.media', '"application/fhir+json"').valid).toBe(false);
  });

  it('fails extra semicolons', () => {
    expect(validateGap('request.media', 'application/fhir+json;').valid).toBe(false);
    expect(validateGap('feature.given', 'Given;').valid).toBe(false);
  });

  it('fails extra tokens like parentheses or comments', () => {
    expect(validateGap('feature.given', 'Given()').valid).toBe(false);
    expect(validateGap('model.vaccine', 'CodeableConcept // wrong').valid).toBe(false);
    expect(validateGap('request.method', 'Post()').valid).toBe(false);
  });

  it('fails extra spaces inside tokens that are not dot-whitespace-tolerant', () => {
    expect(validateGap('model.vaccine', 'Codeable Concept').valid).toBe(false);
    expect(validateGap('feature.given', 'Giv en').valid).toBe(false);
  });

  it('returns incorrectFeedback for non-empty wrong answers', () => {
    for (const id of ALL_GAP_IDS) {
      const result = validateGap(id, 'definitely-wrong');
      expect(result.valid).toBe(false);
      expect(result.isEmpty).toBe(false);
      expect(result.feedback).toBe(gapDefinitions[id].incorrectFeedback);
    }
  });

  it('fails response.patient with altered dot structure', () => {
    expect(validateGap('response.patient', '_request.PatientReference').valid).toBe(false);
    expect(validateGap('response.patient', 'request.Patient.Reference').valid).toBe(false);
  });

  it('fails response.lot with missing underscore', () => {
    expect(validateGap('response.lot', 'request.LotNumber').valid).toBe(false);
  });
});

describe('validateGaps', () => {
  it('validates multiple gaps at once', () => {
    const results = validateGaps(
      ['feature.given', 'feature.patient', 'feature.when'],
      {
        'feature.given': 'Given',
        'feature.patient': 'Patient/patient-001',
        'feature.when': 'When',
      },
    );
    expect(results['feature.given'].valid).toBe(true);
    expect(results['feature.patient'].valid).toBe(true);
    expect(results['feature.when'].valid).toBe(true);
  });

  it('reports mixed results', () => {
    const results = validateGaps(
      ['feature.given', 'feature.patient'],
      {
        'feature.given': 'Given',
        'feature.patient': 'WrongPatient',
      },
    );
    expect(results['feature.given'].valid).toBe(true);
    expect(results['feature.patient'].valid).toBe(false);
    expect(results['feature.patient'].feedback).toBe(
      gapDefinitions['feature.patient'].incorrectFeedback,
    );
  });
});

describe('allValid', () => {
  it('returns true when all results are valid', () => {
    const results = validateGaps(
      ['feature.given', 'feature.when'],
      { 'feature.given': 'Given', 'feature.when': 'When' },
    );
    expect(allValid(results)).toBe(true);
  });

  it('returns false when any result is invalid', () => {
    const results = validateGaps(
      ['feature.given', 'feature.when'],
      { 'feature.given': 'Given', 'feature.when': 'wrong' },
    );
    expect(allValid(results)).toBe(false);
  });
});

describe('firstInvalidGapId', () => {
  it('returns undefined when all valid', () => {
    const results = validateGaps(
      ['feature.given', 'feature.when'],
      { 'feature.given': 'Given', 'feature.when': 'When' },
    );
    expect(firstInvalidGapId(['feature.given', 'feature.when'], results)).toBeUndefined();
  });

  it('returns the first invalid gap in order', () => {
    const results = validateGaps(
      ['feature.given', 'feature.when', 'feature.then'],
      { 'feature.given': 'Given', 'feature.when': 'wrong', 'feature.then': 'wrong' },
    );
    expect(firstInvalidGapId(['feature.given', 'feature.when', 'feature.then'], results)).toBe(
      'feature.when',
    );
  });
});

describe('assertGapCoverage', () => {
  it('does not throw because all gaps have canonical answers', () => {
    expect(() => assertGapCoverage()).not.toThrow();
  });
});
