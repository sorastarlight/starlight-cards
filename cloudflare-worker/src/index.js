const TWITCH_AUTH = 'https://id.twitch.tv/oauth2/authorize';
const TWITCH_TOKEN = 'https://id.twitch.tv/oauth2/token';
const TWITCH_API = 'https://api.twitch.tv/helix';

const REQUIRED_ENV = [
  'SUPABASE_URL',
  'SUPABASE_ANON_KEY',
  'SUPABASE_SERVICE_ROLE_KEY',
  'TWITCH_CLIENT_ID',
  'TWITCH_CLIENT_SECRET',
  'EVENTSUB_SECRET',
  'WORKER_PUBLIC_URL',
  'SITE_URL'
];

function assertEnv(env) {
  const missing = REQUIRED_ENV.filter((key) => !String(env[key] || '').trim());
  if (missing.length) {
    throw new Error(`Worker is missing configuration: ${missing.join(', ')}`);
  }
}

const json = (body, status = 200, headers = {}) => new Response(JSON.stringify(body), {
  status,
  headers: {
    'content-type': 'application/json',
    'access-control-allow-origin': '*',
    'access-control-allow-headers': 'authorization,content-type',
    'access-control-allow-methods': 'GET,POST,OPTIONS',
    ...headers
  }
});

const redirect = (url) => Response.redirect(url, 302);
const cleanBase = (s) => String(s || '').replace(/\/$/, '');
const b64url = (bytes) => btoa(String.fromCharCode(...bytes)).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');

async function randomState() {
  const b = new Uint8Array(32);
  crypto.getRandomValues(b);
  return b64url(b);
}

async function hmacHex(secret, message) {
  const key = await crypto.subtle.importKey(
    'raw',
    new TextEncoder().encode(secret),
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign']
  );
  const sig = await crypto.subtle.sign('HMAC', key, new TextEncoder().encode(message));
  return [...new Uint8Array(sig)].map((b) => b.toString(16).padStart(2, '0')).join('');
}

function safeEqual(a, b) {
  if (a.length !== b.length) return false;
  let r = 0;
  for (let i = 0; i < a.length; i++) r |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return r === 0;
}

/** Twitch EventSub replay window (docs recommend rejecting stale timestamps). */
export const EVENTSUB_MAX_AGE_MS = 10 * 60 * 1000;

export function isEventSubTimestampFresh(timestamp, nowMs = Date.now(), maxAgeMs = EVENTSUB_MAX_AGE_MS) {
  const parsed = Date.parse(String(timestamp || ''));
  if (!Number.isFinite(parsed)) return false;
  return Math.abs(Number(nowMs) - parsed) <= maxAgeMs;
}

export async function verifyEventSubSignature(secret, messageId, timestamp, body, signature) {
  if (!secret || !messageId || !timestamp || !signature) return false;
  const expected = `sha256=${await hmacHex(secret, `${messageId}${timestamp}${body}`)}`;
  return safeEqual(String(signature), expected);
}

