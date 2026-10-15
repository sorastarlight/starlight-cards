#!/usr/bin/env node
/**
 * Privileged RPC role matrix against production (read-only / deny probes).
 * Uses QA A/B from .local-review. Never prints passwords/JWTs.
 * Does not grant rewards, import inventory, or mutate admin content.
 *
 *   node scripts/qa-privileged-rpc-matrix.mjs
 */
import { readFile, writeFile, mkdir } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const reviewDir = path.join(root, '.local-review');
const outPath = path.join(reviewDir, 'privileged-rpc-matrix-evidence.json');
const SUPABASE_URL = 'https://noxfauxbfdqgoxgiwrpu.supabase.co';
const ANON_KEY = 'sb_publishable_2M6ZMyz6KXAkaKD6AI6Bvg_DxCh1-JW';

// Read-only / safe-fail probes only. No pause toggles, deletes, or grants.
const ADMIN_PROBES = [
  { fn: 'admin_list_news_posts', args: {} },
  { fn: 'admin_list_reward_codes', args: {} },
  { fn: 'admin_get_twitch_dashboard_v890', args: {} },
  { fn: 'admin_list_staff_users', args: {} },
  { fn: 'admin_get_booster_configuration', args: {} },
  { fn: 'admin_list_staff_audit_log', args: { requested_limit: 1 } },
  { fn: 'admin_get_content_studio', args: {} },
  {
    fn: 'admin_manual_twitch_reward_v890',
    args: {
      payload: {
        twitchLogin: 'qa_matrix_nonexistent',
        rewardType: 'star_bits',
        starBitsAmount: '1'
      }
    }
  }
];

const WORKER_ONLY = [
  {
    fn: 'apply_twitch_reward_v890',
    args: {
      requested_user_id: '00000000-0000-4000-8000-000000000099',
      requested_reward_type: 'star_bits',
      requested_star_bits: 0,
      requested_card_id: null,
      requested_card_quantity: null,
      requested_booster_id: null,
      requested_event_id: `qa-matrix-deny-${Date.now()}`,
      requested_rule_id: null,
      requested_twitch_user_id: 'qa_matrix',
      requested_source: 'qa_matrix',
      requested_granted_by: null
    }
  },
  {
    fn: 'deliver_twitch_season_unlock_v1',
    args: {
      requested_twitch_user_id: 'qa_matrix',
      requested_twitch_login: 'qa_matrix',
      requested_event_id: `qa-matrix-season-${Date.now()}`,
      requested_rule_id: null,
      requested_season_id: 'qa-nonexistent-season'
    }
  },
  {
    fn: 'confirm_twitch_subscription_access_v1',
    args: {
      requested_user_id: '00000000-0000-4000-8000-000000000099',
      requested_is_subscribed: true,
      requested_season_id: 'qa-nonexistent-season',
      requested_tier: '1000',
      requested_metadata: {}
    }
  }
];

function stripBom(text) {
  return String(text || '').replace(/^\uFEFF/, '');
}

function redactId(id) {
  const s = String(id || '');
  return s.length >= 8 ? `${s.slice(0, 8)}…` : s ? 'present' : null;
}

async function loadCreds() {
  const meta = JSON.parse(stripBom(await readFile(path.join(reviewDir, 'auth-test-meta.json'), 'utf8')));
  const password = stripBom(await readFile(path.join(reviewDir, 'auth-test-secret.txt'), 'utf8')).trim();
  if (!meta.emailA || !meta.emailB || password.length < 8) {
    throw new Error('QA identity/password mapping incomplete');
  }
  return {
    a: { email: meta.emailA, username: meta.userA, password },
    b: { email: meta.emailB, username: meta.userB, password }
  };
}

async function api(pathname, { method = 'GET', token, body } = {}) {
  const headers = {
    apikey: ANON_KEY,
    Authorization: `Bearer ${token || ANON_KEY}`
  };
  if (body !== undefined) headers['content-type'] = 'application/json';
  const res = await fetch(`${SUPABASE_URL}${pathname}`, {
    method,
    headers,
    body: body === undefined ? undefined : JSON.stringify(body)
  });
  const text = await res.text();
  let data = null;
  try {
    data = text ? JSON.parse(text) : null;
  } catch {
    data = text;
  }
  return { ok: res.ok, status: res.status, data };
}

async function signIn(account) {
  const res = await api('/auth/v1/token?grant_type=password', {
    method: 'POST',
    body: { email: account.email, password: account.password }
  });
  if (!res.ok) {
    throw new Error(`sign-in failed for ${account.username}: ${res.data?.error_description || res.data?.msg || res.status}`);
  }
  return {
    accessToken: res.data.access_token,
    userId: res.data.user?.id || res.data.user_id
  };
}

