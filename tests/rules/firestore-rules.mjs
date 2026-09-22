/**
 * Firestore security rules check, run against the local emulator:
 *
 *   npm run test:rules
 *
 * Talks to the emulator's REST API directly, so it needs no extra packages —
 * just Java for the emulator itself. The emulator accepts unsigned ID tokens,
 * which is how each request below claims to be a given user.
 */

import assert from 'node:assert/strict';
import { test } from 'node:test';

const HOST = process.env.FIRESTORE_EMULATOR_HOST || '127.0.0.1:8080';
const PROJECT = process.env.GCLOUD_PROJECT || 'demo-spendsense';
const BASE = `http://${HOST}/v1/projects/${PROJECT}/databases/(default)/documents`;

function tokenFor(uid) {
  const b64 = (obj) => Buffer.from(JSON.stringify(obj)).toString('base64url');
  const now = Math.floor(Date.now() / 1000);
  return `${b64({ alg: 'none', typ: 'JWT' })}.${b64({
    iss: `https://securetoken.google.com/${PROJECT}`,
    aud: PROJECT,
    sub: uid,
    user_id: uid,
    iat: now,
    exp: now + 3600,
    auth_time: now,
    firebase: { sign_in_provider: 'google.com', identities: {} },
  })}.`;
}

function toValue(v) {
  if (v === null) return { nullValue: null };
  if (typeof v === 'boolean') return { booleanValue: v };
  if (typeof v === 'number') return Number.isInteger(v) ? { integerValue: String(v) } : { doubleValue: v };
  if (typeof v === 'string') return { stringValue: v };
  if (Array.isArray(v)) return { arrayValue: { values: v.map(toValue) } };
  return { mapValue: { fields: toFields(v) } };
}

function toFields(obj) {
  return Object.fromEntries(Object.entries(obj).map(([k, v]) => [k, toValue(v)]));
}

async function request(method, path, { uid, data } = {}) {
  const headers = { 'Content-Type': 'application/json' };
  if (uid) headers.Authorization = `Bearer ${tokenFor(uid)}`;
  const res = await fetch(`${BASE}/${path}`, {
    method,
    headers,
    body: data ? JSON.stringify({ fields: toFields(data) }) : undefined,
  });
  await res.text();
  return res.status;
}

const write = (path, data, uid = 'alice') => request('PATCH', path, { uid, data });
const read = (path, uid = 'alice') => request('GET', path, { uid });

/** Exactly what the client writes (toRemote in src/services/sync.js). */
function expense(id, overrides = {}) {
  return {
    id,
    amount: 300,
    currency: 'INR',
    date: '2026-09-23',
    item: 'vadapav',
    people: ['Wilson'],
    category: 'food',
    raw: 'Spent 300 on vadapav with wilson',
    createdAt: 1790000000000,
    synced: true,
    ...overrides,
  };
}

const ALLOWED = 200;
const DENIED = 403;

test('owner can create, read, update and delete a valid expense', async () => {
  assert.equal(await write('users/alice/expenses/e1', expense('e1')), ALLOWED);
  assert.equal(await read('users/alice/expenses/e1'), ALLOWED);
  assert.equal(await write('users/alice/expenses/e1', expense('e1', { amount: 450.5 })), ALLOWED);
  assert.equal(await request('DELETE', 'users/alice/expenses/e1', { uid: 'alice' }), ALLOWED);
});

test('owner can list their own collection', async () => {
  assert.equal(await read('users/alice/expenses'), ALLOWED);
});

test('minimal document with only required fields is allowed', async () => {
  const doc = { id: 'min', amount: 20, currency: 'INR', date: '2026-09-01', category: 'other' };
  assert.equal(await write('users/alice/expenses/min', doc), ALLOWED);
});

test('other users and signed-out requests are denied', async () => {
  await write('users/alice/expenses/e2', expense('e2'));
  assert.equal(await read('users/alice/expenses/e2', 'mallory'), DENIED);
  assert.equal(await read('users/alice/expenses', 'mallory'), DENIED);
  assert.equal(await write('users/alice/expenses/e3', expense('e3'), 'mallory'), DENIED);
  assert.equal(await request('GET', 'users/alice/expenses/e2'), DENIED);
  assert.equal(await request('PATCH', 'users/alice/expenses/e4', { data: expense('e4') }), DENIED);
  assert.equal(await request('DELETE', 'users/alice/expenses/e2', { uid: 'mallory' }), DENIED);
});

const invalid = {
  'an unknown field': expense('x', { admin: true }),
  'amount as a string': expense('x', { amount: '300' }),
  'a negative amount': expense('x', { amount: -5 }),
  'an absurd amount': expense('x', { amount: 1e13 }),
  'a malformed date': expense('x', { date: '23/09/2026' }),
  'a mismatched id': expense('someone-else'),
  'an oversized item': expense('x', { item: 'a'.repeat(501) }),
  'an oversized raw input': expense('x', { raw: 'a'.repeat(1001) }),
  'people as a string': expense('x', { people: 'Wilson' }),
  'too many people': expense('x', { people: Array.from({ length: 51 }, (_, i) => `P${i}`) }),
  'synced as a string': expense('x', { synced: 'yes' }),
};

for (const [label, data] of Object.entries(invalid)) {
  test(`rejects ${label}`, async () => {
    assert.equal(await write('users/alice/expenses/x', data), DENIED);
  });
}

test('rejects a document missing a required field', async () => {
  const { category: _category, ...doc } = expense('x');
  assert.equal(await write('users/alice/expenses/x', doc), DENIED);
});

test('rejects subcollections under an expense', async () => {
  await write('users/alice/expenses/e5', expense('e5'));
  assert.equal(await write('users/alice/expenses/e5/notes/n1', { text: 'hi' }), DENIED);
});
