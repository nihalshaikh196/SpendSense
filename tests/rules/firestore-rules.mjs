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

// ─── Investments ─────────────────────────────────────────────────────────────

/** Matches toRemote('holdings', …) in src/services/investmentSync.js. */
function holdingDoc(id, overrides = {}) {
  return {
    id,
    name: 'Parag Parikh Flexi Cap',
    type: 'equityMf',
    platform: 'Zerodha',
    currency: 'INR',
    goalId: 'g1',
    notes: 'Folio 1234',
    sipAmount: 5000,
    sipDay: 5,
    createdAt: 1790000000000,
    updatedAt: 1790000000000,
    synced: true,
    ...overrides,
  };
}

function txnDoc(id, overrides = {}) {
  return {
    id, holdingId: 'h1', kind: 'invest', date: '2026-10-02', amount: 5000, units: 61.234,
    note: 'October SIP', createdAt: 1790000000000, updatedAt: 1790000000000, synced: true, ...overrides,
  };
}

test('owner can write a full holding, an FD, a transaction and a goal', async () => {
  assert.equal(await write('users/alice/holdings/h1', holdingDoc('h1')), ALLOWED);
  assert.equal(
    await write('users/alice/holdings/h2', holdingDoc('h2', { type: 'fd', rate: 7.25, compounding: 4, maturityDate: '2027-10-02', lockInUntil: '2027-10-02', closed: false })),
    ALLOWED,
  );
  assert.equal(await write('users/alice/holdings/h3', { id: 'h3', name: 'Gold', type: 'gold', currency: 'INR' }), ALLOWED);
  assert.equal(await write('users/alice/investmentTxns/t1', txnDoc('t1')), ALLOWED);
  assert.equal(await write('users/alice/investmentTxns/t2', txnDoc('t2', { kind: 'value', units: 0 })), ALLOWED);
  assert.equal(
    await write('users/alice/goals/g1', { id: 'g1', name: 'House', target: 2500000, targetDate: '2030-04-01', expectedReturn: 10, createdAt: 1, updatedAt: 1, synced: true }),
    ALLOWED,
  );
  assert.equal(await read('users/alice/holdings'), ALLOWED);
});

test('other users cannot read or write investments', async () => {
  await write('users/alice/holdings/h9', holdingDoc('h9'));
  assert.equal(await read('users/alice/holdings/h9', 'mallory'), DENIED);
  assert.equal(await read('users/alice/investmentTxns', 'mallory'), DENIED);
  assert.equal(await write('users/alice/goals/g9', { id: 'g9', name: 'X' }, 'mallory'), DENIED);
});

const invalidHoldings = {
  'an unknown field': holdingDoc('x', { admin: true }),
  'an empty name': holdingDoc('x', { name: '' }),
  'an odd compounding': holdingDoc('x', { compounding: 3 }),
  'a SIP day of 0': holdingDoc('x', { sipDay: 0 }),
  'a fractional SIP day': holdingDoc('x', { sipDay: 5.5 }),
  'a 150% rate': holdingDoc('x', { rate: 150 }),
  'a malformed maturity': holdingDoc('x', { maturityDate: '02/10/2027' }),
  'a mismatched id': holdingDoc('other'),
};

for (const [label, data] of Object.entries(invalidHoldings)) {
  test(`rejects a holding with ${label}`, async () => {
    assert.equal(await write('users/alice/holdings/x', data), DENIED);
  });
}

const invalidTxns = {
  'an unknown kind': txnDoc('x', { kind: 'gift' }),
  'a negative amount': txnDoc('x', { amount: -1 }),
  'a malformed date': txnDoc('x', { date: '2026-10' }),
  'negative units': txnDoc('x', { units: -2 }),
  'no holding': (({ holdingId: _h, ...rest }) => rest)(txnDoc('x')),
};

for (const [label, data] of Object.entries(invalidTxns)) {
  test(`rejects a transaction with ${label}`, async () => {
    assert.equal(await write('users/alice/investmentTxns/x', data), DENIED);
  });
}

test('rejects a goal with an impossible expected return', async () => {
  assert.equal(await write('users/alice/goals/gx', { id: 'gx', name: 'Trip', expectedReturn: 500 }), DENIED);
});
