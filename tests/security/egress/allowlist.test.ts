import { describe, it, expect } from 'vitest';
import {
  checkOutboundUrl,
  assertAllowedOutboundUrl,
  EgressBlockedError,
  parseAllowedHosts,
} from '@/lib/security/egress/allowlist';

const DEV = { allowPrivateNetwork: true };
const PROD = { allowPrivateNetwork: false };

describe('egress allowlist — parsing & protocol', () => {
  it('rejects a non-absolute or non-http(s) URL', () => {
    expect(checkOutboundUrl('not-a-url', PROD).allowed).toBe(false);
    expect(checkOutboundUrl('ftp://runner/api', PROD).allowed).toBe(false);
    expect(checkOutboundUrl('file:///etc/passwd', PROD).allowed).toBe(false);
  });
});

describe('egress allowlist — metadata/link-local ALWAYS blocked (even in dev)', () => {
  const alwaysBlocked = [
    'http://169.254.169.254/latest/meta-data/', // IMDS
    'http://metadata.google.internal/computeMetadata/v1/',
    'https://svc.cluster.local/run',
    'http://foo.internal/x',
    'http://169.254.10.20/x', // link-local range
  ];
  for (const url of alwaysBlocked) {
    it(`blocks ${url} in dev AND prod`, () => {
      expect(checkOutboundUrl(url, DEV).allowed).toBe(false); // <-- key: dev does NOT relax metadata
      expect(checkOutboundUrl(url, PROD).allowed).toBe(false);
    });
  }
});

describe('egress allowlist — loopback/private relax only in dev', () => {
  const privateHosts = [
    'http://localhost:8080',
    'http://127.0.0.1:9000',
    'http://10.0.0.5/api',
    'http://192.168.1.10/api',
    'http://172.16.0.9/api',
    'http://[::1]:8080/api',
  ];
  for (const url of privateHosts) {
    it(`${url}: allowed in dev, blocked in prod`, () => {
      expect(checkOutboundUrl(url, DEV).allowed).toBe(true);
      expect(checkOutboundUrl(url, PROD).allowed).toBe(false);
    });
  }

  it('permits a public host in both dev and prod when no allowlist is configured', () => {
    expect(checkOutboundUrl('https://runner.example.com/api', DEV).allowed).toBe(true);
    expect(checkOutboundUrl('https://runner.example.com/api', PROD).allowed).toBe(true);
  });
});

describe('egress allowlist — host allowlist', () => {
  it('permits only hosts on the allowlist; empty allowlist denies all', () => {
    const policy = { allowPrivateNetwork: false, allowedHosts: ['runner.example.com'] };
    expect(checkOutboundUrl('https://runner.example.com/api', policy).allowed).toBe(true);
    expect(checkOutboundUrl('https://evil.example.com/api', policy).allowed).toBe(false);
    expect(
      checkOutboundUrl('https://runner.example.com/api', {
        allowPrivateNetwork: false,
        allowedHosts: [],
      }).allowed
    ).toBe(false);
  });
});

describe('egress allowlist — assert + parse helpers', () => {
  it('assertAllowedOutboundUrl throws on a blocked URL and returns host otherwise', () => {
    expect(() => assertAllowedOutboundUrl('http://169.254.169.254/', PROD)).toThrow(
      EgressBlockedError
    );
    expect(assertAllowedOutboundUrl('https://runner.example.com/api', PROD)).toBe(
      'runner.example.com'
    );
  });

  it('parseAllowedHosts splits on commas/whitespace and lowercases; empty => undefined', () => {
    expect(parseAllowedHosts(undefined)).toBeUndefined();
    expect(parseAllowedHosts('   ')).toBeUndefined();
    expect(parseAllowedHosts('Runner.Example.com, other.test')).toEqual([
      'runner.example.com',
      'other.test',
    ]);
  });
});
