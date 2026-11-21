/**
 * Integration test for the whole API against a real PostgreSQL.
 * The app runs its real migrations on start, so this also proves the
 * migrations build the schema the code expects. Mail and S3 are replaced by
 * fakes, so nothing is sent and nothing leaves the machine.
 *
 * Run a throwaway PostgreSQL, then the test:
 *   docker run -d --name it-pg -e POSTGRES_PASSWORD=postgres \
 *     -e POSTGRES_DB=blog_it -p 5433:5432 postgres:16-alpine
 *   TEST_DB_PORT=5433 pnpm test:e2e
 */
import { Test } from '@nestjs/testing';
import { INestApplication } from '@nestjs/common';
import { getDataSourceToken } from '@nestjs/typeorm';
import { DataSource } from 'typeorm';
import request from 'supertest';
import { AppModule } from '../src/app.module';
import { configureApp } from '../src/app.setup';
import { FileUpload } from '../src/aws/aws.file-upload';
import { base32Decode, hotp, timeStep } from '../src/auth/two-factor/totp';
import { MailService } from '../src/mail/mail.service';
import { AdminBootstrapService } from '../src/users/admin-bootstrap.service';

const PASSWORD = 'Passw0rd-e2e!';
const NEW_PASSWORD = 'N3w-Passw0rd-e2e!';

class FakeMail {
  sent: { to: string; subject: string; text: string }[] = [];
  // Set to true to behave like a mail server that is down.
  failing = false;
  async sendEmail(to: string, subject: string, text: string) {
    if (this.failing) return false;
    this.sent.push({ to, subject, text });
    return true;
  }
  lastPassword(to: string): string {
    const message = [...this.sent].reverse().find((m) => m.to === to);
    const match = /Temporary password: (\S+)/.exec(message?.text ?? '');
    if (!match) throw new Error(`No password was mailed to ${to}`);
    return match[1];
  }
  lastCode(to: string): string {
    const message = [...this.sent].reverse().find((m) => m.to === to);
    const match = /code is ([A-Z0-9]{6})/.exec(message?.text ?? '');
    if (!match) throw new Error(`No code was mailed to ${to}`);
    return match[1];
  }
}

class FakeFiles {
  uploaded: string[] = [];
  async uploadFile(_file: unknown, folder: string) {
    const key = `${folder}/fake-${this.uploaded.length + 1}.png`;
    this.uploaded.push(key);
    return key;
  }
  async getDownloadUrl(key: string) {
    return `https://files.test/${key}`;
  }
  async deleteFile() {}
}

interface PostBody {
  id: number;
  slug: string;
  published: boolean;
  tags?: { name: string }[];
}
interface Tokens {
  accessToken: string;
  refreshToken: string;
}

