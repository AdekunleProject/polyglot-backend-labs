/**
 * Integration test for the whole API against a real PostgreSQL.
 * The app runs its real migrations on start, so this also proves the
 * migrations build the schema the code expects. Mail and S3 are replaced by
 * fakes, so nothing is sent and nothing leaves the machine.
 *
 * Run a throwaway PostgreSQL, then the test:
 *   docker run -d --name it-pg -e POSTGRES_PASSWORD=postgres \
 *     -e POSTGRES_DB=chat_it -p 5433:5432 postgres:16-alpine
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
  user: { id: number };
}

describe('Chat API (integration)', () => {
  let app: INestApplication;
  let dataSource: DataSource;
  const mail = new FakeMail();
  const files = new FakeFiles();
  let counter = 0;

  const http = () => request(app.getHttpServer());
  const bearer = (token: string) => ({ Authorization: `Bearer ${token}` });
  const nextEmail = (prefix = 'user') =>
    `${prefix}${(counter += 1)}-${Date.now()}@e2e.test`;

  // Every field sign-up asks for. `firstname` is the one tests vary.
  const registerBody = (email: string, firstname = 'Tester', extra: Record<string, unknown> = {}) => ({
    firstname,
    lastname: 'User',
    username: `u${counter}_${Date.now().toString(36)}`,
    email,
    password: PASSWORD,
    ...extra,
  });

  async function register(email = nextEmail(), name = 'Tester') {
    const res = await http().post('/auth/register').send(registerBody(email, name));
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
      'TRUNCATE TABLE devices, audit_logs, recovery_codes, mail_tokens, sessions, users RESTART IDENTITY CASCADE',
    );
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
  });

  describe('accounts', () => {
    it('registers with a username, never returns the password, and rejects duplicates', async () => {
      const email = nextEmail('dup');
      const body = registerBody(email, 'A', { username: 'ada_one' });
      const first = await http().post('/auth/register').send(body);
      expect(first.status).toBe(201);
      expect(first.body.user.username).toBe('ada_one');
      expect(first.body.user).not.toHaveProperty('password');

      expect((await http().post('/auth/register').send(registerBody(email, 'B'))).status).toBe(409);
      expect(
        (await http().post('/auth/register').send(registerBody(nextEmail(), 'C', { username: 'ada_one' }))).status,
      ).toBe(409);
    });

    it('rejects a bad username, a weak password and a client-chosen role', async () => {
      for (const extra of [{ username: 'Ada Lovelace' }, { username: 'ab' }, { password: 'short' }, { role: 'admin' }]) {
        expect((await http().post('/auth/register').send(registerBody(nextEmail(), 'X', extra))).status).toBe(400);
      }
    });

    it('verifies the email, signs in, and refuses a wrong password', async () => {
      const user = await signUp();
      expect(user.accessToken).toBeTruthy();
      const me = await http().get('/auth/me').set(bearer(user.accessToken));
      expect(me.status).toBe(200);
      expect(
        (await http().post('/auth/login').send({ email: user.email, password: 'Wrong-Passw0rd!' })).status,
      ).toBe(401);
    });
  });

  describe('devices and sessions', () => {
    it('labels each sign-in, lists the devices and signs one out', async () => {
      const user = await signUp();
      const phone = await http()
        .post('/auth/login')
        .send({ email: user.email, password: PASSWORD, deviceName: "Ada's phone" });
      expect(phone.status).toBe(201);

      const list = await http().get('/auth/sessions').set(bearer(phone.body.accessToken));
      const sessions = list.body as { id: string; deviceName: string | null; tokenHash?: string }[];
      expect(sessions.some((s) => s.deviceName === "Ada's phone")).toBe(true);
      expect(sessions.every((s) => s.tokenHash === undefined)).toBe(true);

      const target = sessions.find((s) => s.deviceName === "Ada's phone")!;
      expect((await http().delete(`/auth/sessions/${target.id}`).set(bearer(phone.body.accessToken))).status).toBe(200);
      expect((await http().post('/auth/refresh').send({ refreshToken: phone.body.refreshToken })).status).toBe(401);
    });

    it('registers a push token and moves it to the next account on the same phone', async () => {
      const a = await signUp();
      const b = await signUp();
      const token = `ExponentPushToken[test-${Date.now()}]`;
      for (const who of [a, b]) {
        expect(
          (await http().post('/devices').set(bearer(who.accessToken)).send({ token, platform: 'android' })).status,
        ).toBe(200);
      }
      const rows = (await dataSource.query('SELECT "userId" FROM devices WHERE token = $1', [token])) as { userId: number }[];
      expect(rows).toHaveLength(1);
      expect(rows[0].userId).toBe(b.user.id);
      expect((await http().post('/devices').set(bearer(a.accessToken)).send({ token, platform: 'toaster' })).status).toBe(400);
    });
  });
});
