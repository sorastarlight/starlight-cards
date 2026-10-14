import test from 'node:test';
import assert from 'node:assert/strict';

import {
  EVENTSUB_MAX_AGE_MS,
  isEventSubTimestampFresh,
  verifyEventSubSignature
} from '../cloudflare-worker/src/index.js';

test('EventSub timestamps reject missing, far-future, and stale values', () => {
  const now = Date.parse('2026-10-14T15:00:00.000Z');
  assert.equal(isEventSubTimestampFresh('', now), false);
  assert.equal(isEventSubTimestampFresh('not-a-date', now), false);
  assert.equal(isEventSubTimestampFresh(new Date(now).toISOString(), now), true);
  assert.equal(
    isEventSubTimestampFresh(new Date(now - EVENTSUB_MAX_AGE_MS + 1000).toISOString(), now),
    true
  );
  assert.equal(
    isEventSubTimestampFresh(new Date(now - EVENTSUB_MAX_AGE_MS - 1000).toISOString(), now),
    false
  );
  assert.equal(
    isEventSubTimestampFresh(new Date(now + EVENTSUB_MAX_AGE_MS + 1000).toISOString(), now),
    false
  );
});

test('EventSub signature verification accepts only matching HMAC payloads', async () => {
  const secret = 'test-eventsub-secret';
  const messageId = 'msg-1';
  const timestamp = '2026-10-14T15:00:00.000Z';
  const body = '{"subscription":{"type":"channel.channel_points_custom_reward_redemption.add"}}';
  const key = await crypto.subtle.importKey(
    'raw',
    new TextEncoder().encode(secret),
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign']
  );
  const sig = await crypto.subtle.sign('HMAC', key, new TextEncoder().encode(messageId + timestamp + body));
  const hex = [...new Uint8Array(sig)].map((b) => b.toString(16).padStart(2, '0')).join('');
  const signature = `sha256=${hex}`;

  assert.equal(await verifyEventSubSignature(secret, messageId, timestamp, body, signature), true);
  assert.equal(await verifyEventSubSignature(secret, messageId, timestamp, body, 'sha256=deadbeef'), false);
  assert.equal(await verifyEventSubSignature(secret, 'other', timestamp, body, signature), false);
  assert.equal(await verifyEventSubSignature('', messageId, timestamp, body, signature), false);
});
