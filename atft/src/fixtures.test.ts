import { describe, expect, it } from 'vitest';
import {
  headers,
  learner,
  learnerLocation,
  learnerRequestBody,
  learnerResponseBody,
  makeLocation,
  serviceBase,
  statusCreated,
  worked,
  workedLocation,
  workedRequestBody,
  workedResponseBody,
} from './fixtures';

describe('fixtures', () => {
  it('has the correct service base', () => {
    expect(serviceBase).toBe('https://fhir.example.test/');
  });

  it('has correct learner fixture values', () => {
    expect(learner.patientReference).toBe('Patient/patient-001');
    expect(learner.vaccineText).toBe('Influenza vaccine');
    expect(learner.occurrenceDateTime).toBe('2026-01-15');
    expect(learner.lotNumber).toBe('TRAINING-FLU-001');
    expect(learner.assignedId).toBe('imm-001');
  });

  it('has correct worked fixture values', () => {
    expect(worked.patientReference).toBe('Patient/patient-002');
    expect(worked.vaccineText).toBe('Hepatitis B vaccine');
    expect(worked.occurrenceDateTime).toBe('2026-02-20');
    expect(worked.lotNumber).toBe('TRAINING-HEPB-002');
    expect(worked.assignedId).toBe('imm-002');
  });

  it('has correct headers', () => {
    expect(headers.accept).toBe('application/fhir+json');
    expect(headers.contentType).toBe('application/fhir+json; charset=utf-8');
    expect(headers.prefer).toBe('return=representation');
  });

  it('builds learner request body', () => {
    expect(learnerRequestBody).toEqual({
      resourceType: 'Immunization',
      status: 'completed',
      vaccineCode: { text: 'Influenza vaccine' },
      patient: { reference: 'Patient/patient-001' },
      occurrenceDateTime: '2026-01-15',
      lotNumber: 'TRAINING-FLU-001',
    });
  });

  it('builds worked request body', () => {
    expect(workedRequestBody).toEqual({
      resourceType: 'Immunization',
      status: 'completed',
      vaccineCode: { text: 'Hepatitis B vaccine' },
      patient: { reference: 'Patient/patient-002' },
      occurrenceDateTime: '2026-02-20',
      lotNumber: 'TRAINING-HEPB-002',
    });
  });

  it('builds learner response body with assigned id', () => {
    expect(learnerResponseBody).toEqual({
      ...learnerRequestBody,
      id: 'imm-001',
    });
  });

  it('builds worked response body with assigned id', () => {
    expect(workedResponseBody).toEqual({
      ...workedRequestBody,
      id: 'imm-002',
    });
  });

  it('has the correct creation status', () => {
    expect(statusCreated).toBe(201);
  });

  it('builds correct location URLs', () => {
    expect(makeLocation('imm-001')).toBe(
      'https://fhir.example.test/Immunization/imm-001/_history/1',
    );
    expect(learnerLocation).toBe(
      'https://fhir.example.test/Immunization/imm-001/_history/1',
    );
    expect(workedLocation).toBe(
      'https://fhir.example.test/Immunization/imm-002/_history/1',
    );
  });
});
