/**
 * SMART Auth Service Stub for Standalone Demo
 *
 * This is a simplified stub for the standalone demo.
 * The full implementation exists in the main TCoC project.
 */

export interface SmartAuthService {
  isAuthenticated: () => boolean;
  getAccessToken: () => string | null;
  getUserInfo: () => any;
}

class MockSmartAuthService implements SmartAuthService {
  isAuthenticated(): boolean {
    return true; // Always authenticated in mock mode
  }

  getAccessToken(): string | null {
    return 'mock-access-token';
  }

  getUserInfo(): any {
    return {
      id: 'practitioner-001',
      name: 'Dr. James Whitfield',
      role: 'physician',
    };
  }
}

let authServiceInstance: SmartAuthService | null = null;

export function getSmartAuthService(): SmartAuthService {
  if (!authServiceInstance) {
    authServiceInstance = new MockSmartAuthService();
  }
  return authServiceInstance;
}

export const smartAuthService = {
  getSmartAuthService,
};

// Made with Bob