async function rpc(token, fn, args = {}) {
  const res = await api(`/rest/v1/rpc/${fn}`, { method: 'POST', token, body: args });
  return {
    ok: res.ok,
    status: res.status,
    code: res.data?.code || null,
    message: res.data?.message || res.data?.error || (res.ok ? null : JSON.stringify(res.data))
  };
}

function denied(result) {
  return !result.ok;
}

async function probeRole(label, token) {
  const admin = {};
  for (const probe of ADMIN_PROBES) {
    admin[probe.fn] = await rpc(token, probe.fn, probe.args);
  }
  const workerOnly = {};
  for (const probe of WORKER_ONLY) {
    workerOnly[probe.fn] = await rpc(token, probe.fn, probe.args);
  }
  // Invalid short hash — must fail without creating an import row.
  const legacyImport = await rpc(token, 'import_legacy_collection', {
    collected_card_ids: ['qa-matrix-nonexistent-card'],
    requested_import_hash: 'short'
  });
  const adminAllowed = ADMIN_PROBES.filter((p) => !denied(admin[p.fn])).map((p) => p.fn);
  const workerAllowed = WORKER_ONLY.filter((p) => !denied(workerOnly[p.fn])).map((p) => p.fn);
  const adminAllDenied = adminAllowed.length === 0;
  const workerAllDenied = workerAllowed.length === 0;
  return {
    label,
    adminAllDenied,
    workerAllDenied,
    adminAllowed,
    workerAllowed,
    legacyImportDenied: denied(legacyImport),
    legacyImport: {
      ok: legacyImport.ok,
      status: legacyImport.status,
      code: legacyImport.code,
      message: legacyImport.message
    },
    adminResults: Object.fromEntries(
      ADMIN_PROBES.map((p) => [
        p.fn,
        { ok: admin[p.fn].ok, status: admin[p.fn].status, code: admin[p.fn].code, message: admin[p.fn].message }
      ])
    ),
    workerSample: Object.fromEntries(
      WORKER_ONLY.map((p) => [
        p.fn,
        { ok: workerOnly[p.fn].ok, status: workerOnly[p.fn].status, code: workerOnly[p.fn].code }
      ])
    ),
    pass: adminAllDenied && workerAllDenied && denied(legacyImport)
  };
}

async function main() {
  await mkdir(reviewDir, { recursive: true });
  const creds = await loadCreds();
  const evidence = {
    ranAt: new Date().toISOString(),
    accounts: { a: creds.a.username, b: creds.b.username },
    notes: [
      'QA A/B are ordinary collectors (not staff). Staff-positive paths remain covered by isolated SQL suites.',
      'Probes are deny/error only; no admin mutations, Twitch grants, or successful legacy imports.'
    ],
    roles: {}
  };

  evidence.roles.anon = await probeRole('anon', ANON_KEY);

  const sessionA = await signIn(creds.a);
  evidence.roles.collectorA = {
    ...(await probeRole('collector_a', sessionA.accessToken)),
    userIdPrefix: redactId(sessionA.userId)
  };

  const sessionB = await signIn(creds.b);
  evidence.roles.collectorB = {
    ...(await probeRole('collector_b', sessionB.accessToken)),
    userIdPrefix: redactId(sessionB.userId),
    differentUser: sessionB.userId !== sessionA.userId
  };

  evidence.overallPass = Boolean(
    evidence.roles.anon.pass &&
      evidence.roles.collectorA.pass &&
      evidence.roles.collectorB.pass &&
      evidence.roles.collectorB.differentUser
  );

  evidence.limitations = [
    'Moderator / admin / owner positive EXECUTE paths were not live-probed (no staff QA credentials in .local-review).',
    'service_role positive grant path is Worker-only and not invoked here.',
    'Safe QA-linked Twitch EventSub live retry remains externally blocked.'
  ];

  await writeFile(outPath, JSON.stringify(evidence, null, 2), 'utf8');
  console.log(
    JSON.stringify(
      {
        evidenceFile: '.local-review/privileged-rpc-matrix-evidence.json',
        overallPass: evidence.overallPass,
        anonPass: evidence.roles.anon.pass,
        collectorAPass: evidence.roles.collectorA.pass,
        collectorBPass: evidence.roles.collectorB.pass,
        anonImportStatus: evidence.roles.anon.legacyImport.status,
        collectorAImportStatus: evidence.roles.collectorA.legacyImport.status,
        applyDenyA: evidence.roles.collectorA.workerSample.apply_twitch_reward_v890
      },
      null,
      2
    )
  );
  if (!evidence.overallPass) process.exitCode = 1;
}

main().catch((err) => {
  console.error(String(err?.message || err));
  process.exitCode = 1;
});
