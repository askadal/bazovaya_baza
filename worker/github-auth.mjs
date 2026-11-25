const OWNER_COOKIE = '__Host-maf-owner';
const FLOW_COOKIE = '__Host-maf-github-flow';
const SESSION_AGE = 8 * 60 * 60;
const FLOW_AGE = 10 * 60;
const RANDOM_VALUE = /^[A-Za-z0-9_-]{43}$/;
const AUTH_PATH = '/api/auth/github/';
const CALLBACK = AUTH_PATH + 'callback';
const privateHeaders = {
  'cache-control': 'private, no-store',
  'referrer-policy': 'no-referrer',
  'x-content-type-options': 'nosniff',
  vary: 'Cookie',
};

function settings(env, request) {
  const origin = env.AUTH_ORIGIN?.trim();
  const ownerId = env.GITHUB_OWNER_ID?.trim();
  const clientId = env.GITHUB_CLIENT_ID?.trim();
  const clientSecret = env.GITHUB_CLIENT_SECRET?.trim();
  if (!origin || !/^[1-9][0-9]{0,15}$/.test(ownerId || '') || !clientId || !clientSecret || !env.DB) return null;
  let target;
  try {
    target = new URL(origin);
  } catch {
    return null;
  }
  if (target.protocol !== 'https:' || target.origin !== origin || new URL(request.url).origin !== origin) return null;
  return {origin, ownerId, clientId, clientSecret};
}

function cookie(request, name) {
  const matches = (request.headers.get('cookie') || '').split(';')
    .map(value => value.trim()).filter(value => value.startsWith(name + '='));
  return matches.length === 1 ? matches[0].slice(name.length + 1) : '';
}

function setCookie(name, value, age) {
  return `${name}=${value}; Path=/; Max-Age=${age}; Secure; HttpOnly; SameSite=Lax`;
}

function base64url(bytes) {
  return btoa(String.fromCharCode(...bytes)).replaceAll('+', '-').replaceAll('/', '_').replaceAll('=', '');
}

function randomValue() {
  return base64url(crypto.getRandomValues(new Uint8Array(32)));
}

async function digest(value) {
  const result = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(value));
  return base64url(new Uint8Array(result));
}

async function activeOwner(request, env, config) {
  const token = cookie(request, OWNER_COOKIE);
  if (!RANDOM_VALUE.test(token)) return null;
  const row = await env.DB.prepare(
    'SELECT owner_id FROM github_owner_sessions WHERE token_hash = ? AND owner_id = ? AND expires_at > ?',
  ).bind(await digest(token), config.ownerId, Date.now()).first();
  return row ? 'github:' + row.owner_id : null;
}

export async function githubOwner(request, env) {
  const config = settings(env, request);
  return config ? activeOwner(request, env, config) : null;
}

function redirect(location, cookies, status = 303) {
  const headers = new Headers({...privateHeaders, location});
  for (const value of cookies) headers.append('set-cookie', value);
  return new Response(null, {status, headers});
}

function page(title, content, status = 200, cookies = []) {
  const headers = new Headers({
    ...privateHeaders,
    'content-type': 'text/html; charset=utf-8',
    'content-security-policy': "default-src 'none'; style-src 'unsafe-inline'; form-action 'self'; frame-ancestors 'none'; base-uri 'none'",
  });
  for (const value of cookies) headers.append('set-cookie', value);
  return new Response(`<!doctype html><html lang="ru"><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1"><title>${title}</title>
<style>body{font:16px/1.6 system-ui,sans-serif;color:#141414;background:#fff;margin:0}
main{max-width:36rem;margin:12vh auto;padding:0 1.5rem}
h1{font-size:clamp(1.5rem,5vw,2.2rem);font-weight:600;line-height:1.2}
a,button{color:inherit}button,.action{display:inline-block;background:#fff;border:1px solid #969696;
border-radius:2rem;padding:.6rem 1rem;font:inherit;text-decoration:none;cursor:pointer}form{margin-top:1rem}</style>
</head><body><main><a href="/">К каталогу</a><h1>${title}</h1>${content}</main></body></html>`, {status, headers});
}

async function startLogin(config) {
  const state = randomValue();
  const verifier = randomValue();
  const authorize = new URL('https://github.com/login/oauth/authorize');
  authorize.search = new URLSearchParams({
    client_id: config.clientId,
    redirect_uri: config.origin + CALLBACK,
    state,
    code_challenge: await digest(verifier),
    code_challenge_method: 'S256',
    allow_signup: 'false',
  }).toString();
  return redirect(authorize.href, [setCookie(FLOW_COOKIE, state + '.' + verifier, FLOW_AGE)], 302);
}

