// Thin typed loader for the synthetic benefit-enrollment reference tables
// (AI-CODING-CONVENTIONS §2: data lives in *.json, code loads it).
// Office and agency names, addresses, phones and portal domains are synthetic and
// identify no real agency; program names are federal/state program identifiers.
import seed from './data/enrollment-offices.json';

export interface EnrollmentOffice {
  name: string;
  address: string;
  phone: string;
  hours: string;
}

export const BENEFITS_PORTAL = seed.portal;
export const HOUSING_AGENCY = seed.housingAgency;
export const ANCHOR_CBO_ORG: string = seed.anchorCbo;
export const DEFAULT_OFFICE: EnrollmentOffice = seed.defaultOffice;
export const ENROLLMENT_OFFICES: Record<string, EnrollmentOffice> = seed.offices;
export const PROGRAM_MONTHLY_VALUES: Record<string, string> = seed.monthlyValues;
export const PROGRAM_DOCUMENTS: Record<string, string[]> = seed.documents;
export const DEFAULT_DOCUMENTS: string[] = seed.defaultDocuments;

/** Office for a program, falling back to the district benefits office. */
export function officeForProgram(programName: string): EnrollmentOffice {
  return ENROLLMENT_OFFICES[programName] ?? DEFAULT_OFFICE;
}
