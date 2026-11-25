import test from 'node:test';
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import path from 'node:path';
import {createGithubCatalog} from '../worker/github-worker.mjs';
import {openCatalogDB} from '../scripts/local-db.mjs';

const origin = 'https://catalog.test';
const ownerId = 12345;
const route = '/api/auth/github/';
const start = route + 'start';
const callback = route + 'callback';
const logout = route + 'logout';
const index = {
  locations: [['Городская мебель', 'Скамейки']],
  products: [['bench', 0]],
  taxonomy: {'Городская мебель': ['Скамейки']},
};

async function setup(t, identity) {
  const connection = await openCatalogDB(':memory:', path.resolve(import.meta.dirname, '..'));
  t.after(() => connection.db.close());
  const env = {
    AUTH_ORIGIN: origin, GITHUB_OWNER_ID: String(ownerId), GITHUB_CLIENT_ID: 'fixture-client',
    GITHUB_CLIENT_SECRET: 'fixture-value', DB: connection.binding,
    ASSETS: {fetch: async () => new Response('public catalog')},
  };
  const calls = [];
  const githubFetch = async (url, options) => {
    calls.push({url, options});
    if (url === 'https://github.com/login/oauth/access_token') {
      return Response.json({access_token: 'fixture-token-from-github'});
    }
    assert.equal(url, 'https://api.github.com/user');
    assert.equal(options.headers.authorization, 'Bearer fixture-token-from-github');
    return Response.json(identity);
  };
  const worker = createGithubCatalog(index, 'private controls', githubFetch);
  const call = (url, init, overrides = {}) => worker.fetch(new Request(new URL(url, origin), init), {...env, ...overrides});
  return {call, calls, db: connection.db};
}

async function flow(call) {
  const response = await call(start);
  assert.equal(response.status, 302);
  assert.match(response.headers.get('cache-control'), /private, no-store/);
  const authorize = new URL(response.headers.get('location'));
  assert.equal(authorize.origin, 'https://github.com');
  assert.equal(authorize.searchParams.get('code_challenge_method'), 'S256');
  assert.equal(authorize.searchParams.get('redirect_uri'), origin + callback);
  const [cookie] = response.headers.getSetCookie();
  assert.match(cookie, /Secure; HttpOnly; SameSite=Lax/);
  const [cookiePair] = cookie.split(';');
  return {cookiePair, state: authorize.searchParams.get('state'), challenge: authorize.searchParams.get('code_challenge')};
}

const finish = (call, {state, cookiePair}, useState = state) =>
  call(callback + '?code=test-code&state=' + useState, {headers: {cookie: cookiePair}});

test('catalog is public and owner routes do not trust a URL, an identity header, or a forged cookie', async t => {
  const {call, calls} = await setup(t, {id: ownerId});
  const forged = {
    'oai-authenticated-user-id': String(ownerId), 'x-github-user-id': String(ownerId),
    cookie: '__Host-maf-owner=' + 'z'.repeat(43),
  };
  assert.equal(await (await call('/')).text(), 'public catalog');
  assert.deepEqual(await (await call('/api/session?owner=1', {headers: forged})).json(), {canEdit: false});
  for (const resource of ['/api/admin/ui.js', '/api/admin/ratings', '/api/admin/products/bench']) {
    assert.equal((await call(resource + '?owner=1', {headers: forged})).status, 403);
  }
  assert.equal((await call('/api/admin/products/bench', {method: 'PATCH', headers: forged})).status, 403);
  assert.equal((await call(start, undefined, {GITHUB_OWNER_ID: ''})).status, 503);
  assert.equal((await call('https://other.test' + start)).status, 503);
  assert.equal(calls.length, 0);
});

test('wrong OAuth state stops server calls and a different GitHub ID receives no session', async t => {
  const {call, calls, db} = await setup(t, {id: 56789, login: 'same-display-name'});
  const attempt = await flow(call);
  assert.equal((await finish(call, attempt, 'wrong-state')).status, 400);
  assert.equal(calls.length, 0);
  const denied = await finish(call, await flow(call));
  assert.equal(denied.status, 403);
  assert.ok(!denied.headers.getSetCookie().some(value => value.startsWith('__Host-maf-owner=')));
  assert.equal(db.prepare('SELECT COUNT(*) AS count FROM github_owner_sessions').get().count, 0);
});

test('the configured GitHub ID logs in and can edit, and logout invalidates the server session', async t => {
  const {call, calls, db} = await setup(t, {id: ownerId, login: 'a-renamed-user'});
  const attempt = await flow(call);
  const signedIn = await finish(call, attempt);
  assert.equal(signedIn.status, 303);
  assert.equal(signedIn.headers.get('location'), '/');
  const [session] = signedIn.headers.getSetCookie();
  assert.match(session, /^__Host-maf-owner=.*; Path=\/; Max-Age=28800; Secure; HttpOnly; SameSite=Lax$/);
  const [sessionPair] = session.split(';');
  const headers = {cookie: sessionPair};
  const [tokenCall] = calls;
  const verifier = tokenCall.options.body.get('code_verifier');
  assert.equal(createHash('sha256').update(verifier).digest('base64url'), attempt.challenge);
  const row = db.prepare('SELECT * FROM github_owner_sessions').get();
  assert.equal(row.owner_id, String(ownerId));
  assert.equal(row.token_hash, createHash('sha256').update(sessionPair.split('=')[1]).digest('base64url'));
  assert.deepEqual(await (await call('/api/session', {headers})).json(), {canEdit: true});
  assert.equal(await (await call('/api/admin/ui.js', {headers})).text(), 'private controls');
  const edit = await call('/api/admin/products/bench', {
    method: 'PATCH',
    headers: {...headers, origin, 'x-catalog-edit': '1', 'content-type': 'application/json'},
    body: JSON.stringify({hearts: 4, revision: 0}),
  });
  assert.equal(edit.status, 200);
  assert.equal((await edit.json()).hearts, 4);
  assert.equal(db.prepare('SELECT updated_by FROM catalog_edits').get().updated_by, 'github:12345');
  assert.equal((await call('/api/admin/ui.js', {headers}, {GITHUB_OWNER_ID: '56789'})).status, 403);
  assert.equal((await call('https://alias.test/api/admin/ui.js', {headers})).status, 403);
  assert.equal((await call(logout, {method: 'POST', headers: {...headers, origin: 'https://other.test'}})).status, 403);
  assert.equal((await call(logout, {method: 'POST', headers: {...headers, origin}})).status, 303);
  assert.equal((await call('/api/admin/ui.js', {headers})).status, 403);
});

test('an expired owner session no longer authorizes the editor', async t => {
  const {call, db} = await setup(t, {id: ownerId});
  const signedIn = await finish(call, await flow(call));
  const [cookie] = signedIn.headers.getSetCookie()[0].split(';');
  db.exec('UPDATE github_owner_sessions SET expires_at = 0');
  assert.equal((await call('/api/admin/ui.js', {headers: {cookie}})).status, 403);
});