describe('Blog API (integration)', () => {
  let app: INestApplication;
  let dataSource: DataSource;
  const mail = new FakeMail();
  const files = new FakeFiles();
  let counter = 0;

  const http = () => request(app.getHttpServer());
  const bearer = (token: string) => ({ Authorization: `Bearer ${token}` });
  const nextEmail = (prefix = 'user') =>
    `${prefix}${(counter += 1)}-${Date.now()}@e2e.test`;

  async function register(email = nextEmail(), name = 'Tester') {
    const res = await http().post('/auth/register').send({ name, email, password: PASSWORD });
    expect(res.status).toBe(201);
    return email;
  }

  async function verify(email: string) {
    const res = await http()
      .post('/auth/verify-email')
      .send({ email, code: mail.lastCode(email) });
    expect(res.status).toBe(200);
  }

  async function login(email: string, password = PASSWORD): Promise<Tokens> {
    const res = await http().post('/auth/login').send({ email, password });
    expect(res.status).toBe(201);
    return res.body as Tokens;
  }

  async function signUp(name = 'Tester') {
    const email = await register(nextEmail(), name);
    await verify(email);
    return { email, ...(await login(email)) };
  }

  async function publishedPost(token: string, extra: Record<string, unknown> = {}) {
    counter += 1;
    const res = await http()
      .post('/posts')
      .set(bearer(token))
      .send({ title: `Post ${counter} ${Date.now()}`, content: 'Body text', published: true, ...extra });
    expect(res.status).toBe(201);
    return res.body as PostBody;
  }

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({ imports: [AppModule] })
      .overrideProvider(MailService)
      .useValue(mail)
      .overrideProvider(FileUpload)
      .useValue(files)
      .compile();
    app = moduleRef.createNestApplication();
    configureApp(app);
    await app.init();

    dataSource = app.get<DataSource>(getDataSourceToken());
    await dataSource.query(
      'TRUNCATE TABLE recovery_codes, mail_tokens, sessions, comments, posts_tags_tags, posts, tags, users RESTART IDENTITY CASCADE',
    );
    // The first admin was created at start, then wiped by the line above.
    await app.get(AdminBootstrapService).onApplicationBootstrap();
  });

  afterAll(async () => {
    await app?.close();
  });

  describe('probes and headers', () => {
    it('/health is up and /ready confirms the database answers', async () => {
      expect((await http().get('/health')).body).toEqual({ status: 'ok' });
      const ready = await http().get('/ready');
      expect(ready.status).toBe(200);
      expect(ready.body).toEqual({ status: 'ready', database: true });
    });

    it('sends security headers and hides the framework', async () => {
      const res = await http().get('/health');
      expect(res.headers['x-content-type-options']).toBe('nosniff');
      expect(res.headers['x-powered-by']).toBeUndefined();
    });
  });

  describe('registration and email verification', () => {
    it('registers without returning the password, and rejects a duplicate email', async () => {
      const email = nextEmail('dup');
      const first = await http().post('/auth/register').send({ name: 'A', email, password: PASSWORD });
      expect(first.status).toBe(201);
      expect(JSON.stringify(first.body)).not.toContain(PASSWORD);
      expect(first.body.user).not.toHaveProperty('password');
      expect(first.body.user.isVerified).toBe(false);

      const second = await http().post('/auth/register').send({ name: 'B', email, password: PASSWORD });
      expect(second.status).toBe(409);
    });

    it('rejects a weak password and refuses to let a client pick its own role', async () => {
      const weak = await http()
        .post('/auth/register')
        .send({ name: 'W', email: nextEmail('weak'), password: 'short' });
      expect(weak.status).toBe(400);

      const noSpecial = await http()
        .post('/auth/register')
        .send({ name: 'W', email: nextEmail('weak'), password: 'Password1234' });
      expect(noSpecial.status).toBe(400);

      const escalate = await http()
        .post('/auth/register')
        .send({ name: 'E', email: nextEmail('esc'), password: PASSWORD, role: 'admin' });
      expect(escalate.status).toBe(400);
    });

    it('keeps an unverified account out until the emailed code is used, once', async () => {
      const email = await register();
      const blocked = await http().post('/auth/login').send({ email, password: PASSWORD });
      expect(blocked.status).toBe(401);
      expect(blocked.body.message).toMatch(/verify your email/i);

      const wrong = await http().post('/auth/verify-email').send({ email, code: 'AAAAAA' });
      expect(wrong.status).toBe(400);

      const code = mail.lastCode(email);
      expect((await http().post('/auth/verify-email').send({ email, code })).status).toBe(200);
      expect((await http().post('/auth/verify-email').send({ email, code })).status).toBe(400);

      const tokens = await login(email);
      expect(tokens.accessToken).toBeTruthy();
      expect(tokens.refreshToken).toBeTruthy();
    });

    it('resend issues a fresh code and the old one stops working', async () => {
      const email = await register();
      const first = mail.lastCode(email);
      const res = await http().post('/auth/resend-verification').send({ email });
      expect(res.status).toBe(200);
      const second = mail.lastCode(email);
      if (second !== first) {
        expect((await http().post('/auth/verify-email').send({ email, code: first })).status).toBe(400);
      }
      expect((await http().post('/auth/verify-email').send({ email, code: second })).status).toBe(200);
    });

    it('gives the same 401 for a wrong password and an unknown email', async () => {
      const { email } = await signUp();
      const wrong = await http().post('/auth/login').send({ email, password: 'Wrong-Passw0rd!' });
      const unknown = await http().post('/auth/login').send({ email: nextEmail('nobody'), password: PASSWORD });
      expect(wrong.status).toBe(401);
      expect(unknown.status).toBe(401);
      expect(wrong.body.message).toBe(unknown.body.message);
    });

    it('stores a profile picture through the file service and returns a link to it', async () => {
      const email = nextEmail('img');
      const res = await http()
        .post('/auth/register')
        .field('name', 'Pic')
        .field('email', email)
        .field('password', PASSWORD)
        .attach('image', Buffer.from('not-really-a-png'), { filename: 'me.png', contentType: 'image/png' });
      expect(res.status).toBe(201);
      expect(res.body.user.profileImage).toMatch(/^https:\/\/files\.test\/users\/fake-/);

      const bad = await http()
        .post('/auth/register')
        .field('name', 'Pic')
        .field('email', nextEmail('img'))
        .field('password', PASSWORD)
        .attach('image', Buffer.from('hello'), { filename: 'a.txt', contentType: 'text/plain' });
      expect(bad.status).toBe(400);
    });
  });

  describe('refresh tokens and sessions', () => {
    it('rotates the refresh token, and a replayed old token ends the session', async () => {
      const user = await signUp();
      const rotated = await http().post('/auth/refresh').send({ refreshToken: user.refreshToken });
      expect(rotated.status).toBe(200);
      expect(rotated.body.refreshToken).not.toBe(user.refreshToken);
      expect(rotated.body.accessToken).toBeTruthy();

      const replay = await http().post('/auth/refresh').send({ refreshToken: user.refreshToken });
      expect(replay.status).toBe(401);
      // The thief's replay also killed the session the real owner held.
      const owner = await http().post('/auth/refresh').send({ refreshToken: rotated.body.refreshToken });
      expect(owner.status).toBe(401);
    });

    it('does not accept an access token as a refresh token or the other way round', async () => {
      const user = await signUp();
      const asRefresh = await http().post('/auth/refresh').send({ refreshToken: user.accessToken });
      expect(asRefresh.status).toBe(401);
      const asBearer = await http().get('/auth/me').set(bearer(user.refreshToken));
      expect(asBearer.status).toBe(401);
      expect((await http().get('/auth/me').set(bearer(user.accessToken))).status).toBe(200);
    });

    it('logs out one device with its refresh token, or all devices without one', async () => {
      const first = await signUp();
      const second = await login(first.email);

      const one = await http()
        .post('/auth/logout')
        .set(bearer(first.accessToken))
        .send({ refreshToken: first.refreshToken });
      expect(one.status).toBe(200);
      expect((await http().post('/auth/refresh').send({ refreshToken: first.refreshToken })).status).toBe(401);
      expect((await http().post('/auth/refresh').send({ refreshToken: second.refreshToken })).status).toBe(200);

      const third = await login(first.email);
      const all = await http().post('/auth/logout').set(bearer(third.accessToken)).send({});
      expect(all.status).toBe(200);
      expect((await http().post('/auth/refresh').send({ refreshToken: third.refreshToken })).status).toBe(401);
    });

    it('keeps at most five sessions per user, dropping the oldest', async () => {
      const first = await signUp();
      const rest: Tokens[] = [];
      for (let i = 0; i < 5; i++) rest.push(await login(first.email));
      expect((await http().post('/auth/refresh').send({ refreshToken: first.refreshToken })).status).toBe(401);
      expect((await http().post('/auth/refresh').send({ refreshToken: rest[4].refreshToken })).status).toBe(200);
    });
  });

  describe('forgot and reset password', () => {
    it('answers the same for an unknown email', async () => {
      const known = await signUp();
      const a = await http().post('/auth/forgot-password').send({ email: known.email });
      const b = await http().post('/auth/forgot-password').send({ email: nextEmail('ghost') });
      expect(a.status).toBe(200);
      expect(b.status).toBe(200);
      expect(a.body).toEqual(b.body);
    });

    it('resets with the emailed code once, and signs every device out', async () => {
      const user = await signUp();
      await http().post('/auth/forgot-password').send({ email: user.email });
      const code = mail.lastCode(user.email);

      const mismatch = await http()
        .post('/auth/reset-password')
        .send({ email: user.email, code, newPassword: NEW_PASSWORD, confirmPassword: 'Different-1!' });
      expect(mismatch.status).toBe(400);

      // A typo did not burn the code.
      const reset = await http()
        .post('/auth/reset-password')
        .send({ email: user.email, code, newPassword: NEW_PASSWORD, confirmPassword: NEW_PASSWORD });
      expect(reset.status).toBe(200);
      const again = await http()
        .post('/auth/reset-password')
        .send({ email: user.email, code, newPassword: NEW_PASSWORD, confirmPassword: NEW_PASSWORD });
      expect(again.status).toBe(400);

      expect((await http().post('/auth/login').send({ email: user.email, password: PASSWORD })).status).toBe(401);
      expect((await login(user.email, NEW_PASSWORD)).accessToken).toBeTruthy();
      expect((await http().post('/auth/refresh').send({ refreshToken: user.refreshToken })).status).toBe(401);
    });

    it('does not let a verification code reset a password', async () => {
      const email = await register();
      const verifyCode = mail.lastCode(email);
      const res = await http()
        .post('/auth/reset-password')
        .send({ email, code: verifyCode, newPassword: NEW_PASSWORD, confirmPassword: NEW_PASSWORD });
      expect(res.status).toBe(400);
    });
  });

  describe('users and roles', () => {
    it('shows and updates the signed-in user, and changes the password with the current one', async () => {
      const user = await signUp('Before');
      const me = await http().get('/users/me').set(bearer(user.accessToken));
      expect(me.status).toBe(200);
      expect(me.body.name).toBe('Before');
      expect(me.body).not.toHaveProperty('password');

      const updated = await http()
        .patch('/users/me')
        .set(bearer(user.accessToken))
        .send({ name: 'After', bio: 'Writes about databases' });
      expect(updated.status).toBe(200);
      expect(updated.body.user.name).toBe('After');
      expect(updated.body.user.bio).toBe('Writes about databases');
      // Fields that were not sent are untouched.
      expect(updated.body.user.email).toBe(user.email);

      const wrong = await http()
        .post('/users/me/change-password')
        .set(bearer(user.accessToken))
        .send({ currentPassword: 'Nope-Nope-1!', newPassword: NEW_PASSWORD });
      expect(wrong.status).toBe(401);
      const changed = await http()
        .post('/users/me/change-password')
        .set(bearer(user.accessToken))
        .send({ currentPassword: PASSWORD, newPassword: NEW_PASSWORD });
      expect(changed.status).toBe(201);
      expect((await login(user.email, NEW_PASSWORD)).accessToken).toBeTruthy();
    });

    it('lets only an admin list users, create accounts and deactivate them', async () => {
      const normal = await signUp();
      expect((await http().get('/users').set(bearer(normal.accessToken))).status).toBe(403);
      expect((await http().get('/users')).status).toBe(401);

      const admin = await login('admin@e2e.test', 'Admin-Passw0rd-e2e!');
      const list = await http().get('/users?limit=50').set(bearer(admin.accessToken));
      expect(list.status).toBe(200);
      expect(list.body.total).toBeGreaterThan(0);

      const email = nextEmail('made');
      const created = await http()
        .post('/users')
        .set(bearer(admin.accessToken))
        .send({ name: 'Made By Admin', email });
      expect(created.status).toBe(201);
      // The password goes to the new user's inbox, never into the response.
      expect(created.body.defaultPassword).toBeUndefined();
      const madePassword = mail.lastPassword(email);
      // Already verified, so it can sign in straight away.
      const made = await login(email, madePassword);
      const madeId = created.body.user.id as number;

      const self = await http().get('/users/me').set(bearer(admin.accessToken));
      const selfDeactivate = await http()
        .patch(`/users/${self.body.id}/deactivate`)
        .set(bearer(admin.accessToken));
      expect(selfDeactivate.status).toBe(400);

      const off = await http().patch(`/users/${madeId}/deactivate`).set(bearer(admin.accessToken));
      expect(off.status).toBe(200);
      expect((await http().post('/auth/login').send({ email, password: madePassword })).status).toBe(403);
      expect((await http().post('/auth/refresh').send({ refreshToken: made.refreshToken })).status).toBe(401);

      const on = await http().patch(`/users/${madeId}/activate`).set(bearer(admin.accessToken));
      expect(on.status).toBe(200);
      expect((await login(email, madePassword)).accessToken).toBeTruthy();
    });

    it('shows the password once only when mail is down outside production', async () => {
      const admin = await login('admin@e2e.test', 'Admin-Passw0rd-e2e!');
      mail.failing = true;
      try {
        const created = await http()
          .post('/users')
          .set(bearer(admin.accessToken))
          .send({ name: 'No Mail', email: nextEmail('nomail') });
        expect(created.status).toBe(201);
        expect(created.body.defaultPassword).toBeTruthy();
      } finally {
        mail.failing = false;
      }
    });

    it('answers 404 for Google sign-in when it is not configured', async () => {
      expect((await http().get('/auth/google')).status).toBe(404);
    });
  });

  describe('two-factor authentication', () => {
    // Codes must be newer than the last one accepted, so each step of a test
    // uses a later time step: enable on now-1, sign in on now, disable on now+1.
    const totp = (secret: string, offset: number) =>
      hotp(base32Decode(secret), timeStep() + offset);

    it('walks through setup, sign-in with a code, a backup code, and turning it off', async () => {
      const user = await signUp('Two Factor');

      const setup = await http().post('/auth/2fa/setup').set(bearer(user.accessToken));
      expect(setup.status).toBe(200);
      const secret = setup.body.secret as string;
      expect(setup.body.otpauthUrl).toContain(`secret=${secret}`);

      // Not on yet: signing in still works with the password alone.
      expect((await http().post('/auth/login').send({ email: user.email, password: PASSWORD })).body.accessToken).toBeTruthy();

      const wrong = await http().post('/auth/2fa/enable').set(bearer(user.accessToken)).send({ code: '000000' });
      expect(wrong.status).toBe(400);

      const enabled = await http()
        .post('/auth/2fa/enable')
        .set(bearer(user.accessToken))
        .send({ code: totp(secret, -1) });
      expect(enabled.status).toBe(200);
      const recoveryCodes = enabled.body.recoveryCodes as string[];
      expect(recoveryCodes).toHaveLength(8);
      expect((await http().post('/auth/2fa/setup').set(bearer(user.accessToken))).status).toBe(409);
      expect((await http().get('/users/me').set(bearer(user.accessToken))).body.twoFactorEnabled).toBe(true);

      // The secret is encrypted in the database.
      const stored = await dataSource.query('SELECT "twoFactorSecret" FROM users WHERE email = $1', [user.email]);
      expect(stored[0].twoFactorSecret).toBeTruthy();
      expect(stored[0].twoFactorSecret).not.toContain(secret);

      // Password alone no longer gives tokens.
      const step1 = await http().post('/auth/login').send({ email: user.email, password: PASSWORD });
      expect(step1.status).toBe(201);
      expect(step1.body.twoFactorRequired).toBe(true);
      expect(step1.body.accessToken).toBeUndefined();
      const challengeToken = step1.body.challengeToken as string;
      // A challenge is not an access token.
      expect((await http().get('/users/me').set(bearer(challengeToken))).status).toBe(401);

      const second = (code: string, email = user.email) =>
        http().post('/auth/2fa/login').send({ email, challengeToken, code });
      expect((await second('000000')).status).toBe(401);
      expect((await second(totp(secret, 0), 'someone-else@e2e.test')).status).toBe(401);
      const code = totp(secret, 0);
      const done = await second(code);
      expect(done.status).toBe(200);
      expect(done.body.accessToken).toBeTruthy();
      expect(done.body.refreshToken).toBeTruthy();
      // The same code cannot be used twice.
      expect((await second(code)).status).toBe(401);

      // A backup code works once.
      const again = await http().post('/auth/login').send({ email: user.email, password: PASSWORD });
      const viaBackup = await http()
        .post('/auth/2fa/login')
        .send({ email: user.email, challengeToken: again.body.challengeToken, code: recoveryCodes[0].toLowerCase() });
      expect(viaBackup.status).toBe(200);
      const reuse = await http().post('/auth/login').send({ email: user.email, password: PASSWORD });
      const reused = await http()
        .post('/auth/2fa/login')
        .send({ email: user.email, challengeToken: reuse.body.challengeToken, code: recoveryCodes[0] });
      expect(reused.status).toBe(401);

      // Turning it off needs the password and a current code.
      const disableBody = (password: string) => ({ password, code: totp(secret, 1) });
      expect(
        (await http().post('/auth/2fa/disable').set(bearer(user.accessToken)).send(disableBody('Wrong-Passw0rd!'))).status,
      ).toBe(401);
      expect(
        (await http().post('/auth/2fa/disable').set(bearer(user.accessToken)).send(disableBody(PASSWORD))).status,
      ).toBe(200);
      const plain = await http().post('/auth/login').send({ email: user.email, password: PASSWORD });
      expect(plain.body.accessToken).toBeTruthy();
      expect(plain.body.twoFactorRequired).toBeUndefined();
    });

    it('needs sign-in for setup, and a challenge for the second step', async () => {
      expect((await http().post('/auth/2fa/setup')).status).toBe(401);
      const res = await http()
        .post('/auth/2fa/login')
        .send({ email: 'a@e2e.test', challengeToken: 'nope', code: '123456' });
      expect(res.status).toBe(401);
    });
  });

  describe('posts', () => {
    it('keeps drafts private until the author publishes them', async () => {
      const { accessToken: token } = await signUp();
      const created = await http()
        .post('/posts')
        .set(bearer(token))
        .send({ title: `Draft ${Date.now()}`, content: 'Not yet', tags: ['NestJS', 'sql'] });
      expect(created.status).toBe(201);
      const draft = created.body as PostBody;
      expect(draft.published).toBe(false);

      expect((await http().get(`/posts/${draft.slug}`)).status).toBe(404);
      const list = await http().get('/posts?limit=50');
      expect((list.body as { items: PostBody[] }).items.some((p) => p.id === draft.id)).toBe(false);
      const mine = await http().get('/posts/mine').set(bearer(token));
      expect((mine.body as PostBody[]).some((p) => p.id === draft.id)).toBe(true);

      const published = await http().patch(`/posts/${draft.id}`).set(bearer(token)).send({ published: true });
      expect(published.status).toBe(200);
      expect((await http().get(`/posts/${draft.slug}`)).status).toBe(200);
    });

    it('lowercases tags, filters by tag and counts posts per tag', async () => {
      const { accessToken: token } = await signUp();
      const post = await publishedPost(token, { tags: ['TypeORM', 'typeorm', 'Postgres'] });
      expect(post.tags?.map((t) => t.name).sort()).toEqual(['postgres', 'typeorm']);

      const filtered = await http().get('/posts?tag=TYPEORM&limit=50');
      expect((filtered.body as { items: PostBody[] }).items.some((p) => p.id === post.id)).toBe(true);

      const tags = await http().get('/tags');
      const typeorm = (tags.body as { name: string; postCount: number }[]).find((t) => t.name === 'typeorm');
      expect(typeorm?.postCount).toBeGreaterThanOrEqual(1);
    });

    it('requires a login to write and validates paging', async () => {
      expect((await http().post('/posts').send({ title: 'x', content: 'y' })).status).toBe(401);
      expect((await http().get('/posts?limit=100')).status).toBe(400);
      expect((await http().get('/posts?page=0')).status).toBe(400);
    });
  });

  describe('ownership', () => {
    it('stops other users editing or deleting a post, but lets an admin', async () => {
      const author = await signUp();
      const stranger = await signUp();
      const post = await publishedPost(author.accessToken);

      const edit = await http().patch(`/posts/${post.id}`).set(bearer(stranger.accessToken)).send({ title: 'Hijacked' });
      expect(edit.status).toBe(403);
      expect((await http().delete(`/posts/${post.id}`).set(bearer(stranger.accessToken))).status).toBe(403);

      const admin = await login('admin@e2e.test', 'Admin-Passw0rd-e2e!');
      const adminEdit = await http()
        .patch(`/posts/${post.id}`)
        .set(bearer(admin.accessToken))
        .send({ title: 'Edited by admin' });
      expect(adminEdit.status).toBe(200);
    });
  });

  describe('comments', () => {
    it('allows comments on published posts only', async () => {
      const author = await signUp();
      const reader = await signUp();
      const post = await publishedPost(author.accessToken);

      const ok = await http().post(`/posts/${post.id}/comments`).set(bearer(reader.accessToken)).send({ content: 'Nice post' });
      expect(ok.status).toBe(201);
      const listed = await http().get(`/posts/${post.id}/comments`);
      expect((listed.body as { total: number }).total).toBe(1);

      const draft = (
        await http().post('/posts').set(bearer(author.accessToken)).send({ title: `D ${Date.now()}`, content: 'x' })
      ).body as PostBody;
      const onDraft = await http().post(`/posts/${draft.id}/comments`).set(bearer(reader.accessToken)).send({ content: 'Sneaky' });
      expect(onDraft.status).toBe(404);
    });

    it('lets the commenter or the post owner delete a comment, but nobody else', async () => {
      const author = await signUp();
      const reader = await signUp();
      const outsider = await signUp();
      const post = await publishedPost(author.accessToken);
      const comment = (
        await http().post(`/posts/${post.id}/comments`).set(bearer(reader.accessToken)).send({ content: 'Removable' })
      ).body as { id: number };

      expect((await http().delete(`/comments/${comment.id}`).set(bearer(outsider.accessToken))).status).toBe(403);
      expect((await http().delete(`/comments/${comment.id}`).set(bearer(author.accessToken))).status).toBe(200);
    });
  });
});
