/**
 * App Configuration for Standalone Demo
 *
 * This is a simplified configuration for the standalone demo.
 * The full implementation exists in the main TCoC project.
 */

export const appConfig = {
  useMockData: process.env.NEXT_PUBLIC_USE_MOCK_DATA === 'true',
  fhirBaseUrl: process.env.NEXT_PUBLIC_FHIR_BASE_URL || 'http://localhost:8080/fhir',
  smartClientId: process.env.NEXT_PUBLIC_SMART_CLIENT_ID || 'tcoc-smart-app',
  smartRedirectUri:
    process.env.NEXT_PUBLIC_SMART_REDIRECT_URI || 'http://localhost:3000/smart-callback',
  dev: {
    enableDebugLogging: process.env.NODE_ENV === 'development',
  },
};

export function shouldUseMockData(): boolean {
  return appConfig.useMockData;
}

export function getFhirBaseUrl(): string {
  return appConfig.fhirBaseUrl;
}

export function getSmartClientId(): string {
  return appConfig.smartClientId;
}

export function getSmartRedirectUri(): string {
  return appConfig.smartRedirectUri;
}

// Made with Bob
