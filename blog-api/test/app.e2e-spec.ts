/**
 * Integration test for the whole API against a real PostgreSQL.
 * The app runs its real migrations on start, so this also proves the
 * migrations build the schema the code expects.
 *
 * Run a throwaway PostgreSQL, then the test:
 *   docker run -d --name it-pg -e POSTGRES_PASSWORD=postgres \
 *     -e POSTGRES_DB=blog_it -p 5433:5432 postgres:16-alpine
 *   TEST_DB_PORT=5433 pnpm test:e2e
 */
import { Test } from '@nestjs/testing';
import { INestApplication, ValidationPipe } from '@nestjs/common';
import { getDataSourceToken } from '@nestjs/typeorm';
import { DataSource } from 'typeorm';
import request from 'supertest';
import { AppModule } from '../src/app.module';
import { AllExceptionsFilter } from '../src/common/filters/all-exceptions.filter';

const PASSWORD = 'Passw0rd-e2e!';

interface PostBody {
  id: number;
  slug: string;
  title: string;
  published: boolean;
  tags?: { name: string }[];
}

describe('Blog API (integration)', () => {
  let app: INestApplication;
  let dataSource: DataSource;
  let counter = 0;

  const http = () => request(app.getHttpServer());
  const bearer = (token: string) => ({ Authorization: `Bearer ${token}` });

  async function signUp(name = 'Tester') {
    counter += 1;
    const email = `user${counter}-${Date.now()}@e2e.test`;
    const reg = await http()
      .post('/auth/register')
      .send({ name, email, password: PASSWORD });
    expect(reg.status).toBe(201);
    return { email, token: await signIn(email) };
  }

  async function signIn(email: string): Promise<string> {
    const res = await http().post('/auth/login').send({ email, password: PASSWORD });
    expect(res.status).toBe(201);
    return (res.body as { accessToken: string }).accessToken;
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
    const moduleRef = await Test.createTestingModule({ imports: [AppModule] }).compile();
    app = moduleRef.createNestApplication();
    app.useGlobalPipes(
      new ValidationPipe({ whitelist: true, forbidNonWhitelisted: true, transform: true }),
    );
    app.useGlobalFilters(new AllExceptionsFilter());
    await app.init();

    dataSource = app.get<DataSource>(getDataSourceToken());
    await dataSource.query(
      'TRUNCATE TABLE comments, posts_tags_tags, posts, tags, users RESTART IDENTITY CASCADE',
    );
  });

  afterAll(async () => {
    await app?.close();
  });

  describe('probes', () => {
    it('/health is up and /ready confirms the database answers', async () => {
      expect((await http().get('/health')).body).toEqual({ status: 'ok' });
      const ready = await http().get('/ready');
      expect(ready.status).toBe(200);
      expect(ready.body).toEqual({ status: 'ready', database: true });
    });
  });

  describe('accounts', () => {
    it('registers without returning the password and rejects a duplicate email', async () => {
      const email = `dup-${Date.now()}@e2e.test`;
      const first = await http().post('/auth/register').send({ name: 'A', email, password: PASSWORD });
      expect(first.status).toBe(201);
      expect(JSON.stringify(first.body)).not.toContain(PASSWORD);
      expect(first.body).not.toHaveProperty('password');

      const second = await http().post('/auth/register').send({ name: 'B', email, password: PASSWORD });
      expect(second.status).toBe(409);
    });

    it('rejects a weak password and refuses to let a client pick its own role', async () => {
      const weak = await http()
        .post('/auth/register')
        .send({ name: 'W', email: `weak-${Date.now()}@e2e.test`, password: 'short' });
      expect(weak.status).toBe(400);

      const escalate = await http()
        .post('/auth/register')
        .send({ name: 'E', email: `esc-${Date.now()}@e2e.test`, password: PASSWORD, role: 'admin' });
      expect(escalate.status).toBe(400);
    });

    it('gives the same 401 for a wrong password and an unknown email', async () => {
      const { email } = await signUp();
      const wrong = await http().post('/auth/login').send({ email, password: 'Wrong-Passw0rd!' });
      const unknown = await http()
        .post('/auth/login')
        .send({ email: `nobody-${Date.now()}@e2e.test`, password: PASSWORD });
      expect(wrong.status).toBe(401);
      expect(unknown.status).toBe(401);
      expect((wrong.body as { message: string }).message).toBe(
        (unknown.body as { message: string }).message,
      );
    });
  });

  describe('posts', () => {
    it('keeps drafts private until the author publishes them', async () => {
      const { token } = await signUp();
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

      const published = await http()
        .patch(`/posts/${draft.id}`)
        .set(bearer(token))
        .send({ published: true });
      expect(published.status).toBe(200);
      expect((await http().get(`/posts/${draft.slug}`)).status).toBe(200);
    });

    it('lowercases tags, filters by tag and counts posts per tag', async () => {
      const { token } = await signUp();
      const post = await publishedPost(token, { tags: ['TypeORM', 'typeorm', 'Postgres'] });
      expect(post.tags?.map((t) => t.name).sort()).toEqual(['postgres', 'typeorm']);

      const filtered = await http().get('/posts?tag=TYPEORM&limit=50');
      expect((filtered.body as { items: PostBody[] }).items.some((p) => p.id === post.id)).toBe(true);

      const tags = await http().get('/tags');
      const typeorm = (tags.body as { name: string; postCount: number }[]).find(
        (t) => t.name === 'typeorm',
      );
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
      const post = await publishedPost(author.token);

      const edit = await http().patch(`/posts/${post.id}`).set(bearer(stranger.token)).send({ title: 'Hijacked' });
      expect(edit.status).toBe(403);
      const del = await http().delete(`/posts/${post.id}`).set(bearer(stranger.token));
      expect(del.status).toBe(403);

      const admin = await signUp();
      await dataSource.query('UPDATE users SET role = $1 WHERE email = $2', ['admin', admin.email]);
      const adminToken = await signIn(admin.email);
      const adminEdit = await http()
        .patch(`/posts/${post.id}`)
        .set(bearer(adminToken))
        .send({ title: 'Edited by admin' });
      expect(adminEdit.status).toBe(200);
    });
  });

  describe('comments', () => {
    it('allows comments on published posts only', async () => {
      const author = await signUp();
      const reader = await signUp();
      const post = await publishedPost(author.token);

      const ok = await http()
        .post(`/posts/${post.id}/comments`)
        .set(bearer(reader.token))
        .send({ content: 'Nice post' });
      expect(ok.status).toBe(201);
      const listed = await http().get(`/posts/${post.id}/comments`);
      expect((listed.body as { total: number }).total).toBe(1);

      const draft = (
        await http().post('/posts').set(bearer(author.token)).send({ title: `D ${Date.now()}`, content: 'x' })
      ).body as PostBody;
      const onDraft = await http()
        .post(`/posts/${draft.id}/comments`)
        .set(bearer(reader.token))
        .send({ content: 'Sneaky' });
      expect(onDraft.status).toBe(404);
    });

    it('lets the commenter or the post owner delete a comment, but nobody else', async () => {
      const author = await signUp();
      const reader = await signUp();
      const outsider = await signUp();
      const post = await publishedPost(author.token);
      const comment = (
        await http()
          .post(`/posts/${post.id}/comments`)
          .set(bearer(reader.token))
          .send({ content: 'Removable' })
      ).body as { id: number };

      const denied = await http().delete(`/comments/${comment.id}`).set(bearer(outsider.token));
      expect(denied.status).toBe(403);
      const byOwner = await http().delete(`/comments/${comment.id}`).set(bearer(author.token));
      expect(byOwner.status).toBe(200);
    });
  });
});
