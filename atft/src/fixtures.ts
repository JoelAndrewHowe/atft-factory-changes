export const serviceBase = 'https://fhir.example.test/';

export const learner = {
  patientReference: 'Patient/patient-001',
  vaccineText: 'Influenza vaccine',
  occurrenceDateTime: '2026-01-15',
  lotNumber: 'TRAINING-FLU-001',
  assignedId: 'imm-001',
} as const;

export const worked = {
  patientReference: 'Patient/patient-002',
  vaccineText: 'Hepatitis B vaccine',
  occurrenceDateTime: '2026-02-20',
  lotNumber: 'TRAINING-HEPB-002',
  assignedId: 'imm-002',
} as const;

export const headers = {
  accept: 'application/fhir+json',
  contentType: 'application/fhir+json; charset=utf-8',
  prefer: 'return=representation',
} as const;

export interface ImmunizationRequest {
  resourceType: 'Immunization';
  status: 'completed';
  vaccineCode: { text: string };
  patient: { reference: string };
  occurrenceDateTime: string;
  lotNumber: string;
}

export interface ImmunizationResponse extends ImmunizationRequest {
  id: string;
}

function makeRequestBody(fixture: {
  patientReference: string;
  vaccineText: string;
  occurrenceDateTime: string;
  lotNumber: string;
}): ImmunizationRequest {
  return {
    resourceType: 'Immunization',
    status: 'completed',
    vaccineCode: { text: fixture.vaccineText },
    patient: { reference: fixture.patientReference },
    occurrenceDateTime: fixture.occurrenceDateTime,
    lotNumber: fixture.lotNumber,
  };
}

export const learnerRequestBody = makeRequestBody(learner);
export const workedRequestBody = makeRequestBody(worked);

export const learnerResponseBody: ImmunizationResponse = {
  ...learnerRequestBody,
  id: learner.assignedId,
};

export const workedResponseBody: ImmunizationResponse = {
  ...workedRequestBody,
  id: worked.assignedId,
};

export function makeLocation(assignedId: string): string {
  return `${serviceBase}Immunization/${assignedId}/_history/1`;
}

export const learnerLocation = makeLocation(learner.assignedId);
export const workedLocation = makeLocation(worked.assignedId);

export const statusCreated = 201;

export const requestLines = [
  `POST ${serviceBase}Immunization`,
  `Accept: ${headers.accept}`,
  `Content-Type: ${headers.contentType}`,
  `Prefer: ${headers.prefer}`,
];
