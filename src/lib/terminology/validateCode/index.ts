/**
 * validateCode - real member-of-bound-version validation (I8A-ii wave A).
 *
 * Public surface for the versioned code validation, its membership data helpers,
 * and UCUM unit validation for LOINC quantitative results.
 */
export { validateCodeVersioned, bindingForSystem, type ValidateContext } from './validateCode';
export {
  isGovernedSystem,
  systemDisplay,
  currentMembers,
  membersForVersion,
  declaredCurrentVersion,
  retiredInCurrent,
  isRetiredInCurrent,
} from './membership';
export {
  validateUcumForLoinc,
  isValidUcumUnit,
  allowedUnitsForLoinc,
  type UcumValidation,
  type UcumFinding,
} from './ucum';