async function sb(env, path, { method = 'GET', body, token, prefer } = {}) {
  const headers = {
    apikey: env.SUPABASE_SERVICE_ROLE_KEY,
    Authorization: `Bearer ${token || env.SUPABASE_SERVICE_ROLE_KEY}`
  };
  if (body !== undefined) headers['content-type'] = 'application/json';
  if (prefer) headers.Prefer = prefer;
  const res = await fetch(`${cleanBase(env.SUPABASE_URL)}${path}`, {
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
  if (!res.ok) {
    throw new Error(
      typeof data === 'object'
        ? data.message || data.error || JSON.stringify(data)
        : String(data)
    );
  }
  return data;
}

async function validateUser(env, request) {
  const auth = request.headers.get('authorization') || '';
  if (!auth.startsWith('Bearer ')) throw new Error('Missing site session.');
  const token = auth.slice(7);
  const res = await fetch(`${cleanBase(env.SUPABASE_URL)}/auth/v1/user`, {
    headers: { apikey: env.SUPABASE_ANON_KEY, Authorization: `Bearer ${token}` }
  });
  if (!res.ok) throw new Error('Your site session is no longer valid.');
  return { user: await res.json(), token };
}

async function validateAdmin(env, request) {
  const ctx = await validateUser(env, request);
  const data = await sb(env, '/rest/v1/rpc/is_content_admin', {
    method: 'POST',
    body: {},
    token: ctx.token
  });
  if (data !== true) throw new Error('Administrator access is required.');
  return ctx;
}

async function twitchToken(env, code) {
  const form = new URLSearchParams({
    client_id: env.TWITCH_CLIENT_ID,
    client_secret: env.TWITCH_CLIENT_SECRET,
    code,
    grant_type: 'authorization_code',
    redirect_uri: `${cleanBase(env.WORKER_PUBLIC_URL)}/oauth/callback`
  });
  const res = await fetch(TWITCH_TOKEN, {
    method: 'POST',
    headers: { 'content-type': 'application/x-www-form-urlencoded' },
    body: form
  });
  const data = await res.json();
  if (!res.ok) throw new Error(data.message || 'Twitch token exchange failed.');
  return data;
}

async function twitchUser(env, accessToken) {
  const res = await fetch(`${TWITCH_API}/users`, {
    headers: {
      Authorization: `Bearer ${accessToken}`,
      'Client-Id': env.TWITCH_CLIENT_ID
    }
  });
  const data = await res.json();
  if (!res.ok || !data.data?.[0]) throw new Error(data.message || 'Unable to read Twitch profile.');
  return data.data[0];
}

async function getBroadcasterTokenRow(env) {
  const tokenRows = await sb(env, '/rest/v1/twitch_broadcaster_tokens?id=eq.true&select=*');
  const token = tokenRows?.[0];
  if (!token) throw new Error('Connect the broadcaster Twitch account first.');
  return token;
}

async function refreshBroadcasterToken(env, tokenRow) {
  if (!tokenRow.refresh_token) return tokenRow;
  const expiresAt = tokenRow.expires_at ? new Date(tokenRow.expires_at).getTime() : 0;
  if (expiresAt && expiresAt - Date.now() > 5 * 60 * 1000) return tokenRow;

  const form = new URLSearchParams({
    client_id: env.TWITCH_CLIENT_ID,
    client_secret: env.TWITCH_CLIENT_SECRET,
    grant_type: 'refresh_token',
    refresh_token: tokenRow.refresh_token
  });
  const res = await fetch(TWITCH_TOKEN, {
    method: 'POST',
    headers: { 'content-type': 'application/x-www-form-urlencoded' },
    body: form
  });
  const data = await res.json();
  if (!res.ok || !data.access_token) {
    throw new Error(data.message || 'Unable to refresh broadcaster Twitch token.');
  }
  const expires = new Date(Date.now() + Number(data.expires_in || 0) * 1000).toISOString();
  await sb(env, '/rest/v1/twitch_broadcaster_tokens?id=eq.true', {
    method: 'PATCH',
    body: {
      access_token: data.access_token,
      refresh_token: data.refresh_token || tokenRow.refresh_token,
      scopes: data.scope || tokenRow.scopes || [],
      expires_at: expires,
      updated_at: new Date().toISOString()
    },
    prefer: 'return=minimal'
  });
  return {
    ...tokenRow,
    access_token: data.access_token,
    refresh_token: data.refresh_token || tokenRow.refresh_token,
    expires_at: expires
  };
}

async function claimPendingUnlocksForUser(env, { userId, twitchUserId, twitchLogin }) {
  const pending = await sb(
    env,
    `/rest/v1/twitch_pending_unlocks?twitch_user_id=eq.${encodeURIComponent(twitchUserId)}&status=eq.pending&select=*&order=created_at.asc`
  );
  let claimed = 0;
  for (const row of pending || []) {
    await sb(env, '/rest/v1/rpc/deliver_twitch_season_unlock_v1', {
      method: 'POST',
      body: {
        requested_twitch_user_id: twitchUserId,
        requested_twitch_login: twitchLogin || row.twitch_login || null,
        requested_event_id: `${row.event_id}:link`,
        requested_rule_id: row.rule_id || null,
        requested_season_id: row.season_id
      }
    });
    await sb(env, `/rest/v1/twitch_pending_unlocks?id=eq.${encodeURIComponent(row.id)}`, {
      method: 'PATCH',
      body: {
        status: 'claimed',
        claimed_by: userId,
        claimed_at: new Date().toISOString()
      },
      prefer: 'return=minimal'
    });
    claimed += 1;
  }
  return claimed;
}

async function oauthStart(env, request, flow) {
  const ctx = flow === 'broadcaster'
    ? await validateAdmin(env, request)
    : await validateUser(env, request);
  const payload = await request.json().catch(() => ({}));
  const state = await randomState();
  await sb(env, '/rest/v1/twitch_oauth_states', {
    method: 'POST',
    body: {
      state,
      user_id: ctx.user.id,
      flow_type: flow,
      return_url: payload.returnUrl || env.SITE_URL,
      expires_at: new Date(Date.now() + 10 * 60 * 1000).toISOString()
    },
    prefer: 'return=minimal'
  });
  const scopes = flow === 'broadcaster'
    ? 'user:read:email channel:read:redemptions channel:manage:redemptions channel:read:subscriptions moderator:read:followers'
    : 'user:read:email';
  const u = new URL(TWITCH_AUTH);
  u.search = new URLSearchParams({
    client_id: env.TWITCH_CLIENT_ID,
    redirect_uri: `${cleanBase(env.WORKER_PUBLIC_URL)}/oauth/callback`,
    response_type: 'code',
    scope: scopes,
    state,
    force_verify: 'true'
  }).toString();
  return json({ authorizationUrl: u.toString() });
}

async function oauthCallback(env, url) {
  const code = url.searchParams.get('code');
  const state = url.searchParams.get('state');
  const error = url.searchParams.get('error');
  if (error) {
    return redirect(`${env.SITE_URL}/binder.html?view=profile&twitch=error&reason=${encodeURIComponent(error)}`);
  }
  if (!code || !state) return json({ error: 'Missing Twitch callback values.' }, 400);

  const rows = await sb(env, `/rest/v1/twitch_oauth_states?state=eq.${encodeURIComponent(state)}&select=*`);
  const row = rows?.[0];
  if (!row || new Date(row.expires_at) < new Date()) {
    return json({ error: 'This Twitch link request expired.' }, 400);
  }

  const token = await twitchToken(env, code);
  const user = await twitchUser(env, token.access_token);

  if (row.flow_type === 'collector') {
    await sb(env, '/rest/v1/twitch_connections', {
      method: 'POST',
      body: {
        user_id: row.user_id,
        twitch_user_id: user.id,
        twitch_login: user.login,
        twitch_display_name: user.display_name,
        twitch_avatar_url: user.profile_image_url,
        twitch_email: user.email || null,
        scopes: token.scope || [],
        linked_at: new Date().toISOString(),
        updated_at: new Date().toISOString()
      },
      prefer: 'resolution=merge-duplicates,return=minimal'
    });
    await sb(env, '/rest/v1/rpc/create_user_notification_v881', {
      method: 'POST',
      body: {
        requested_user_id: row.user_id,
        requested_type: 'twitch',
        requested_title: 'Twitch account linked',
        requested_body: `${user.display_name} is now linked to your Starlight collector profile.`,
        requested_icon: '📺',
        requested_route: 'profile',
        requested_route_params: {},
        requested_source_key: `twitch-linked:${user.id}`,
        requested_expires_at: null
      }
    }).catch(() => {});

    // Convert any Season Pass pending unlocks queued before Twitch was linked.
    await claimPendingUnlocksForUser(env, {
      userId: row.user_id,
      twitchUserId: user.id,
      twitchLogin: user.login
    }).catch((err) => console.error('pending unlock claim failed', err));
  } else {
    const expires = new Date(Date.now() + Number(token.expires_in || 0) * 1000).toISOString();
    await sb(env, '/rest/v1/twitch_broadcaster_tokens', {
      method: 'POST',
      body: {
        id: true,
        twitch_user_id: user.id,
        access_token: token.access_token,
        refresh_token: token.refresh_token || null,
        scopes: token.scope || [],
        expires_at: expires,
        updated_at: new Date().toISOString()
      },
      prefer: 'resolution=merge-duplicates,return=minimal'
    });
    await sb(env, '/rest/v1/twitch_integration_config?id=eq.true', {
      method: 'PATCH',
      body: {
        broadcaster_twitch_user_id: user.id,
        broadcaster_login: user.login,
        broadcaster_display_name: user.display_name,
        broadcaster_avatar_url: user.profile_image_url,
        eventsub_status: 'broadcaster_linked',
        updated_at: new Date().toISOString()
      },
      prefer: 'return=minimal'
    });
  }

  await sb(env, `/rest/v1/twitch_oauth_states?state=eq.${encodeURIComponent(state)}`, {
    method: 'DELETE'
  });

  const returnUrl = row.return_url || `${env.SITE_URL}/binder.html?view=profile`;
  const sep = returnUrl.includes('?') ? '&' : '?';
  return redirect(`${returnUrl}${sep}twitch=linked`);
}

async function getCustomRewards(env) {
  let token = await getBroadcasterTokenRow(env);
  token = await refreshBroadcasterToken(env, token);
  const res = await fetch(
    `${TWITCH_API}/channel_points/custom_rewards?broadcaster_id=${encodeURIComponent(token.twitch_user_id)}`,
    {
      headers: {
        Authorization: `Bearer ${token.access_token}`,
        'Client-Id': env.TWITCH_CLIENT_ID
      }
    }
  );
  const data = await res.json();
  if (!res.ok) throw new Error(data.message || 'Unable to load Twitch custom rewards.');
  return (data.data || []).map((r) => ({
    id: r.id,
    title: r.title,
    cost: r.cost,
    prompt: r.prompt || '',
    enabled: r.is_enabled !== false,
    paused: r.is_paused === true,
    backgroundColor: r.background_color || ''
  }));
}

async function getTwitchAppAccessToken(env) {
  const form = new URLSearchParams({
    client_id: env.TWITCH_CLIENT_ID,
    client_secret: env.TWITCH_CLIENT_SECRET,
    grant_type: 'client_credentials'
  });
  const res = await fetch(TWITCH_TOKEN, {
    method: 'POST',
    headers: { 'content-type': 'application/x-www-form-urlencoded' },
    body: form
  });
  const data = await res.json();
  if (!res.ok || !data.access_token) {
    throw new Error(data.message || 'Unable to obtain Twitch app access token.');
  }
  return data.access_token;
}

async function subscribeEventSub(env) {
  const token = await getBroadcasterTokenRow(env);
  const rules = await sb(env, '/rest/v1/twitch_reward_rules?active=eq.true&select=*');
  const specs = [];
  for (const r of rules || []) {
    if (r.event_type === 'channel_points') {
      specs.push({
        type: 'channel.channel_points_custom_reward_redemption.add',
        version: '1',
        condition: {
          broadcaster_user_id: token.twitch_user_id,
          ...(r.twitch_reward_id ? { reward_id: r.twitch_reward_id } : {})
        }
      });
    }
    if (r.event_type === 'subscription') {
      specs.push({
        type: 'channel.subscribe',
        version: '1',
        condition: { broadcaster_user_id: token.twitch_user_id }
      });
    }
    if (r.event_type === 'follow') {
      specs.push({
        type: 'channel.follow',
        version: '2',
        condition: {
          broadcaster_user_id: token.twitch_user_id,
          moderator_user_id: token.twitch_user_id
        }
      });
    }
  }
  const unique = [...new Map(specs.map((s) => [`${s.type}:${JSON.stringify(s.condition)}`, s])).values()];
  const appAccessToken = await getTwitchAppAccessToken(env);
  const results = [];
  for (const spec of unique) {
    const res = await fetch(`${TWITCH_API}/eventsub/subscriptions`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${appAccessToken}`,
        'Client-Id': env.TWITCH_CLIENT_ID,
        'content-type': 'application/json'
      },
      body: JSON.stringify({
        ...spec,
        transport: {
          method: 'webhook',
          callback: `${cleanBase(env.WORKER_PUBLIC_URL)}/webhooks/twitch`,
          secret: env.EVENTSUB_SECRET
        }
      })
    });
    const data = await res.json();
    const alreadyExists =
      res.status === 409 &&
      String(data?.message || '').toLowerCase().includes('subscription already exists');
    results.push({
      spec,
      ok: res.ok || alreadyExists,
      status: res.status,
      existing: alreadyExists,
      data
    });
  }
  await sb(env, '/rest/v1/twitch_integration_config?id=eq.true', {
    method: 'PATCH',
    body: {
      eventsub_status: results.every((r) => r.ok) ? 'subscribed' : 'partial_error',
      last_eventsub_sync_at: new Date().toISOString(),
      updated_at: new Date().toISOString()
    },
    prefer: 'return=minimal'
  });
  return results;
}

async function helixCheckSubscription(env, twitchUserId) {
  let token = await getBroadcasterTokenRow(env);
  token = await refreshBroadcasterToken(env, token);
  const url = new URL(`${TWITCH_API}/subscriptions`);
  url.searchParams.set('broadcaster_id', token.twitch_user_id);
  url.searchParams.set('user_id', twitchUserId);
  const res = await fetch(url, {
    headers: {
      Authorization: `Bearer ${token.access_token}`,
      'Client-Id': env.TWITCH_CLIENT_ID
    }
  });
  const data = await res.json();
  if (!res.ok) throw new Error(data.message || 'Unable to check Twitch subscription status.');
  const sub = data.data?.[0] || null;
  return {
    isSubscribed: Boolean(sub),
    tier: sub?.tier || null,
    isGift: sub?.is_gift === true
  };
}

async function viewerSubscriptionCheck(env, request) {
  const ctx = await validateUser(env, request);
  const payload = await request.json().catch(() => ({}));
  const seasonId = typeof payload.seasonId === 'string' ? payload.seasonId.trim() : '';

  const connections = await sb(
    env,
    `/rest/v1/twitch_connections?user_id=eq.${encodeURIComponent(ctx.user.id)}&select=*`
  );
  const connection = connections?.[0];
  if (!connection) {
    return json({
      success: true,
      linked: false,
      isSubscribed: false,
      hasAccess: false,
      reason: 'twitch_not_linked'
    });
  }

  const helix = await helixCheckSubscription(env, connection.twitch_user_id);
  const access = await sb(env, '/rest/v1/rpc/confirm_twitch_subscription_access_v1', {
    method: 'POST',
    body: {
      requested_user_id: ctx.user.id,
      requested_is_subscribed: helix.isSubscribed,
      requested_season_id: seasonId || null,
      requested_tier: helix.tier,
      requested_metadata: {
        isGift: helix.isGift,
        twitchUserId: connection.twitch_user_id,
        twitchLogin: connection.twitch_login
      }
    }
  });

  return json({
    success: true,
    linked: true,
    isSubscribed: helix.isSubscribed,
    tier: helix.tier,
    isGift: helix.isGift,
    ...access
  });
}

async function deliverSeasonUnlock(env, {
  twitchUserId,
  twitchLogin,
  eventId,
  ruleId,
  seasonId
}) {
  return sb(env, '/rest/v1/rpc/deliver_twitch_season_unlock_v1', {
    method: 'POST',
    body: {
      requested_twitch_user_id: twitchUserId,
      requested_twitch_login: twitchLogin,
      requested_event_id: eventId,
      requested_rule_id: ruleId || null,
      requested_season_id: seasonId || null
    }
  });
}

async function processEvent(env, payload, eventId, eventType) {
  await sb(env, '/rest/v1/twitch_integration_config?id=eq.true', {
    method: 'PATCH',
    body: {
      last_event_received_at: new Date().toISOString(),
      updated_at: new Date().toISOString()
    },
    prefer: 'return=minimal'
  }).catch(() => {});

  const cfgRows = await sb(env, '/rest/v1/twitch_integration_config?id=eq.true&select=redeems_enabled');
  if (cfgRows?.[0]?.redeems_enabled === false) {
    await sb(env, '/rest/v1/twitch_reward_events', {
      method: 'POST',
      body: {
        event_id: eventId,
        event_type: 'paused',
        payload,
        status: 'ignored',
        error_message: 'Twitch redeems are globally paused.',
        processed_at: new Date().toISOString()
      },
      prefer: 'resolution=ignore-duplicates,return=minimal'
    }).catch(() => {});
    return;
  }

  const event = payload.event || {};
  let mappedType = '';
  let rewardId = null;
  const twitchUserId = event.user_id || event.from_broadcaster_user_id || null;
  const twitchLogin = event.user_login || event.from_broadcaster_user_login || null;
  const twitchDisplay = event.user_name || event.from_broadcaster_user_name || null;

  if (eventType === 'channel.channel_points_custom_reward_redemption.add') {
    mappedType = 'channel_points';
    rewardId = event.reward?.id || null;
  } else if (eventType === 'channel.subscribe') {
    mappedType = 'subscription';
  } else if (eventType === 'channel.follow') {
    mappedType = 'follow';
  } else {
    return;
  }

  const inserted = await sb(env, '/rest/v1/twitch_reward_events', {
    method: 'POST',
    body: {
      event_id: eventId,
      event_type: mappedType,
      twitch_user_id: twitchUserId,
      twitch_login: twitchLogin,
      twitch_display_name: twitchDisplay,
      twitch_reward_id: rewardId,
      payload,
      status: 'received'
    },
    prefer: 'resolution=ignore-duplicates,return=representation'
  });
  if (!inserted?.length) {
    // Same EventSub message id: finish durable delivery after a prior failure,
    // but never re-grant delivered/ignored events.
    const existingRows = await sb(
      env,
      `/rest/v1/twitch_reward_events?event_id=eq.${encodeURIComponent(eventId)}&select=event_id,status`
    );
    const existing = existingRows?.[0];
    if (!existing) return;
    if (existing.status === 'delivered' || existing.status === 'ignored') return;
    await sb(env, `/rest/v1/twitch_reward_events?event_id=eq.${encodeURIComponent(eventId)}`, {
      method: 'PATCH',
      body: {
        status: 'received',
        error_message: null,
        payload,
        event_type: mappedType,
        twitch_user_id: twitchUserId,
        twitch_login: twitchLogin,
        twitch_display_name: twitchDisplay,
        twitch_reward_id: rewardId
      },
      prefer: 'return=minimal'
    }).catch(() => {});
  }

  const rules = await sb(
    env,
    `/rest/v1/twitch_reward_rules?active=eq.true&event_type=eq.${mappedType}&select=*`
  );
  const rule = (rules || []).find((r) => !r.twitch_reward_id || r.twitch_reward_id === rewardId);
  if (!rule) {
    await sb(env, `/rest/v1/twitch_reward_events?event_id=eq.${encodeURIComponent(eventId)}`, {
      method: 'PATCH',
      body: {
        status: 'ignored',
        error_message: 'No matching reward rule.',
        processed_at: new Date().toISOString()
      }
    });
    return;
  }

  const connections = await sb(
    env,
    `/rest/v1/twitch_connections?twitch_user_id=eq.${encodeURIComponent(twitchUserId)}&select=*`
  );
  const connection = connections?.[0];

  // Season Pass unlocks work for linked and unlinked Twitch viewers.
  if (rule.reward_type === 'season_pass_unlock') {
    const priorSeasonGrant = await sb(
      env,
      `/rest/v1/twitch_reward_grants?event_id=eq.${encodeURIComponent(eventId)}&select=id&limit=1`
    );
    if (priorSeasonGrant?.length) {
      await sb(env, `/rest/v1/twitch_reward_events?event_id=eq.${encodeURIComponent(eventId)}`, {
        method: 'PATCH',
        body: { status: 'delivered', processed_at: new Date().toISOString(), error_message: null }
      });
      return;
    }
    if (connection) {
      const existingSeason = await sb(
        env,
        `/rest/v1/twitch_reward_grants?rule_id=eq.${rule.id}&user_id=eq.${connection.user_id}&select=id,granted_at&order=granted_at.desc`
      );
      if (rule.max_claims_per_user && existingSeason.length >= rule.max_claims_per_user) {
        await sb(env, `/rest/v1/twitch_reward_events?event_id=eq.${encodeURIComponent(eventId)}`, {
          method: 'PATCH',
          body: {
            status: 'ignored',
            error_message: 'Claim limit reached.',
            processed_at: new Date().toISOString()
          }
        });
        return;
      }
    }
    try {
      await deliverSeasonUnlock(env, {
        twitchUserId,
        twitchLogin,
        eventId,
        ruleId: rule.id,
        seasonId: rule.season_id
      });
      await sb(env, `/rest/v1/twitch_reward_events?event_id=eq.${encodeURIComponent(eventId)}`, {
        method: 'PATCH',
        body: { status: 'delivered', processed_at: new Date().toISOString() }
      });
      await sb(env, '/rest/v1/twitch_integration_config?id=eq.true', {
        method: 'PATCH',
        body: {
          last_reward_delivery_at: new Date().toISOString(),
          updated_at: new Date().toISOString()
        },
        prefer: 'return=minimal'
      }).catch(() => {});
    } catch (err) {
      await sb(env, `/rest/v1/twitch_reward_events?event_id=eq.${encodeURIComponent(eventId)}`, {
        method: 'PATCH',
        body: {
          status: 'failed',
          error_message: String(err.message || err),
          processed_at: new Date().toISOString()
        }
      });
      throw err;
    }
    return;
  }

  if (!connection) {
    await sb(env, `/rest/v1/twitch_reward_events?event_id=eq.${encodeURIComponent(eventId)}`, {
      method: 'PATCH',
      body: {
        status: 'ignored',
        error_message: 'No linked Starlight account.',
        processed_at: new Date().toISOString()
      }
    });
    return;
  }

  // Crash between grant commit and event status update leaves status failed/received
  // while a grant row already exists. Finish delivery without counting that row as a
  // new claim or invoking apply again.
  const priorByEvent = await sb(
    env,
    `/rest/v1/twitch_reward_grants?event_id=eq.${encodeURIComponent(eventId)}&select=id&limit=1`
  );
  if (priorByEvent?.length) {
    await sb(env, `/rest/v1/twitch_reward_events?event_id=eq.${encodeURIComponent(eventId)}`, {
      method: 'PATCH',
      body: { status: 'delivered', processed_at: new Date().toISOString(), error_message: null }
    });
    return;
  }

  const existing = await sb(
    env,
    `/rest/v1/twitch_reward_grants?rule_id=eq.${rule.id}&user_id=eq.${connection.user_id}&select=id,granted_at&order=granted_at.desc`
  );
  if (rule.max_claims_per_user && existing.length >= rule.max_claims_per_user) {
    await sb(env, `/rest/v1/twitch_reward_events?event_id=eq.${encodeURIComponent(eventId)}`, {
      method: 'PATCH',
      body: {
        status: 'ignored',
        error_message: 'Claim limit reached.',
        processed_at: new Date().toISOString()
      }
    });
    return;
  }
  if (
    rule.cooldown_minutes &&
    existing[0] &&
    Date.now() - new Date(existing[0].granted_at).getTime() < rule.cooldown_minutes * 60000
  ) {
    await sb(env, `/rest/v1/twitch_reward_events?event_id=eq.${encodeURIComponent(eventId)}`, {
      method: 'PATCH',
      body: {
        status: 'ignored',
        error_message: 'Reward cooldown active.',
        processed_at: new Date().toISOString()
      }
    });
    return;
  }

  try {
    await sb(env, '/rest/v1/rpc/apply_twitch_reward_v890', {
      method: 'POST',
      body: {
        requested_user_id: connection.user_id,
        requested_reward_type: rule.reward_type,
        requested_star_bits: rule.star_bits_amount,
        requested_card_id: rule.card_id,
        requested_card_quantity: rule.card_quantity,
        requested_booster_id: rule.booster_id,
        requested_event_id: eventId,
        requested_rule_id: rule.id,
        requested_twitch_user_id: twitchUserId,
        requested_source: mappedType,
        requested_granted_by: null
      }
    });
    await sb(env, `/rest/v1/twitch_reward_events?event_id=eq.${encodeURIComponent(eventId)}`, {
      method: 'PATCH',
      body: { status: 'delivered', processed_at: new Date().toISOString() }
    });
    await sb(env, '/rest/v1/twitch_integration_config?id=eq.true', {
      method: 'PATCH',
      body: {
        last_reward_delivery_at: new Date().toISOString(),
        updated_at: new Date().toISOString()
      },
      prefer: 'return=minimal'
    }).catch(() => {});
  } catch (err) {
    await sb(env, `/rest/v1/twitch_reward_events?event_id=eq.${encodeURIComponent(eventId)}`, {
      method: 'PATCH',
      body: {
        status: 'failed',
        error_message: String(err.message || err),
        processed_at: new Date().toISOString()
      }
    });
    throw err;
  }
}

/**
 * Staff-triggered retry for a failed EventSub row. Reconstructs the original
 * notification and re-enters processEvent (which refuses delivered/ignored ids).
 */
async function retryFailedRewardEvent(env, eventId) {
  const id = String(eventId || '').trim();
  if (!id) throw new Error('eventId is required');
  const rows = await sb(
    env,
    `/rest/v1/twitch_reward_events?event_id=eq.${encodeURIComponent(id)}&select=*&limit=1`
  );
  const row = rows?.[0];
  if (!row) throw new Error('Reward event not found.');
  if (row.status === 'delivered') {
    return { ok: true, status: 'delivered', skipped: true, reason: 'already_delivered' };
  }
  if (row.status === 'ignored') {
    return { ok: true, status: 'ignored', skipped: true, reason: 'ignored' };
  }
  if (row.status !== 'failed' && row.status !== 'received') {
    throw new Error(`Cannot retry events in status "${row.status}".`);
  }
  const payload = row.payload && typeof row.payload === 'object' ? row.payload : {};
  const subscriptionType =
    payload?.subscription?.type ||
    (row.event_type === 'channel_points'
      ? 'channel.channel_points_custom_reward_redemption.add'
      : row.event_type === 'subscription'
        ? 'channel.subscribe'
        : row.event_type === 'follow'
          ? 'channel.follow'
          : '');
  if (!subscriptionType) throw new Error('Stored event is missing a Twitch subscription type.');
  await processEvent(env, payload, id, subscriptionType);
  const refreshed = await sb(
    env,
    `/rest/v1/twitch_reward_events?event_id=eq.${encodeURIComponent(id)}&select=status,error_message&limit=1`
  );
  return {
    ok: true,
    status: refreshed?.[0]?.status || null,
    error: refreshed?.[0]?.error_message || null
  };
}

async function markEventSubRevoked(env, payload) {
  const status = String(payload?.subscription?.status || 'revoked');
  const subType = String(payload?.subscription?.type || '');
  try {
    await sb(env, '/rest/v1/twitch_integration_config?id=eq.true', {
      method: 'PATCH',
      body: {
        eventsub_status: status || 'revoked',
        updated_at: new Date().toISOString()
      },
      prefer: 'return=minimal'
    });
  } catch (error) {
    console.warn('[EventSub] failed to persist revocation status', error);
  }
  console.warn('[EventSub] subscription revoked', { status, subType });
}

async function webhook(env, request) {
  const id = request.headers.get('Twitch-Eventsub-Message-Id') || '';
  const ts = request.headers.get('Twitch-Eventsub-Message-Timestamp') || '';
  const signature = request.headers.get('Twitch-Eventsub-Message-Signature') || '';
  const type = request.headers.get('Twitch-Eventsub-Message-Type') || '';
  const eventType = request.headers.get('Twitch-Eventsub-Subscription-Type') || '';
  const body = await request.text();
  if (!(await verifyEventSubSignature(env.EVENTSUB_SECRET, id, ts, body, signature))) {
    return new Response('Invalid signature', { status: 403 });
  }
  if (!isEventSubTimestampFresh(ts)) {
    return new Response('Stale timestamp', { status: 403 });
  }
  const payload = JSON.parse(body);
  if (type === 'webhook_callback_verification') {
    return new Response(payload.challenge, { headers: { 'content-type': 'text/plain' } });
  }
  if (type === 'revocation') {
    await markEventSubRevoked(env, payload);
    return new Response('', { status: 204 });
  }
  if (type === 'notification') {
    await processEvent(env, payload, id, eventType);
    return new Response('', { status: 204 });
  }
  return new Response('', { status: 204 });
}

export default {
  async fetch(request, env) {
    if (request.method === 'OPTIONS') return json({ ok: true });
    const url = new URL(request.url);
    try {
      if (url.pathname === '/health') {
        const missing = REQUIRED_ENV.filter((key) => !String(env[key] || '').trim());
        return json({
          ok: missing.length === 0,
          service: 'starlight-twitch-worker',
          version: '1.1.4',
          missingConfig: missing
        }, missing.length ? 503 : 200);
      }
      assertEnv(env);
      if (url.pathname === '/oauth/start' && request.method === 'POST') {
        return oauthStart(env, request, 'collector');
      }
      if (url.pathname === '/oauth/broadcaster/start' && request.method === 'POST') {
        return oauthStart(env, request, 'broadcaster');
      }
      if (url.pathname === '/oauth/callback' && request.method === 'GET') {
        return oauthCallback(env, url);
      }
      if (url.pathname === '/admin/eventsub/sync' && request.method === 'POST') {
        await validateAdmin(env, request);
        return json({ results: await subscribeEventSub(env) });
      }
      if (url.pathname === '/admin/custom-rewards' && request.method === 'POST') {
        await validateAdmin(env, request);
        return json({ rewards: await getCustomRewards(env) });
      }
      if (url.pathname === '/admin/events/retry' && request.method === 'POST') {
        await validateAdmin(env, request);
        const body = await request.json().catch(() => ({}));
        return json(await retryFailedRewardEvent(env, body.eventId || body.event_id));
      }
      if (url.pathname === '/viewer/subscription-check' && request.method === 'POST') {
        return viewerSubscriptionCheck(env, request);
      }
      if (url.pathname === '/webhooks/twitch' && request.method === 'POST') {
        return webhook(env, request);
      }
      return json({ error: 'Not found' }, 404);
    } catch (error) {
      console.error(error);
      return json({ error: error.message || String(error) }, 400);
    }
  }
};
