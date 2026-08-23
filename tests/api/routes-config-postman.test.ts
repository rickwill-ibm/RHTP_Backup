/**
 * Route coverage (conventions §14): /api/config-status, /api/postman-collection,
 * /api/postman-environment, /api/postman-run - demo tooling surfaces.
 *
 * These routes are deliberately unauthenticated setup/tooling endpoints (they
 * expose no member PHI and never the wso2ClientSecret) - tested as they exist.
 * POSTs to config-status persist .rhtp-config.json at the repo root; the tests
 * restore the pre-test state so no artifact is left behind.
 */
import { describe, it, expect, beforeAll, afterEach } from 'vitest';
import fs from 'fs';
import path from 'path';
import { makeRequest, readJson, resetRouteEnv, expectPhiSafeError } from './_helpers';

import { GET as configGET, POST as configPOST } from '@/app/api/config-status/route';
import { GET as collectionGET } from '@/app/api/postman-collection/route';
import { GET as environmentGET } from '@/app/api/postman-environment/route';
import { POST as postmanRunPOST } from '@/app/api/postman-run/route';

const CONFIG_PATH = path.resolve(process.cwd(), '.rhtp-config.json');
let preExistingConfig: string | null = null;

beforeAll(() => {
  preExistingConfig = fs.existsSync(CONFIG_PATH)
    ? fs.readFileSync(CONFIG_PATH, 'utf8')
    : null;
});

afterEach(() => {
  resetRouteEnv();
  if (preExistingConfig === null) {
    if (fs.existsSync(CONFIG_PATH)) fs.unlinkSync(CONFIG_PATH);
  } else {
    fs.writeFileSync(CONFIG_PATH, preExistingConfig, 'utf8');
  }
});

describe('GET /api/config-status', () => {
  it('200 returns the runtime config surface (happy path)', async () => {
    const res = await configGET();
    expect(res.status).toBe(200);
    const body = (await readJson(res)) as {
      mode: string;
      appPort: number;
      mandateSections: string[];
      wso2Configured: boolean;
    };
    expect(['mock', 'production']).toContain(body.mode);
    expect(body.appPort).toBe(4029);
    expect(body.mandateSections.length).toBeGreaterThan(0);
    expect(typeof body.wso2Configured).toBe('boolean');
  });

  it('never exposes the wso2ClientSecret (secret-safety invariant)', async () => {
    const res = await configGET();
    const raw = JSON.stringify(await readJson(res));
    expect(raw).not.toContain('wso2ClientSecret');
    expect(raw.toLowerCase()).not.toContain('clientsecret');
  });
});

describe('POST /api/config-status', () => {
  it('400 with a PHI-safe body on a malformed JSON body (validation)', async () => {
    const res = await configPOST(
      makeRequest('/api/config-status', { method: 'POST', rawBody: '{bad' })
    );
    await expectPhiSafeError(res, 400);
  });

  it('200 merges and persists a partial patch (happy path)', async () => {
    const res = await configPOST(
      makeRequest('/api/config-status', {
        method: 'POST',
        body: { postmanPatientId: 'PAT-0087' },
      })
    );
    expect(res.status).toBe(200);
    const body = (await readJson(res)) as {
      ok: boolean;
      postmanPatientId: string;
      lastSaved: string | null;
    };
    expect(body.ok).toBe(true);
    expect(body.postmanPatientId).toBe('PAT-0087');
    expect(body.lastSaved).toBeTruthy();
  });

  it('strips a client-injected wso2ClientSecret before persisting (secret-safety)', async () => {
    const res = await configPOST(
      makeRequest('/api/config-status', {
        method: 'POST',
        body: { wso2ClientSecret: 'attacker-value', postmanPatientId: 'MARIA_SD_001' },
      })
    );
    expect(res.status).toBe(200);
    const persisted = fs.readFileSync(CONFIG_PATH, 'utf8');
    expect(persisted).not.toContain('attacker-value');
  });
});

describe('GET /api/postman-collection', () => {
  it('200 streams the collection as an attachment (happy path)', async () => {
    const res = await collectionGET(
      makeRequest('/api/postman-collection?patient=MARIA_SD_001')
    );
    expect(res.status).toBe(200);
    expect(res.headers.get('content-disposition')).toContain('attachment');
    const body = (await readJson(res)) as {
      info: { name: string };
      item: { name: string }[];
    };
    expect(body.info.name).toContain('MARIA_SD_001');
    expect(body.item.length).toBeGreaterThan(0);
  });

  it('200 filters items to the requested mandate scopes (validation of scope handling)', async () => {
    const res = await collectionGET(
      makeRequest('/api/postman-collection?patient=MARIA_SD_001&scopes=patientAccess')
    );
    expect(res.status).toBe(200);
    const body = (await readJson(res)) as { item: { name: string }[] };
    for (const item of body.item) {
      expect(
        item.name.startsWith('§1') || item.name.startsWith('§0'),
        `unexpected out-of-scope item "${item.name}"`
      ).toBe(true);
    }
  });
});

describe('GET /api/postman-environment', () => {
  it('200 generates an environment file keyed to the requested patient (happy path)', async () => {
    const res = await environmentGET(
      makeRequest('/api/postman-environment?patient=MARIA_SD_001&mode=mock')
    );
    expect(res.status).toBe(200);
    expect(res.headers.get('content-disposition')).toContain('attachment');
    const body = (await readJson(res)) as {
      values: { key: string; value: string }[];
    };
    const byKey = Object.fromEntries(body.values.map((v) => [v.key, v.value]));
    expect(byKey.patientId).toBe('MARIA_SD_001');
    expect(byKey.baseUrl).toBeTruthy();
    expect(byKey.serverMode).toBe('mock');
  });

  it('never embeds a client secret in the generated environment (secret-safety)', async () => {
    const res = await environmentGET(
      makeRequest('/api/postman-environment?patient=MARIA_SD_001')
    );
    const raw = JSON.stringify(await readJson(res));
    expect(raw.toLowerCase()).not.toContain('clientsecret');
  });
});

describe('POST /api/postman-run', () => {
  it.skip('SSE Newman run - requires the app server listening on localhost:4029 (live collection run)', async () => {
    const res = await postmanRunPOST(
      makeRequest('/api/postman-run', { method: 'POST', body: { patientId: 'MARIA_SD_001' } })
    );
    expect(res.headers.get('content-type')).toContain('text/event-stream');
  });
});
