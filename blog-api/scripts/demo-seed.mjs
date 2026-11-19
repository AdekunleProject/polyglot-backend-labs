// Fills a running API with a few demo users, posts, tags and comments by
// calling the API itself. Safe to run twice: anything that already exists is
// skipped.
//
//   docker compose exec api node scripts/demo-seed.mjs
//
// Optional: API_URL (default http://127.0.0.1:PORT).
//
// Sign-up needs an emailed code, which a demo cannot read, so the script marks
// its own demo accounts as verified directly in the database (it uses the same
// DB_* settings as the app).

import pg from 'pg';

const base = process.env.API_URL ?? `http://127.0.0.1:${process.env.PORT ?? 3000}`;
const PASSWORD = 'Demo-Passw0rd!';

async function call(method, path, body, token) {
  const res = await fetch(base + path, {
    method,
    headers: {
      'Content-Type': 'application/json',
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    },
    body: body ? JSON.stringify(body) : undefined,
  });
  const text = await res.text();
  let data;
  try { data = JSON.parse(text); } catch { data = text; }
  return { ok: res.ok, status: res.status, data };
}

const db = new pg.Client({
  host: process.env.DB_HOST,
  port: Number(process.env.DB_PORT),
  user: process.env.DB_USER,
  password: process.env.DB_PASSWORD,
  database: process.env.DB_NAME,
  ssl: process.env.DB_SSL === 'true',
});
await db.connect();

async function user(name, email) {
  const created = await call('POST', '/auth/register', { name, email, password: PASSWORD });
  console.log(created.ok ? `created user ${email}` : `user ${email} exists`);
  await db.query('UPDATE users SET "isVerified" = true WHERE email = $1', [email]);
  const login = await call('POST', '/auth/login', { email, password: PASSWORD });
  if (!login.ok) throw new Error(`login failed for ${email}: ${login.status}`);
  return login.data.accessToken;
}

const ada = await user('Ada Writer', 'ada@demo.test');
const tunde = await user('Tunde Reader', 'tunde@demo.test');

const posts = [
  { title: 'Why migrations beat synchronize', tags: ['postgres', 'typeorm'],
    content: 'Schema changes belong in versioned migrations so every environment ends up identical and a bad change can be reverted.' },
  { title: 'Readiness is not liveness', tags: ['kubernetes', 'devops'],
    content: 'Liveness says the process is up. Readiness says it can do useful work. Mixing them up restarts healthy pods during a database outage.' },
  { title: 'Draft: ideas for next month', tags: ['notes'], published: false,
    content: 'A private draft that only the author can see.' },
];

let firstPublished;
for (const p of posts) {
  const published = p.published ?? true;
  if (published) {
    const found = await call('GET', `/posts?search=${encodeURIComponent(p.title)}&limit=50`);
    const existing = found.data?.items?.find((i) => i.title === p.title);
    if (existing) { console.log(`post exists: ${p.title}`); firstPublished ??= existing; continue; }
  }
  const r = await call('POST', '/posts', { ...p, published }, ada);
  console.log(r.ok ? `created post: ${p.title}` : `post failed (${r.status}): ${p.title}`);
  if (r.ok && published) firstPublished ??= r.data;
}

if (firstPublished) {
  const existing = await call('GET', `/posts/${firstPublished.id}/comments`);
  if (existing.data?.total > 0) {
    console.log('comments exist');
  } else {
    await call('POST', `/posts/${firstPublished.id}/comments`, { content: 'Clear and useful, thank you.' }, tunde);
    console.log('created a comment');
  }
}
await db.end();
console.log('\nDone. Browse GET /posts and GET /tags.');
console.log(`Demo logins: ada@demo.test and tunde@demo.test, password ${PASSWORD}`);
