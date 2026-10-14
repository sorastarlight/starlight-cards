#!/usr/bin/env node
/**
 * Authenticated QA smoke against production APIs (fetch-only, no deps).
 * Credentials from gitignored .local-review files. Never prints passwords/JWTs.
 *
 *   node scripts/qa-auth-smoke.mjs
 */
import { readFile, writeFile, mkdir } from 'node:fs/promises';
import { randomUUID } from 'node:crypto';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const reviewDir = path.join(root, '.local-review');
const outPath = path.join(reviewDir, 'qa-auth-smoke-evidence.json');
const SUPABASE_URL = 'https://noxfauxbfdqgoxgiwrpu.supabase.co';
const ANON_KEY = 'sb_publishable_2M6ZMyz6KXAkaKD6AI6Bvg_DxCh1-JW';

function redactId(id) {
  const s = String(id || '');
  return s.length >= 8 ? `${s.slice(0, 8)}…` : s ? 'present' : null;
}

function stripBom(text) {
  return String(text || '').replace(/^\uFEFF/, '');
}

async function loadCreds() {
  const meta = JSON.parse(
    stripBom(await readFile(path.join(reviewDir, 'auth-test-meta.json'), 'utf8'))
  );
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
    data: res.data,
    error: res.ok
      ? null
      : {
          code: res.data?.code || String(res.status),
          message: res.data?.message || res.data?.error || JSON.stringify(res.data)
        }
  };
}

async function inventorySum(token) {
  const res = await api('/rest/v1/user_cards?select=quantity', { token });
  if (!res.ok) throw new Error(`inventory: ${res.data?.message || res.status}`);
  const rows = Array.isArray(res.data) ? res.data : [];
  return {
    rows: rows.length,
    qtySum: rows.reduce((n, r) => n + Number(r.quantity || 0), 0)
  };
}

async function claimCount(token) {
  const res = await fetch(
    `${SUPABASE_URL}/rest/v1/daily_booster_claims?select=id`,
    {
      headers: {
        apikey: ANON_KEY,
        Authorization: `Bearer ${token}`,
        Prefer: 'count=exact',
        Range: '0-0'
      }
    }
  );
  const cr = res.headers.get('content-range') || '';
  const m = cr.match(/\/(\d+)$/);
  if (!res.ok && res.status !== 206) {
    const text = await res.text();
    throw new Error(`claims: ${text || res.status}`);
  }
  return m ? Number(m[1]) : 0;
}

function summarizeStatus(status) {
  const latest = status?.latestOpening || null;
  return {
    available: status?.available ?? null,
    mode: status?.mode ?? null,
    recoverySupported: status?.recoverySupported ?? null,
    cardsAwardedLen: Array.isArray(status?.cardsAwarded) ? status.cardsAwarded.length : 0,
    latestOpening: latest
      ? {
          claimId: latest.claimId ?? latest.id ?? null,
          requestIdPrefix: redactId(latest.requestId),
          cardsLen: Array.isArray(latest.cardsAwarded || latest.cards)
            ? (latest.cardsAwarded || latest.cards).length
            : 0
        }
      : null
  };
}

async function tryTwitchRpcDenied(token, label) {
  const nonexistentUser = '00000000-0000-4000-8000-000000000099';
  const nonexistentEvent = `qa-smoke-deny-${randomUUID()}`;
  const apply = await rpc(token, 'apply_twitch_reward_v890', {
    requested_user_id: nonexistentUser,
    requested_reward_type: 'star_bits',
    requested_star_bits: 0,
    requested_card_id: null,
    requested_card_quantity: null,
    requested_booster_id: null,
    requested_event_id: nonexistentEvent,
    requested_rule_id: null,
    requested_twitch_user_id: 'qa_nonexistent_twitch',
    requested_source: 'qa_smoke',
    requested_granted_by: null
  });
  const deliver = await rpc(token, 'deliver_twitch_season_unlock_v1', {
    requested_twitch_user_id: 'qa_nonexistent_twitch',
    requested_twitch_login: 'qa_nonexistent',
    requested_event_id: nonexistentEvent,
    requested_rule_id: null,
    requested_season_id: 'qa-nonexistent-season'
  });
  const applyDenied = !apply.ok;
  const deliverDenied = !deliver.ok;
  return {
    label,
    apply: {
      ok: apply.ok,
      status: apply.status,
      code: apply.error?.code || null,
      message: apply.error?.message || null
    },
    deliver: {
      ok: deliver.ok,
      status: deliver.status,
      code: deliver.error?.code || null,
      message: deliver.error?.message || null
    },
    denied: applyDenied && deliverDenied
  };
}