async function callback(request, env, config, githubFetch) {
  const expiredFlow = setCookie(FLOW_COOKIE, '', 0);
  const {searchParams} = new URL(request.url);
  const [state, verifier, ...extra] = cookie(request, FLOW_COOKIE).split('.');
  const code = searchParams.get('code') || '';
  if (extra.length || !RANDOM_VALUE.test(state) || !RANDOM_VALUE.test(verifier || '') ||
      searchParams.get('state') !== state || !/^[A-Za-z0-9_-]{1,256}$/.test(code)) {
    return page('Вход не завершён', '<p>Начните вход заново в этой вкладке.</p><a href="/owner">Ко входу</a>', 400, [expiredFlow]);
  }
  const tokenResponse = await githubFetch('https://github.com/login/oauth/access_token', {
    method: 'POST',
    headers: {accept: 'application/json', 'content-type': 'application/x-www-form-urlencoded'},
    body: new URLSearchParams({
      client_id: config.clientId,
      client_secret: config.clientSecret,
      code,
      redirect_uri: config.origin + CALLBACK,
      code_verifier: verifier,
    }),
    redirect: 'error',
    signal: AbortSignal.timeout(12000),
  });
  const token = tokenResponse.ok ? (await tokenResponse.json()).access_token : null;
  if (typeof token !== 'string' || !/^[A-Za-z0-9_-]{1,512}$/.test(token)) {
    return page('Не удалось войти', '<p>GitHub не подтвердил вход. Попробуйте ещё раз.</p><a href="/owner">Ко входу</a>', 401, [expiredFlow]);
  }
  const userResponse = await githubFetch('https://api.github.com/user', {
    headers: {accept: 'application/vnd.github+json', authorization: 'Bearer ' + token, 'user-agent': 'maf-catalog-owner-login'},
    redirect: 'error',
    signal: AbortSignal.timeout(12000),
  });
  if (!userResponse.ok) throw new Error('GitHub identity unavailable');
  const user = await userResponse.json();
  if (!Number.isSafeInteger(user.id) || String(user.id) !== config.ownerId) {
    return page('Доступ закрыт', '<p>У этого аккаунта GitHub нет доступа к режиму разработчика.</p>', 403, [expiredFlow]);
  }

  const session = randomValue();
  const now = Date.now();
  await env.DB.prepare('DELETE FROM github_owner_sessions WHERE expires_at <= ?').bind(now).run();
  await env.DB.prepare('INSERT INTO github_owner_sessions (token_hash, owner_id, expires_at) VALUES (?, ?, ?)')
    .bind(await digest(session), config.ownerId, now + SESSION_AGE * 1000).run();
  return redirect('/', [setCookie(OWNER_COOKIE, session, SESSION_AGE), expiredFlow]);
}

export async function githubAuth(request, env, githubFetch) {
  const {pathname} = new URL(request.url);
  const ownerPage = pathname === '/owner' || pathname === '/owner/';
  const start = AUTH_PATH + 'start';
  const logout = AUTH_PATH + 'logout';
  if (!ownerPage && ![start, CALLBACK, logout].includes(pathname)) return page('Страница не найдена', '', 404);
  if (request.method !== (pathname === logout ? 'POST' : 'GET')) return page('Метод не поддерживается', '', 405);
  const config = settings(env, request);
  if (!config) return page('Вход недоступен', '<p>Подключите вход GitHub на основном адресе каталога.</p>', 503);
  try {
    if (ownerPage) {
      const owner = await activeOwner(request, env, config);
      return owner
        ? page('Режим разработчика', '<p>Вход выполнен. Откройте каталог и нажмите кнопку режима разработчика.</p><form action="/api/auth/github/logout" method="post"><button>Выйти из режима разработчика</button></form>')
        : page('Вход владельца', '<p>Для редактирования войдите через GitHub.</p><a class="action" href="/api/auth/github/start">Войти через GitHub</a>');
    }
    if (pathname === start) return await startLogin(config);
    if (pathname === CALLBACK) return await callback(request, env, config, githubFetch);
    if (request.headers.get('origin') !== config.origin || request.headers.get('sec-fetch-site') === 'cross-site') {
      return page('Доступ закрыт', '<p>Выйдите через страницу входа на сайте каталога.</p>', 403);
    }
    const token = cookie(request, OWNER_COOKIE);
    if (RANDOM_VALUE.test(token)) {
      await env.DB.prepare('DELETE FROM github_owner_sessions WHERE token_hash = ?').bind(await digest(token)).run();
    }
    return redirect('/owner', [setCookie(OWNER_COOKIE, '', 0), setCookie(FLOW_COOKIE, '', 0)]);
  } catch {
    return page('Вход недоступен', '<p>Не удалось завершить запрос. Попробуйте ещё раз.</p><a href="/owner">Ко входу</a>', 503,
      pathname === CALLBACK ? [setCookie(FLOW_COOKIE, '', 0)] : []);
  }
}