async function main() {
  await mkdir(reviewDir, { recursive: true });
  const creds = await loadCreds();
  const evidence = {
    ranAt: new Date().toISOString(),
    accounts: { a: creds.a.username, b: creds.b.username },
    steps: {}
  };

  const sessionA = await signIn(creds.a);
  evidence.steps.signInA = { ok: true, userIdPrefix: redactId(sessionA.userId) };

  const invA0 = await inventorySum(sessionA.accessToken);
  const claimsA0 = await claimCount(sessionA.accessToken);
  const statusA0 = await rpc(sessionA.accessToken, 'get_daily_booster_status');
  if (!statusA0.ok) throw new Error(`status A: ${statusA0.error?.message}`);
  evidence.steps.beforeA = {
    inventory: invA0,
    claimCount: claimsA0,
    status: summarizeStatus(statusA0.data)
  };

  const requestId = randomUUID();
  const open1 = await rpc(sessionA.accessToken, 'open_daily_booster', {
    requested_request_id: requestId
  });
  if (!open1.ok) throw new Error(`open1: ${open1.error?.message}`);
  const open1Data = open1.data || {};
  const invA1 = await inventorySum(sessionA.accessToken);
  const claimsA1 = await claimCount(sessionA.accessToken);

  const open2 = await rpc(sessionA.accessToken, 'open_daily_booster', {
    requested_request_id: requestId
  });
  if (!open2.ok) throw new Error(`open2: ${open2.error?.message}`);
  const open2Data = open2.data || {};
  const invA2 = await inventorySum(sessionA.accessToken);
  const claimsA2 = await claimCount(sessionA.accessToken);

  const openingLookup = await rpc(sessionA.accessToken, 'get_my_daily_booster_opening', {
    requested_request_id: requestId
  });
  const statusA1 = await rpc(sessionA.accessToken, 'get_daily_booster_status');

  evidence.steps.controlledOpenA = {
    requestIdPrefix: redactId(requestId),
    open1: {
      success: open1Data.success,
      idempotentReplay: open1Data.idempotentReplay ?? false,
      claimId: open1Data.claimId ?? null,
      cardsLen: Array.isArray(open1Data.cardsAwarded || open1Data.cards)
        ? (open1Data.cardsAwarded || open1Data.cards).length
        : 0
    },
    open2: {
      success: open2Data.success,
      idempotentReplay: open2Data.idempotentReplay ?? false,
      claimId: open2Data.claimId ?? null,
      cardsLen: Array.isArray(open2Data.cardsAwarded || open2Data.cards)
        ? (open2Data.cardsAwarded || open2Data.cards).length
        : 0
    },
    inventoryDeltaOpen1: invA1.qtySum - invA0.qtySum,
    inventoryDeltaReplay: invA2.qtySum - invA1.qtySum,
    claimCountDeltaOpen1: claimsA1 - claimsA0,
    claimCountDeltaReplay: claimsA2 - claimsA1,
    sameClaimId: open1Data.claimId != null && open1Data.claimId === open2Data.claimId,
    openingLookupFound: openingLookup.data?.found === true,
    statusAfter: summarizeStatus(statusA1.data),
    pass:
      Number(invA1.qtySum - invA0.qtySum) > 0 &&
      Number(invA2.qtySum - invA1.qtySum) === 0 &&
      Number(claimsA1 - claimsA0) === 1 &&
      Number(claimsA2 - claimsA1) === 0 &&
      open1Data.claimId != null &&
      open1Data.claimId === open2Data.claimId &&
      open2Data.idempotentReplay === true
  };

  evidence.steps.twitchRpcDeniedA = await tryTwitchRpcDenied(sessionA.accessToken, 'qa_a');

  const sessionB = await signIn(creds.b);
  evidence.steps.signInB = {
    ok: true,
    userIdPrefix: redactId(sessionB.userId),
    differentUser: sessionB.userId !== sessionA.userId
  };

  const invB = await inventorySum(sessionB.accessToken);
  const statusB = await rpc(sessionB.accessToken, 'get_daily_booster_status');
  const openingAsB = await rpc(sessionB.accessToken, 'get_my_daily_booster_opening', {
    requested_request_id: requestId
  });
  evidence.steps.accountB = {
    inventory: invB,
    status: summarizeStatus(statusB.data),
    cannotReadAOpening: openingAsB.data?.found !== true,
    pass: sessionB.userId !== sessionA.userId && openingAsB.data?.found !== true
  };
  evidence.steps.twitchRpcDeniedB = await tryTwitchRpcDenied(sessionB.accessToken, 'qa_b');

  // Recovery read as A again
  const sessionA2 = await signIn(creds.a);
  const replayStatus = await rpc(sessionA2.accessToken, 'get_daily_booster_status');
  const replayOpening = await rpc(sessionA2.accessToken, 'get_my_daily_booster_opening', {
    requested_request_id: requestId
  });
  const invAReplay = await inventorySum(sessionA2.accessToken);
  evidence.steps.recoveryReadA = {
    status: summarizeStatus(replayStatus.data),
    openingFound: replayOpening.data?.found === true,
    openingCardsLen: Array.isArray(replayOpening.data?.cardsAwarded || replayOpening.data?.cards)
      ? (replayOpening.data.cardsAwarded || replayOpening.data.cards).length
      : 0,
    inventoryUnchanged: invAReplay.qtySum === invA2.qtySum,
    pass: replayOpening.data?.found === true && invAReplay.qtySum === invA2.qtySum
  };

  evidence.overallPass = Boolean(
    evidence.steps.controlledOpenA.pass &&
      evidence.steps.accountB.pass &&
      evidence.steps.recoveryReadA.pass &&
      evidence.steps.twitchRpcDeniedA.denied &&
      evidence.steps.twitchRpcDeniedB.denied
  );

  await writeFile(outPath, JSON.stringify(evidence, null, 2), 'utf8');
  console.log(
    JSON.stringify(
      {
        evidenceFile: '.local-review/qa-auth-smoke-evidence.json',
        overallPass: evidence.overallPass,
        controlledOpenPass: evidence.steps.controlledOpenA.pass,
        accountSwitchPass: evidence.steps.accountB.pass,
        recoveryPass: evidence.steps.recoveryReadA.pass,
        twitchDeniedA: evidence.steps.twitchRpcDeniedA.denied,
        twitchDeniedB: evidence.steps.twitchRpcDeniedB.denied,
        inventoryDeltaOpen1: evidence.steps.controlledOpenA.inventoryDeltaOpen1,
        inventoryDeltaReplay: evidence.steps.controlledOpenA.inventoryDeltaReplay,
        claimCountDeltaOpen1: evidence.steps.controlledOpenA.claimCountDeltaOpen1,
        claimCountDeltaReplay: evidence.steps.controlledOpenA.claimCountDeltaReplay,
        applyDenyCodeA: evidence.steps.twitchRpcDeniedA.apply.code,
        deliverDenyCodeA: evidence.steps.twitchRpcDeniedA.deliver.code
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
