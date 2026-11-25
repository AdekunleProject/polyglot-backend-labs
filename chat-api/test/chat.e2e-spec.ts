/**
 * Chat integration test: REST and live sockets against a real PostgreSQL.
 * See app.e2e-spec.ts for how to run a throwaway database.
 */
import { Test } from '@nestjs/testing';
import { INestApplication } from '@nestjs/common';
import { getDataSourceToken } from '@nestjs/typeorm';
import { DataSource } from 'typeorm';
import { createHmac } from 'crypto';
import request from 'supertest';
import { io, Socket } from 'socket.io-client';
import { AppModule } from '../src/app.module';
import { configureApp } from '../src/app.setup';
import { FileUpload } from '../src/aws/aws.file-upload';
import { decryptBackup } from '../src/backups/backup-crypto';
import { StatusService } from '../src/status/status.service';
import { MailService } from '../src/mail/mail.service';
import { SmsService } from '../src/phone/sms.service';

const PASSWORD = 'Passw0rd-e2e!';

class FakeMail {
  sent: { to: string; text: string }[] = [];
  async sendEmail(to: string, _subject: string, text: string) {
    this.sent.push({ to, text });
    return true;
  }
  lastCode(to: string) {
    const message = [...this.sent].reverse().find((m) => m.to === to);
    const match = /code is ([A-Z0-9]{6})/.exec(message?.text ?? '');
    if (!match) throw new Error(`No code was mailed to ${to}`);
    return match[1];
  }
}

class FakeSms {
  sent: { to: string; text: string }[] = [];
  async send(to: string, text: string) {
    this.sent.push({ to, text });
    return true;
  }
  lastCode(to: string) {
    const message = [...this.sent].reverse().find((m) => m.to === to);
    const match = /is (\d{6})/.exec(message?.text ?? '');
    if (!match) throw new Error(`No code was texted to ${to}`);
    return match[1];
  }
  count(to: string) {
    return this.sent.filter((m) => m.to === to).length;
  }
}

class FakeFiles {
  stored = new Map<string, number>();
  objects = new Map<string, Buffer>();
  deleted: string[] = [];
  async putObject(key: string, body: Buffer) {
    this.objects.set(key, body);
  }
  async createUploadUrl(key: string) {
    return `https://files.test/upload/${key}`;
  }
  async headFile(key: string) {
    return this.stored.has(key) ? { size: this.stored.get(key)! } : null;
  }
  async getDownloadUrl(key: string) {
    return `https://files.test/get/${key}`;
  }
  async deleteFile(key: string) {
    this.deleted.push(key);
    this.stored.delete(key);
    this.objects.delete(key);
  }
  /** Pretend the phone finished uploading to the pre-signed link. */
  finish(uploadUrl: string, size: number) {
    this.stored.set(uploadUrl.replace('https://files.test/upload/', ''), size);
  }
}

interface Person {
  id: number;
  token: string;
  name: string;
}

describe('Chat (integration)', () => {
  let app: INestApplication;
  let port: number;
  const mail = new FakeMail();
  const files = new FakeFiles();
  const sms = new FakeSms();
  const sockets: Socket[] = [];
  let counter = 0;

  const http = () => request(app.getHttpServer());
  const auth = (p: Person) => ({ Authorization: `Bearer ${p.token}` });

  async function person(name: string): Promise<Person> {
    counter += 1;
    const email = `${name.toLowerCase()}${counter}-${Date.now()}@e2e.test`;
    const reg = await http()
      .post('/auth/register')
      .send({
        firstname: name,
        lastname: 'Chat',
        username: `${name.toLowerCase()}_${counter}_${Date.now().toString(36)}`,
        email,
        password: PASSWORD,
      });
    expect(reg.status).toBe(201);
    await http().post('/auth/verify-email').send({ email, code: mail.lastCode(email) }).expect(200);
    const login = await http().post('/auth/login').send({ email, password: PASSWORD });
    expect(login.status).toBe(201);
    return { id: login.body.user.id, token: login.body.accessToken, name };
  }

  function connect(p: Person): Promise<Socket> {
    return new Promise((resolve, reject) => {
      const socket = io(`http://localhost:${port}`, {
        auth: { token: p.token },
        transports: ['websocket'],
        reconnection: false,
      });
      sockets.push(socket);
      socket.on('connect', () => resolve(socket));
      socket.on('connect_error', reject);
    });
  }

  const waitFor = <T>(socket: Socket, event: string, timeoutMs = 4000) =>
    new Promise<T>((resolve, reject) => {
      const timer = setTimeout(() => reject(new Error(`no "${event}" event`)), timeoutMs);
      socket.once(event, (payload: T) => {
        clearTimeout(timer);
        resolve(payload);
      });
    });

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({ imports: [AppModule] })
      .overrideProvider(MailService)
      .useValue(mail)
      .overrideProvider(SmsService)
      .useValue(sms)
      .overrideProvider(FileUpload)
      .useValue(files)
      .compile();
    app = moduleRef.createNestApplication({ rawBody: true });
    configureApp(app);
    await app.init();
    await app.listen(0);
    port = (app.getHttpServer().address() as { port: number }).port;
    await app
      .get<DataSource>(getDataSourceToken())
      .query(
        'TRUNCATE TABLE reports, blocks, call_participants, calls, ledger_entries, wallet_transactions, wallets, status_views, status_audience, statuses, backups, phone_codes, device_links, media_uploads, messages, conversation_members, conversations, devices, audit_logs, recovery_codes, mail_tokens, sessions, users RESTART IDENTITY CASCADE',
      );
  });

  afterAll(async () => {
    sockets.forEach((s) => s.disconnect());
    await app?.close();
  });

  describe('direct chat over REST', () => {
    let ada: Person;
    let bob: Person;
    let eve: Person;
    let chatId: string;

    beforeAll(async () => {
      [ada, bob, eve] = [await person('Ada'), await person('Bob'), await person('Eve')];
    });

    it('opens one chat per pair, whoever starts it', async () => {
      const first = await http().post('/conversations/direct').set(auth(ada)).send({ userId: bob.id });
      expect(first.status).toBe(200);
      chatId = first.body.id;
      const again = await http().post('/conversations/direct').set(auth(bob)).send({ userId: ada.id });
      expect(again.body.id).toBe(chatId);
      expect((await http().post('/conversations/direct').set(auth(ada)).send({ userId: ada.id })).status).toBe(400);
    });

    it('sends once even when the phone retries with the same clientId', async () => {
      const body = { clientId: 'c-1', body: 'hello bob' };
      const one = await http().post(`/conversations/${chatId}/messages`).set(auth(ada)).send(body);
      const two = await http().post(`/conversations/${chatId}/messages`).set(auth(ada)).send(body);
      expect(one.status).toBe(201);
      expect(two.body.id).toBe(one.body.id);
      const history = await http().get(`/conversations/${chatId}/messages`).set(auth(bob));
      expect(history.body.items).toHaveLength(1);
      expect(history.body.items[0].body).toBe('hello bob');
    });

    it('keeps strangers out and does not reveal that the chat exists', async () => {
      expect((await http().get(`/conversations/${chatId}`).set(auth(eve))).status).toBe(404);
      expect((await http().get(`/conversations/${chatId}/messages`).set(auth(eve))).status).toBe(404);
      expect(
        (await http().post(`/conversations/${chatId}/messages`).set(auth(eve)).send({ clientId: 'x', body: 'hi' })).status,
      ).toBe(404);
    });

    it('shows unread counts, then clears them when read, and ticks the sender', async () => {
      const list = await http().get('/conversations').set(auth(bob));
      expect(list.body[0].unread).toBe(1);
      expect(list.body[0].peer.id).toBe(ada.id);

      const history = await http().get(`/conversations/${chatId}/messages`).set(auth(ada));
      expect(history.body.items[0].status).toBe('sent');
      await http().post(`/conversations/${chatId}/read`).set(auth(bob)).send({ upToId: history.body.items[0].id }).expect(200);

      expect((await http().get('/conversations').set(auth(bob))).body[0].unread).toBe(0);
      const after = await http().get(`/conversations/${chatId}/messages`).set(auth(ada));
      expect(after.body.items[0].status).toBe('read');
    });

    it('lets only the sender edit or delete, and shows a deleted message as deleted', async () => {
      const sent = await http().post(`/conversations/${chatId}/messages`).set(auth(ada)).send({ clientId: 'c-2', body: 'typo' });
      expect((await http().patch(`/messages/${sent.body.id}`).set(auth(bob)).send({ body: 'hacked' })).status).toBe(403);
      const edited = await http().patch(`/messages/${sent.body.id}`).set(auth(ada)).send({ body: 'fixed' });
      expect(edited.body.body).toBe('fixed');
      expect(edited.body.editedAt).toBeTruthy();
      await http().delete(`/messages/${sent.body.id}`).set(auth(ada)).expect(200);
      const history = await http().get(`/conversations/${chatId}/messages?limit=5`).set(auth(bob));
      const gone = history.body.items.find((m: { id: number }) => m.id === sent.body.id);
      expect(gone.deleted).toBe(true);
      expect(gone.body).toBeNull();
    });

    it('pages history with a cursor and rejects a made-up one', async () => {
      for (let i = 0; i < 4; i += 1) {
        await http().post(`/conversations/${chatId}/messages`).set(auth(bob)).send({ clientId: `p-${i}`, body: `m${i}` });
      }
      const page1 = await http().get(`/conversations/${chatId}/messages?limit=3`).set(auth(ada));
      expect(page1.body.items).toHaveLength(3);
      expect(page1.body.nextCursor).toBeTruthy();
      const page2 = await http().get(`/conversations/${chatId}/messages?limit=3&cursor=${page1.body.nextCursor}`).set(auth(ada));
      const ids = [...page1.body.items, ...page2.body.items].map((m: { id: number }) => m.id);
      expect(new Set(ids).size).toBe(ids.length);
      expect(Math.max(...page2.body.items.map((m: { id: number }) => m.id))).toBeLessThan(Math.min(...page1.body.items.map((m: { id: number }) => m.id)));
      expect((await http().get(`/conversations/${chatId}/messages?cursor=zzz`).set(auth(ada))).status).toBe(400);
    });

    it('finds people by username without listing the caller', async () => {
      const found = await http().get('/people?q=bob').set(auth(ada));
      expect(found.body.some((p: { id: number }) => p.id === bob.id)).toBe(true);
      expect(found.body.some((p: { id: number }) => p.id === ada.id)).toBe(false);
    });
  });

  describe('group chat', () => {
    let owner: Person;
    let admin: Person;
    let member: Person;
    let outsider: Person;
    let groupId: string;

    beforeAll(async () => {
      [owner, admin, member, outsider] = [await person('Olu'), await person('Ayo'), await person('Mide'), await person('Zed')];
    });

    it('creates a group with the creator as owner and a system line', async () => {
      const res = await http().post('/conversations/group').set(auth(owner)).send({ title: 'Team', memberIds: [admin.id, member.id] });
      expect(res.status).toBe(201);
      groupId = res.body.id;
      expect(res.body.myRole).toBe('owner');
      expect(res.body.members).toHaveLength(3);
      const history = await http().get(`/conversations/${groupId}/messages`).set(auth(member));
      expect(history.body.items[0].type).toBe('system');
    });

    it('lets only the owner promote, and admins add or remove members', async () => {
      expect((await http().patch(`/conversations/${groupId}/members/${admin.id}/role`).set(auth(member)).send({ role: 'admin' })).status).toBe(403);
      await http().patch(`/conversations/${groupId}/members/${admin.id}/role`).set(auth(owner)).send({ role: 'admin' }).expect(200);

      expect((await http().post(`/conversations/${groupId}/members`).set(auth(member)).send({ userIds: [outsider.id] })).status).toBe(403);
      await http().post(`/conversations/${groupId}/members`).set(auth(admin)).send({ userIds: [outsider.id] }).expect(200);
      expect((await http().get(`/conversations/${groupId}`).set(auth(outsider))).status).toBe(200);

      expect((await http().delete(`/conversations/${groupId}/members/${owner.id}`).set(auth(admin))).status).toBe(403);
      await http().delete(`/conversations/${groupId}/members/${outsider.id}`).set(auth(admin)).expect(200);
      expect((await http().get(`/conversations/${groupId}`).set(auth(outsider))).status).toBe(404);
    });

    it('marks a group message read only once everyone has read it', async () => {
      const sent = await http().post(`/conversations/${groupId}/messages`).set(auth(owner)).send({ clientId: 'g-1', body: 'standup' });
      await http().post(`/conversations/${groupId}/read`).set(auth(admin)).send({ upToId: sent.body.id }).expect(200);
      let history = await http().get(`/conversations/${groupId}/messages?limit=1`).set(auth(owner));
      expect(history.body.items[0].status).not.toBe('read');
      await http().post(`/conversations/${groupId}/read`).set(auth(member)).send({ upToId: sent.body.id }).expect(200);
      history = await http().get(`/conversations/${groupId}/messages?limit=1`).set(auth(owner));
      expect(history.body.items[0].status).toBe('read');
    });

    it('hands ownership on when the owner leaves', async () => {
      await http().post(`/conversations/${groupId}/leave`).set(auth(owner)).expect(200);
      const group = await http().get(`/conversations/${groupId}`).set(auth(admin));
      expect(group.body.myRole).toBe('owner');
      expect(group.body.members).toHaveLength(2);
    });

    it('does not let a left member read the group again', async () => {
      expect((await http().get(`/conversations/${groupId}/messages`).set(auth(owner))).status).toBe(404);
    });
  });

  describe('live sockets', () => {
    let ada: Person;
    let bob: Person;
    let chatId: string;

    beforeAll(async () => {
      [ada, bob] = [await person('Sia'), await person('Tobi')];
      chatId = (await http().post('/conversations/direct').set(auth(ada)).send({ userId: bob.id })).body.id;
    });

    it('refuses a connection without a valid token', async () => {
      const bad = io(`http://localhost:${port}`, { auth: { token: 'nope' }, transports: ['websocket'], reconnection: false });
      sockets.push(bad);
      await expect(new Promise((_, reject) => bad.on('connect_error', reject))).rejects.toBeTruthy();
    });

    it('delivers a message live, acks the sender, and sends receipts and typing', async () => {
      const a = await connect(ada);
      const b = await connect(bob);

      const incoming = waitFor<{ body: string; id: number }>(b, 'message:new');
      const ack = await a.emitWithAck('message:send', { conversationId: chatId, clientId: 's-1', body: 'live!' });
      expect(ack.ok).toBe(true);
      expect((await incoming).body).toBe('live!');

      const retry = await a.emitWithAck('message:send', { conversationId: chatId, clientId: 's-1', body: 'live!' });
      expect(retry.data.id).toBe(ack.data.id);

      const receipt = waitFor<{ kind: string; userId: number; upToId: number }>(a, 'receipt');
      await b.emitWithAck('message:read', { conversationId: chatId, upToId: ack.data.id });
      expect(await receipt).toMatchObject({ kind: 'read', userId: bob.id, upToId: ack.data.id });

      const typing = waitFor<{ userId: number; isTyping: boolean }>(b, 'typing');
      await a.emitWithAck('typing', { conversationId: chatId, isTyping: true });
      expect(await typing).toMatchObject({ userId: ada.id, isTyping: true });
    });

    it('returns an error, not a crash, for a chat the person is not in', async () => {
      const outsider = await person('Out');
      const o = await connect(outsider);
      const ack = await o.emitWithAck('message:send', { conversationId: chatId, clientId: 'o-1', body: 'let me in' });
      expect(ack.ok).toBe(false);
    });

    it('tells friends when someone goes online and offline', async () => {
      const [kemi, lola] = [await person('Kemi'), await person('Lola')];
      await http().post('/conversations/direct').set(auth(kemi)).send({ userId: lola.id });
      const l = await connect(lola);
      const online = waitFor<{ userId: number; online: boolean }>(l, 'presence');
      const k = await connect(kemi);
      expect(await online).toMatchObject({ userId: kemi.id, online: true });
      const offline = waitFor<{ userId: number; online: boolean }>(l, 'presence');
      k.disconnect();
      expect(await offline).toMatchObject({ userId: kemi.id, online: false });
    });
  });

  describe('media', () => {
    let ada: Person;
    let bob: Person;
    let eve: Person;
    let chatId: string;

    beforeAll(async () => {
      [ada, bob, eve] = [await person('Mia'), await person('Ned'), await person('Orla')];
      chatId = (await http().post('/conversations/direct').set(auth(ada)).send({ userId: bob.id })).body.id;
    });

    const upload = (p: Person, body: Record<string, unknown>) =>
      http().post('/media/uploads').set(auth(p)).send({ conversationId: chatId, ...body });

    it('sends a voice note: ask for a link, upload, then send with the mediaId', async () => {
      const res = await upload(ada, {
        kind: 'voice',
        contentType: 'audio/mp4',
        size: 48_000,
        durationMs: 7300,
        waveform: [3, 40, 90, 20],
      });
      expect(res.status).toBe(200);
      expect(res.body.uploadUrl).toContain('/chat/');
      expect(res.body.mediaId).toBeTruthy();

      const early = await http().post(`/conversations/${chatId}/messages`).set(auth(ada)).send({
        clientId: 'v-early', type: 'voice', mediaId: res.body.mediaId,
      });
      expect(early.status).toBe(400);

      files.finish(res.body.uploadUrl, 48_000);
      const sent = await http().post(`/conversations/${chatId}/messages`).set(auth(ada)).send({
        clientId: 'v-1', type: 'voice', mediaId: res.body.mediaId,
      });
      expect(sent.status).toBe(201);
      expect(sent.body.media).toMatchObject({ kind: 'voice', durationMs: 7300, waveform: [3, 40, 90, 20] });
      expect(sent.body.media.url).toContain('https://files.test/get/');
      expect(sent.body.media).not.toHaveProperty('key');

      const retry = await http().post(`/conversations/${chatId}/messages`).set(auth(ada)).send({
        clientId: 'v-1', type: 'voice', mediaId: res.body.mediaId,
      });
      expect(retry.body.id).toBe(sent.body.id);

      const history = await http().get(`/conversations/${chatId}/messages?limit=1`).set(auth(bob));
      expect(history.body.items[0].media.url).toBeTruthy();
      const list = await http().get('/conversations').set(auth(bob));
      expect(list.body[0].lastMessage.preview).toBe('Voice message');
    });

    it('sends a video with a caption and removes the file when the message is deleted', async () => {
      const res = await upload(ada, { kind: 'video', contentType: 'video/mp4', size: 5_000_000, durationMs: 30000, width: 1280, height: 720 });
      files.finish(res.body.uploadUrl, 5_000_000);
      const sent = await http().post(`/conversations/${chatId}/messages`).set(auth(ada)).send({
        clientId: 'vid-1', type: 'video', mediaId: res.body.mediaId, body: 'look at this',
      });
      expect(sent.body.body).toBe('look at this');
      await http().delete(`/messages/${sent.body.id}`).set(auth(ada)).expect(200);
      expect(files.deleted.some((k) => k.endsWith('.mp4'))).toBe(true);
    });

    it('refuses wrong types, oversize files, empty voice notes and strangers', async () => {
      expect((await upload(ada, { kind: 'file', contentType: 'application/x-msdownload', size: 1000 })).status).toBe(400);
      expect((await upload(ada, { kind: 'image', contentType: 'image/png', size: 11 * 1024 * 1024 })).status).toBe(400);
      expect((await upload(ada, { kind: 'voice', contentType: 'audio/mp4', size: 1000 })).status).toBe(400);
      expect((await upload(ada, { kind: 'voice', contentType: 'audio/mp4', size: 1000, durationMs: 901_000 })).status).toBe(400);
      expect((await upload(eve, { kind: 'image', contentType: 'image/png', size: 1000 })).status).toBe(404);
    });

    it('does not let someone send another person\'s upload, a wrong kind, or a used one twice', async () => {
      const res = await upload(ada, { kind: 'image', contentType: 'image/png', size: 2000 });
      files.finish(res.body.uploadUrl, 2000);
      const send = (p: Person, clientId: string, type: string) =>
        http().post(`/conversations/${chatId}/messages`).set(auth(p)).send({ clientId, type, mediaId: res.body.mediaId });
      expect((await send(bob, 'x-1', 'image')).status).toBe(400);
      expect((await send(ada, 'x-2', 'file')).status).toBe(400);
      expect((await send(ada, 'x-3', 'image')).status).toBe(201);
      expect((await send(ada, 'x-4', 'image')).status).toBe(400);
    });

    it('refuses a file larger than the size that was declared', async () => {
      const res = await upload(ada, { kind: 'file', contentType: 'application/pdf', size: 1000 });
      files.finish(res.body.uploadUrl, 999_999);
      const sent = await http().post(`/conversations/${chatId}/messages`).set(auth(ada)).send({
        clientId: 'big-1', type: 'file', mediaId: res.body.mediaId,
      });
      expect(sent.status).toBe(400);
    });
  });

  describe('device sign-out', () => {
    async function twoDevices() {
      const phone = await person('Dayo');
      const email = (await http().get('/auth/me').set(auth(phone))).body.email as string;
      const second = await http().post('/auth/login').send({ email, password: PASSWORD, deviceName: 'Laptop' });
      return { phone, laptop: { id: phone.id, token: second.body.accessToken as string, name: 'Dayo' } as Person };
    }

    it('stops a signed-out device at once and closes its live connection', async () => {
      const { phone, laptop } = await twoDevices();
      const socket = await connect(laptop);
      const closed = new Promise<string>((resolve) => socket.on('disconnect', resolve));

      const sessions = await http().get('/auth/sessions').set(auth(phone));
      const laptopSession = sessions.body.find((x: { deviceName: string }) => x.deviceName === 'Laptop');
      await http().delete(`/auth/sessions/${laptopSession.id}`).set(auth(phone)).expect(200);

      expect(await closed).toBeTruthy();
      expect((await http().get('/auth/me').set(auth(laptop))).status).toBe(401);
      expect((await http().get('/auth/me').set(auth(phone))).status).toBe(200);
    });

    it('signs out every other device and keeps the one asking', async () => {
      const { phone, laptop } = await twoDevices();
      const res = await http().post('/auth/sessions/revoke-others').set(auth(phone));
      expect(res.status).toBe(200);
      expect(res.body.count).toBeGreaterThanOrEqual(1);
      expect((await http().get('/auth/me').set(auth(laptop))).status).toBe(401);
      expect((await http().get('/auth/me').set(auth(phone))).status).toBe(200);
    });
  });

  describe('phone number sign-in', () => {
    let ada: Person;
    const NUMBER = '0803 111 2222';
    const E164 = '+2348031112222';

    beforeAll(async () => {
      ada = await person('Pelu');
    });

    it('verifies a number with an SMS code, normalised to one spelling', async () => {
      expect((await http().post('/phone/add').set(auth(ada)).send({ phoneNumber: 'abc' })).status).toBe(400);
      await http().post('/phone/add').set(auth(ada)).send({ phoneNumber: NUMBER }).expect(200);
      const wrong = await http().post('/phone/confirm').set(auth(ada)).send({ phoneNumber: NUMBER, code: '000000' });
      expect(wrong.status).toBe(400);
      const ok = await http().post('/phone/confirm').set(auth(ada)).send({ phoneNumber: NUMBER, code: sms.lastCode(E164) });
      expect(ok.status).toBe(200);
      expect(ok.body.phoneNumber).toBe(E164);
    });

    it('does not let a second account claim a verified number', async () => {
      const other = await person('Quin');
      expect((await http().post('/phone/add').set(auth(other)).send({ phoneNumber: E164 })).status).toBe(409);
    });

    it('answers the same for a known and an unknown number, and texts only the known one', async () => {
      const known = await http().post('/auth/phone/request').send({ phoneNumber: E164 });
      const unknown = await http().post('/auth/phone/request').send({ phoneNumber: '+2348099999999' });
      expect(known.status).toBe(200);
      expect(unknown.body).toEqual(known.body);
      expect(sms.count('+2348099999999')).toBe(0);
      expect(sms.count(E164)).toBeGreaterThanOrEqual(2);
    });

    it('signs in with the code once, and a wrong code or reuse is refused', async () => {
      const code = sms.lastCode(E164);
      const bad = await http().post('/auth/phone/verify').send({ phoneNumber: E164, code: code === '111111' ? '222222' : '111111' });
      expect(bad.status).toBe(401);
      const good = await http().post('/auth/phone/verify').send({ phoneNumber: NUMBER, code, deviceName: 'Chrome on Windows' });
      expect(good.status).toBe(200);
      expect(good.body.user.id).toBe(ada.id);
      expect((await http().get('/auth/me').set({ Authorization: `Bearer ${good.body.accessToken}` })).status).toBe(200);
      expect((await http().post('/auth/phone/verify').send({ phoneNumber: E164, code })).status).toBe(401);
      const sessions = await http().get('/auth/sessions').set(auth(ada));
      expect(sessions.body.some((x: { deviceName: string }) => x.deviceName === 'Chrome on Windows')).toBe(true);
    });

    it('asks for a new code before another is sent, and locks a code after 5 wrong guesses', async () => {
      await http().post('/auth/phone/request').send({ phoneNumber: E164 }).expect(200);
      const before = sms.count(E164);
      await http().post('/auth/phone/request').send({ phoneNumber: E164 }).expect(200);
      expect(sms.count(E164)).toBe(before);

      const target = await person('Ruth');
      await http().post('/phone/add').set(auth(target)).send({ phoneNumber: '+2348033333333' }).expect(200);
      const real = sms.lastCode('+2348033333333');
      const wrong = real === '123456' ? '654321' : '123456';
      for (let i = 0; i < 5; i += 1) {
        await http().post('/phone/confirm').set(auth(target)).send({ phoneNumber: '+2348033333333', code: wrong });
      }
      const late = await http().post('/phone/confirm').set(auth(target)).send({ phoneNumber: '+2348033333333', code: real });
      expect(late.status).toBe(400);
    });
  });

  describe('link a laptop with a QR code', () => {
    let phone: Person;

    beforeAll(async () => {
      phone = await person('Seyi');
    });

    it('shows the device, waits for approval, then hands the laptop its own session once', async () => {
      const start = await http().post('/auth/link/start').send({ deviceName: 'Seyi laptop' });
      expect(start.status).toBe(200);
      const { linkId, secret } = start.body;

      expect((await http().post('/auth/link/poll').send({ linkId, secret })).body.status).toBe('pending');
      expect((await http().post('/auth/link/poll').send({ linkId, secret: 'wrong' })).status).toBe(410);

      const seen = await http().post('/auth/link/inspect').set(auth(phone)).send({ linkId, secret });
      expect(seen.body.deviceName).toBe('Seyi laptop');
      await http().post('/auth/link/approve').set(auth(phone)).send({ linkId, secret }).expect(200);

      const done = await http().post('/auth/link/poll').send({ linkId, secret });
      expect(done.body.status).toBe('approved');
      expect(done.body.user.id).toBe(phone.id);
      const laptop = { Authorization: `Bearer ${done.body.accessToken}` };
      expect((await http().get('/auth/me').set(laptop)).status).toBe(200);
      expect((await http().post('/auth/link/poll').send({ linkId, secret })).status).toBe(410);

      const sessions = await http().get('/auth/sessions').set(auth(phone));
      expect(sessions.body.some((x: { deviceName: string }) => x.deviceName === 'Seyi laptop')).toBe(true);
    });

    it('does not sign anyone in when the phone denies, or without a signed-in phone', async () => {
      const { linkId, secret } = (await http().post('/auth/link/start').send({ deviceName: 'Stranger PC' })).body;
      expect((await http().post('/auth/link/approve').send({ linkId, secret })).status).toBe(401);
      await http().post('/auth/link/deny').set(auth(phone)).send({ linkId, secret }).expect(200);
      expect((await http().post('/auth/link/poll').send({ linkId, secret })).body.status).toBe('denied');
      expect((await http().post('/auth/link/approve').set(auth(phone)).send({ linkId, secret })).status).toBe(410);
    });
  });

  describe('add a person by QR code', () => {
    let ada: Person;
    let bob: Person;

    beforeAll(async () => {
      [ada, bob] = [await person('Tari'), await person('Uche')];
    });

    it('scanning opens the chat, and your own code is refused', async () => {
      const code = (await http().get('/contacts/qr').set(auth(ada))).body.payload as string;
      expect(code.startsWith('chatqr:')).toBe(true);
      const scan = await http().post('/contacts/scan').set(auth(bob)).send({ code });
      expect(scan.status).toBe(200);
      expect(scan.body.user.id).toBe(ada.id);
      expect(scan.body.conversation.type).toBe('direct');
      expect((await http().post('/contacts/scan').set(auth(ada)).send({ code })).status).toBe(400);
    });

    it('refuses garbage and a login token pretending to be a QR code', async () => {
      expect((await http().post('/contacts/scan').set(auth(bob)).send({ code: 'chatqr:nope' })).status).toBe(404);
      expect((await http().post('/contacts/scan').set(auth(bob)).send({ code: `chatqr:${ada.token}` })).status).toBe(404);
      expect((await http().post('/contacts/scan').set(auth(bob)).send({ code: 'hello' })).status).toBe(404);
    });

    it('stops old codes working after a reset, and when scanning is switched off', async () => {
      const old = (await http().get('/contacts/qr').set(auth(ada))).body.payload as string;
      const fresh = (await http().post('/contacts/qr/reset').set(auth(ada))).body.payload as string;
      expect((await http().post('/contacts/scan').set(auth(bob)).send({ code: old })).status).toBe(404);
      expect((await http().post('/contacts/scan').set(auth(bob)).send({ code: fresh })).status).toBe(200);
      await http().patch('/contacts/qr').set(auth(ada)).send({ enabled: false }).expect(200);
      expect((await http().post('/contacts/scan').set(auth(bob)).send({ code: fresh })).status).toBe(404);
    });
  });

  describe('backups', () => {
    let ada: Person;
    let bob: Person;
    let eve: Person;
    let chatId: string;

    async function ready(p: Person, id: string) {
      for (let i = 0; i < 60; i += 1) {
        const res = await http().get(`/backups/${id}`).set(auth(p));
        if (res.body.status !== 'pending') return res;
        await new Promise((r) => setTimeout(r, 250));
      }
      throw new Error('backup did not finish');
    }

    beforeAll(async () => {
      [ada, bob, eve] = [await person('Wale'), await person('Xena'), await person('Yemi')];
      chatId = (await http().post('/conversations/direct').set(auth(ada)).send({ userId: bob.id })).body.id;
      await http().post(`/conversations/${chatId}/messages`).set(auth(ada)).send({ clientId: 'bk-1', body: 'backup-me-please' });
      const doomed = await http().post(`/conversations/${chatId}/messages`).set(auth(bob)).send({ clientId: 'bk-2', body: 'delete-me' });
      await http().delete(`/messages/${doomed.body.id}`).set(auth(bob)).expect(200);
    });

    it('refuses a short password', async () => {
      expect((await http().post('/backups').set(auth(ada)).send({ password: 'short' })).status).toBe(400);
    });

    it('makes an encrypted archive that only the password opens, without deleted messages', async () => {
      const started = await http().post('/backups').set(auth(ada)).send({ password: 'my-backup-password' });
      expect(started.status).toBe(202);
      const done = await ready(ada, started.body.id);
      expect(done.body.status).toBe('ready');
      expect(done.body.downloadUrl).toContain('https://files.test/get/backups/');
      expect(done.body.messageCount).toBeGreaterThanOrEqual(1);

      const key = [...files.objects.keys()].find((k) => k.includes(started.body.id))!;
      const archive = files.objects.get(key)!;
      expect(archive.includes('backup-me-please')).toBe(false);
      expect(() => decryptBackup(archive, 'not-the-password')).toThrow();

      const data = decryptBackup<{ conversations: { id: string; messages: { body: string }[] }[]; user: { id: number } }>(
        archive,
        'my-backup-password',
      );
      expect(data.user.id).toBe(ada.id);
      const chat = data.conversations.find((c) => c.id === chatId)!;
      const bodies = chat.messages.map((m) => m.body);
      expect(bodies).toContain('backup-me-please');
      expect(bodies).not.toContain('delete-me');
    });

    it('keeps one running backup at a time and lists only your own', async () => {
      const first = await http().post('/backups').set(auth(bob)).send({ password: 'another-password' });
      const second = await http().post('/backups').set(auth(bob)).send({ password: 'another-password' });
      expect(first.status).toBe(202);
      expect([202, 409]).toContain(second.status);
      await ready(bob, first.body.id);
      const mine = await http().get('/backups').set(auth(bob));
      expect(mine.body.length).toBeGreaterThanOrEqual(1);
      expect((await http().get('/backups').set(auth(eve))).body).toEqual([]);
    });

    it('hides a backup from other people and removes the file when deleted', async () => {
      const started = await http().post('/backups').set(auth(eve)).send({ password: 'eve-password-1' });
      await ready(eve, started.body.id);
      expect((await http().get(`/backups/${started.body.id}`).set(auth(ada))).status).toBe(404);
      expect((await http().delete(`/backups/${started.body.id}`).set(auth(ada))).status).toBe(404);
      await http().delete(`/backups/${started.body.id}`).set(auth(eve)).expect(200);
      expect([...files.objects.keys()].some((k) => k.includes(started.body.id))).toBe(false);
      expect((await http().get(`/backups/${started.body.id}`).set(auth(eve))).status).toBe(404);
    });
  });

  describe('status posts', () => {
    let fay: Person;
    let gus: Person;
    let hal: Person;
    let ivy: Person;

    beforeAll(async () => {
      [fay, gus, hal, ivy] = [await person('Fay'), await person('Gus'), await person('Hal'), await person('Ivy')];
      await http().post('/conversations/direct').set(auth(fay)).send({ userId: gus.id }).expect(200);
      await http().post('/conversations/direct').set(auth(fay)).send({ userId: hal.id }).expect(200);
    });

    const post = (p: Person, body: Record<string, unknown>) => http().post('/status').set(auth(p)).send(body);
    const feed = async (p: Person) => (await http().get('/status/feed').set(auth(p))).body as {
      user: { id: number };
      statuses: { id: number; viewed: boolean }[];
      allViewed: boolean;
    }[];

    it('shows a text status to contacts only, and records each view once', async () => {
      const made = await post(fay, { type: 'text', body: 'good morning', bgColor: '#1F8A70' });
      expect(made.status).toBe(201);
      expect(new Date(made.body.expiresAt).getTime()).toBeGreaterThan(Date.now() + 23 * 3600_000);

      expect((await feed(gus))[0].statuses.map((s) => s.id)).toContain(made.body.id);
      expect((await feed(ivy)).length).toBe(0);
      expect((await http().post(`/status/${made.body.id}/view`).set(auth(ivy))).status).toBe(404);

      await http().post(`/status/${made.body.id}/view`).set(auth(gus)).expect(200);
      await http().post(`/status/${made.body.id}/view`).set(auth(gus)).expect(200);
      const viewers = await http().get(`/status/${made.body.id}/viewers`).set(auth(fay));
      expect(viewers.body).toHaveLength(1);
      expect(viewers.body[0].id).toBe(gus.id);
      expect((await http().get(`/status/${made.body.id}/viewers`).set(auth(gus))).status).toBe(403);
      expect((await feed(gus))[0].allViewed).toBe(true);
      expect((await http().get('/status/mine').set(auth(fay))).body[0].viewCount).toBe(1);
    });

    it('honours "only these people" and "all contacts except"', async () => {
      const only = await post(fay, { type: 'text', body: 'just gus', privacy: 'only', audienceIds: [gus.id] });
      const except = await post(fay, { type: 'text', body: 'not gus', privacy: 'except', audienceIds: [gus.id] });
      const idsFor = async (p: Person) => (await feed(p)).flatMap((g) => g.statuses.map((s) => s.id));
      expect(await idsFor(gus)).toContain(only.body.id);
      expect(await idsFor(gus)).not.toContain(except.body.id);
      expect(await idsFor(hal)).not.toContain(only.body.id);
      expect(await idsFor(hal)).toContain(except.body.id);
      expect((await post(fay, { type: 'text', body: 'x', privacy: 'only' })).status).toBe(400);
    });

    it('posts a video through a status upload and enforces the rules', async () => {
      const upload = (body: Record<string, unknown>) => http().post('/media/uploads').set(auth(fay)).send(body);
      expect((await upload({ kind: 'voice', contentType: 'audio/mp4', size: 1000, durationMs: 1000, forStatus: true })).status).toBe(400);
      expect((await upload({ kind: 'video', contentType: 'video/mp4', size: 1000, durationMs: 1000 })).status).toBe(400);

      const long = await upload({ kind: 'video', contentType: 'video/mp4', size: 1_000_000, durationMs: 90_000, forStatus: true });
      files.finish(long.body.uploadUrl, 1_000_000);
      expect((await post(fay, { type: 'video', mediaId: long.body.mediaId })).status).toBe(400);

      const ok = await upload({ kind: 'video', contentType: 'video/mp4', size: 2_000_000, durationMs: 20_000, forStatus: true });
      expect(ok.status).toBe(200);
      expect(ok.body.uploadUrl).toContain('/status/');
      files.finish(ok.body.uploadUrl, 2_000_000);
      const made = await post(fay, { type: 'video', mediaId: ok.body.mediaId, body: 'sunset' });
      expect(made.status).toBe(201);
      expect(made.body.media.url).toContain('https://files.test/get/status/');
      expect(made.body.media).not.toHaveProperty('key');
      expect((await post(gus, { type: 'video', mediaId: ok.body.mediaId })).status).toBe(400);
    });

    it('turns a reply into a chat message to the poster', async () => {
      const made = await post(fay, { type: 'text', body: 'who is up for football?' });
      const reply = await http().post(`/status/${made.body.id}/reply`).set(auth(gus)).send({ clientId: 'sr-1', body: 'me!' });
      expect(reply.status).toBe(201);
      const chat = (await http().post('/conversations/direct').set(auth(fay)).send({ userId: gus.id })).body.id;
      const history = await http().get(`/conversations/${chat}/messages?limit=1`).set(auth(fay));
      expect(history.body.items[0].body).toContain('me!');
      expect(history.body.items[0].body).toContain('who is up for football?');
      expect((await http().post(`/status/${made.body.id}/reply`).set(auth(ivy)).send({ clientId: 'sr-2', body: 'hi' })).status).toBe(404);
    });

    it('lets only the owner delete, and removes the file', async () => {
      const up = await http().post('/media/uploads').set(auth(fay)).send({ kind: 'image', contentType: 'image/png', size: 3000, forStatus: true });
      files.finish(up.body.uploadUrl, 3000);
      const made = await post(fay, { type: 'image', mediaId: up.body.mediaId });
      expect((await http().delete(`/status/${made.body.id}`).set(auth(gus))).status).toBe(403);
      await http().delete(`/status/${made.body.id}`).set(auth(fay)).expect(200);
      expect(files.deleted.some((k) => k.startsWith('status/') && k.endsWith('.png'))).toBe(true);
      expect((await http().post(`/status/${made.body.id}/view`).set(auth(gus))).status).toBe(404);
    });

    it('hides an expired status at once and the sweep removes the row and file', async () => {
      const up = await http().post('/media/uploads').set(auth(fay)).send({ kind: 'image', contentType: 'image/jpeg', size: 4000, forStatus: true });
      files.finish(up.body.uploadUrl, 4000);
      const made = await post(fay, { type: 'image', mediaId: up.body.mediaId });
      const db = app.get<DataSource>(getDataSourceToken());
      await db.query(`UPDATE statuses SET "expiresAt" = now() - interval '10 minutes' WHERE id = $1`, [made.body.id]);

      expect((await feed(gus)).flatMap((g) => g.statuses.map((s) => s.id))).not.toContain(made.body.id);
      expect((await http().post(`/status/${made.body.id}/view`).set(auth(gus))).status).toBe(404);
      expect(await app.get(StatusService).sweep()).toBeGreaterThanOrEqual(1);
      const left = (await db.query(`SELECT 1 FROM statuses WHERE id = $1`, [made.body.id])) as unknown[];
      expect(left).toHaveLength(0);
      expect(files.deleted.some((k) => k.endsWith('.jpg'))).toBe(true);
    });
  });

  describe('wallet and payments', () => {
    const SECRET = 'sk_test_e2e_secret';
    let ada: Person;
    let bob: Person;
    let cat: Person;
    let boss: Person;
    let chatId: string;
    let firstTransferId: number;

    const balance = async (p: Person) => (await http().get('/wallet').set(auth(p))).body.balance as number;
    const sign = (raw: string) => createHmac('sha512', SECRET).update(raw).digest('hex');
    const webhook = (payload: unknown, signature?: string) => {
      const raw = JSON.stringify(payload);
      const req = http().post('/payments/webhook/paystack').set('Content-Type', 'application/json');
      if (signature !== null) req.set('x-paystack-signature', signature ?? sign(raw));
      return req.send(raw);
    };
    const charge = (reference: string, amount: number, currency = 'NGN') => ({
      event: 'charge.success',
      data: { reference, amount, currency },
    });
    const transfer = (p: Person, to: Person, amount: number, key: string, note?: string) =>
      http().post('/wallet/transfer').set(auth(p)).send({ toUserId: to.id, amount, idempotencyKey: key, note });

    beforeAll(async () => {
      [ada, bob, cat, boss] = [await person('Wuraola'), await person('Xavier'), await person('Yetunde'), await person('Zainab')];
      await app.get<DataSource>(getDataSourceToken()).query(`UPDATE users SET role = 'admin' WHERE id = $1`, [boss.id]);
      chatId = (await http().post('/conversations/direct').set(auth(ada)).send({ userId: bob.id })).body.id;
    });

    it('starts with an empty wallet and refuses a top-up below the minimum', async () => {
      const wallet = await http().get('/wallet').set(auth(ada));
      expect(wallet.body).toMatchObject({ balance: 0, currency: 'NGN', frozen: false });
      expect((await http().post('/wallet/fund').set(auth(ada)).send({ amount: 500 })).status).toBe(400);
      expect((await http().post('/wallet/fund').set(auth(ada)).send({ amount: 1.5 })).status).toBe(400);
    });

    it('credits a top-up only after a correctly signed webhook, and only once', async () => {
      const wrongAmount = await http().post('/wallet/fund').set(auth(ada)).send({ amount: 20000 });
      expect(wrongAmount.body.authorizationUrl).toContain('/checkout/');
      const fund = await http().post('/wallet/fund').set(auth(ada)).send({ amount: 500000 });
      const ref = fund.body.reference as string;

      expect((await http().get(`/wallet/fund/${ref}`).set(auth(ada))).body.status).toBe('pending');
      expect(await balance(ada)).toBe(0);

      expect((await webhook(charge(ref, 500000), 'bad-signature')).status).toBe(401);
      expect((await webhook(charge(ref, 500000), null as unknown as string)).status).toBe(401);
      expect(await balance(ada)).toBe(0);

      await webhook(charge(wrongAmount.body.reference, 1)).expect(200);
      expect(await balance(ada)).toBe(0);

      await webhook(charge(ref, 500000)).expect(200);
      await webhook(charge(ref, 500000)).expect(200);
      expect(await balance(ada)).toBe(500000);
      expect((await http().get(`/wallet/fund/${ref}`).set(auth(ada))).body.status).toBe('success');
      expect((await http().get(`/wallet/fund/${ref}`).set(auth(bob))).status).toBe(404);
    });

    it('sends money once per idempotency key and keeps both balances right', async () => {
      const sent = await transfer(ada, bob, 150000, 'k1', 'rent share');
      expect(sent.status).toBe(201);
      firstTransferId = sent.body.id;
      expect(await balance(ada)).toBe(350000);
      expect(await balance(bob)).toBe(150000);

      const retry = await transfer(ada, bob, 150000, 'k1');
      expect(retry.body.id).toBe(firstTransferId);
      expect(await balance(ada)).toBe(350000);
      expect((await transfer(ada, bob, 160000, 'k1')).status).toBe(409);
    });

    it('refuses overspending, tiny amounts, paying yourself and unknown people', async () => {
      expect((await transfer(ada, bob, 90_000_000, 'big')).status).toBe(400);
      expect((await transfer(ada, bob, 50, 'tiny')).status).toBe(400);
      expect((await transfer(ada, ada, 1000, 'self')).status).toBe(400);
      expect((await http().post('/wallet/transfer').set(auth(ada)).send({ toUserId: 999999, amount: 1000, idempotencyKey: 'ghost' })).status).toBe(404);
      expect(await balance(ada)).toBe(350000);
    });

    it('applies the daily sending limit', async () => {
      const db = app.get<DataSource>(getDataSourceToken());
      await db.query(
        `INSERT INTO wallet_transactions (reference, type, status, amount, "fromUserId", "toUserId", "completedAt")
         VALUES ('limit-probe', 'transfer', 'success', 99950000, $1, $2, now())`,
        [ada.id, cat.id],
      );
      const over = await transfer(ada, bob, 100000, 'daily-1');
      expect(over.status).toBe(400);
      expect(over.body.message).toMatch(/Daily sending limit/);
      await db.query(`DELETE FROM wallet_transactions WHERE reference = 'limit-probe'`);
      expect((await transfer(ada, bob, 5000, 'daily-2')).status).toBe(201);
    });

    it('pays inside a one-to-one chat: one payment message, safe to retry, cannot be deleted', async () => {
      const before = await balance(bob);
      const pay = await http().post(`/wallet/chats/${chatId}/pay`).set(auth(ada)).send({ amount: 20000, note: 'lunch', idempotencyKey: 'p1' });
      expect(pay.status).toBe(201);
      expect(pay.body.message.type).toBe('payment');
      expect(pay.body.message.media).toMatchObject({ kind: 'payment', amount: 20000, currency: 'NGN' });
      expect(pay.body.message.body).toContain('₦200.00');

      const again = await http().post(`/wallet/chats/${chatId}/pay`).set(auth(ada)).send({ amount: 20000, note: 'lunch', idempotencyKey: 'p1' });
      expect(again.body.message.id).toBe(pay.body.message.id);
      expect(await balance(bob)).toBe(before + 20000);

      const history = await http().get(`/conversations/${chatId}/messages?limit=20`).set(auth(bob));
      expect(history.body.items.filter((m: { type: string }) => m.type === 'payment')).toHaveLength(1);
      expect((await http().get('/conversations').set(auth(bob))).body[0].lastMessage.preview).toContain('₦200.00');
      expect((await http().delete(`/messages/${pay.body.message.id}`).set(auth(ada))).status).toBe(400);

      expect((await http().post(`/wallet/chats/${chatId}/pay`).set(auth(cat)).send({ amount: 1000, idempotencyKey: 'p2' })).status).toBe(404);
      const group = await http().post('/conversations/group').set(auth(ada)).send({ title: 'Trip', memberIds: [bob.id, cat.id] });
      expect((await http().post(`/wallet/chats/${group.body.id}/pay`).set(auth(ada)).send({ amount: 1000, idempotencyKey: 'p3' })).status).toBe(400);
    });

    it('pays someone by scanning their QR code', async () => {
      const code = (await http().get('/contacts/qr').set(auth(bob))).body.payload as string;
      const who = await http().post('/wallet/pay-qr/resolve').set(auth(ada)).send({ code });
      expect(who.body.id).toBe(bob.id);

      const before = await balance(bob);
      const paid = await http().post('/wallet/pay-qr').set(auth(ada)).send({ code, amount: 10000, idempotencyKey: 'q1' });
      expect(paid.status).toBe(201);
      expect(paid.body.payee.id).toBe(bob.id);
      expect(await balance(bob)).toBe(before + 10000);

      expect((await http().post('/wallet/pay-qr').set(auth(bob)).send({ code, amount: 1000, idempotencyKey: 'q2' })).status).toBe(400);
      expect((await http().post('/wallet/pay-qr').set(auth(ada)).send({ code: 'chatqr:nope', amount: 1000, idempotencyKey: 'q3' })).status).toBe(404);
    });

    it('lists history newest first with the other person, and pages it', async () => {
      const page = await http().get('/wallet/transactions?limit=3').set(auth(ada));
      expect(page.body.items).toHaveLength(3);
      expect(page.body.items[0].direction).toBe('out');
      expect(page.body.items[0].counterparty.username).toBeTruthy();
      expect(page.body.nextCursor).toBeTruthy();
      const next = await http().get(`/wallet/transactions?limit=3&cursor=${page.body.nextCursor}`).set(auth(ada));
      expect(next.body.items[0].id).toBeLessThan(page.body.items[2].id);
      expect((await http().get('/wallet/transactions?cursor=zzz').set(auth(ada))).status).toBe(400);
    });

    it('lets only an admin freeze a wallet, and a frozen wallet cannot send or receive', async () => {
      expect((await http().post(`/admin/wallets/${ada.id}/freeze`).set(auth(bob)).send({ reason: 'suspicious activity' })).status).toBe(403);
      expect((await http().post(`/admin/wallets/${ada.id}/freeze`).set(auth(boss)).send({ reason: 'x' })).status).toBe(400);
      await http().post(`/admin/wallets/${ada.id}/freeze`).set(auth(boss)).send({ reason: 'suspicious activity' }).expect(200);

      expect((await http().get('/wallet').set(auth(ada))).body.frozen).toBe(true);
      expect((await transfer(ada, bob, 1000, 'f1')).status).toBe(403);
      expect((await transfer(bob, ada, 1000, 'f2')).status).toBe(403);

      await http().post(`/admin/wallets/${ada.id}/unfreeze`).set(auth(boss)).send({ reason: 'checked, all fine' }).expect(200);
      expect((await transfer(ada, bob, 1000, 'f3')).status).toBe(201);
    });

    it('reverses a payment once, and not when the receiver already spent it', async () => {
      const reversal = await http().post(`/admin/wallets/transactions/${firstTransferId}/reverse`).set(auth(boss)).send({ reason: 'sent by mistake' });
      expect(reversal.status).toBe(200);
      expect(reversal.body.type).toBe('reversal');
      expect((await http().post(`/admin/wallets/transactions/${firstTransferId}/reverse`).set(auth(boss)).send({ reason: 'again please' })).status).toBe(409);
      expect((await http().post(`/admin/wallets/transactions/${firstTransferId}/reverse`).set(auth(bob)).send({ reason: 'give it back' })).status).toBe(403);

      const small = await transfer(ada, bob, 5000, 'r2');
      await transfer(bob, cat, await balance(bob), 'spend-it').expect(201);
      expect((await http().post(`/admin/wallets/transactions/${small.body.id}/reverse`).set(auth(boss)).send({ reason: 'sent by mistake' })).status).toBe(409);
      expect((await http().post('/admin/wallets/transactions/999999/reverse').set(auth(boss)).send({ reason: 'does not exist' })).status).toBe(404);
    });

    it('proves the books balance: every wallet equals its ledger, every entry pair sums to zero', async () => {
      expect((await http().get('/admin/wallets/reconcile').set(auth(bob))).status).toBe(403);
      const report = await http().get('/admin/wallets/reconcile').set(auth(boss));
      expect(report.status).toBe(200);
      expect(report.body).toMatchObject({ ok: true, walletMismatches: [], unbalancedTransactions: [] });
      expect(report.body.totals.inWallets).toBe(report.body.totals.fundedFromOutside);
    });

    it('detects a wallet that was changed behind the ledger', async () => {
      const db = app.get<DataSource>(getDataSourceToken());
      await db.query(`UPDATE wallets SET balance = balance + 1 WHERE "userId" = $1`, [cat.id]);
      const report = await http().get('/admin/wallets/reconcile').set(auth(boss));
      expect(report.body.ok).toBe(false);
      expect(report.body.walletMismatches).toHaveLength(1);
      await db.query(`UPDATE wallets SET balance = balance - 1 WHERE "userId" = $1`, [cat.id]);
      expect((await http().get('/admin/wallets/reconcile').set(auth(boss))).body.ok).toBe(true);
    });
  });

  describe('voice and video calls', () => {
    let ada: Person;
    let bob: Person;
    let cat: Person;
    let eve: Person;
    let chatId: string;

    const start = (p: Person, conversationId: string, type = 'audio') =>
      http().post('/calls').set(auth(p)).send({ conversationId, type });
    const act = (p: Person, id: string, action: string) => http().post(`/calls/${id}/${action}`).set(auth(p));
    const lastCallMessage = async (p: Person, conversationId: string) => {
      const history = await http().get(`/conversations/${conversationId}/messages?limit=10`).set(auth(p));
      return history.body.items.find((m: { type: string }) => m.type === 'call');
    };
    const until = async (check: () => Promise<boolean>) => {
      for (let i = 0; i < 40; i += 1) {
        if (await check()) return;
        await new Promise((r) => setTimeout(r, 250));
      }
      throw new Error('condition not met in time');
    };

    beforeAll(async () => {
      [ada, bob, cat, eve] = [await person('Amaka'), await person('Bayo'), await person('Chidi'), await person('Dara')];
      chatId = (await http().post('/conversations/direct').set(auth(ada)).send({ userId: bob.id })).body.id;
    });

    it('rings the other person live, connects on accept, and leaves a record with the length', async () => {
      const b = await connect(bob);
      const incoming = waitFor<{ call: { id: string; type: string }; from: { id: number } }>(b, 'call:incoming');
      const started = await start(ada, chatId, 'video');
      expect(started.status).toBe(201);
      expect(started.body.call).toMatchObject({ type: 'video', status: 'ringing', initiatorId: ada.id });
      expect(started.body.media.url).toBe('wss://livekit.fake.test');
      expect(started.body.media.token).toBe(`fake.call_${started.body.call.id}.${ada.id}`);
      const ring = await incoming;
      expect(ring.call.id).toBe(started.body.call.id);
      expect(ring.from.id).toBe(ada.id);

      const a = await connect(ada);
      const accepted = waitFor<{ userId: number }>(a, 'call:accepted');
      const answer = await act(bob, started.body.call.id, 'accept');
      expect(answer.status).toBe(200);
      expect(answer.body.call.status).toBe('active');
      expect(answer.body.media.token).toContain(`.${bob.id}`);
      expect((await accepted).userId).toBe(bob.id);
      expect((await act(bob, started.body.call.id, 'accept')).status).toBe(200);

      await new Promise((r) => setTimeout(r, 1100));
      await act(bob, started.body.call.id, 'leave').expect(200);
      const ended = await http().get(`/calls/${started.body.call.id}`).set(auth(ada));
      expect(ended.body.status).toBe('ended');
      expect(ended.body.durationSec).toBeGreaterThanOrEqual(1);
      const record = await lastCallMessage(ada, chatId);
      expect(record.body).toMatch(/^Video call · 0:0\d$/);
      expect(record.media).toMatchObject({ kind: 'call', callType: 'video', status: 'ended' });
      expect((await http().delete(`/messages/${record.id}`).set(auth(ada))).status).toBe(400);
    });

    it('does not let a stranger see, answer or end a call', async () => {
      const started = await start(ada, chatId);
      expect((await start(eve, chatId)).status).toBe(404);
      expect((await http().get(`/calls/${started.body.call.id}`).set(auth(eve))).status).toBe(404);
      expect((await act(eve, started.body.call.id, 'accept')).status).toBe(404);
      expect((await act(bob, started.body.call.id, 'end')).status).toBe(403);
      expect((await start(ada, chatId)).status).toBe(409);
      await act(ada, started.body.call.id, 'end').expect(200);
    });

    it('records a cancelled call when the caller hangs up before an answer', async () => {
      const started = await start(ada, chatId);
      await act(ada, started.body.call.id, 'leave').expect(200);
      expect((await http().get(`/calls/${started.body.call.id}`).set(auth(bob))).body.status).toBe('cancelled');
      expect((await lastCallMessage(bob, chatId)).body).toBe('Missed voice call');
      expect((await act(bob, started.body.call.id, 'accept')).status).toBe(409);
    });

    it('records a declined call', async () => {
      const started = await start(ada, chatId, 'video');
      await act(bob, started.body.call.id, 'decline').expect(200);
      expect((await http().get(`/calls/${started.body.call.id}`).set(auth(ada))).body.status).toBe('declined');
      expect((await lastCallMessage(ada, chatId)).body).toBe('Declined video call');
    });

    it('marks a call missed when nobody answers in time', async () => {
      const started = await start(ada, chatId);
      await until(async () => (await http().get(`/calls/${started.body.call.id}`).set(auth(ada))).body.status === 'missed');
      const call = await http().get(`/calls/${started.body.call.id}`).set(auth(bob));
      expect(call.body.participants.find((p: { userId: number }) => p.userId === bob.id).status).toBe('missed');
      expect((await lastCallMessage(bob, chatId)).body).toBe('Missed voice call');
      expect((await act(bob, started.body.call.id, 'accept')).status).toBe(409);
    });

    it('runs a group call: people join one by one and it ends when the last one leaves', async () => {
      const group = (await http().post('/conversations/group').set(auth(ada)).send({ title: 'Standup', memberIds: [bob.id, cat.id] })).body.id;
      const started = await start(ada, group, 'audio');
      const id = started.body.call.id as string;
      expect(started.body.call.participants).toHaveLength(3);

      await act(cat, id, 'decline').expect(200);
      expect((await http().get(`/calls/${id}`).set(auth(ada))).body.status).toBe('ringing');
      await act(bob, id, 'accept').expect(200);
      expect((await http().get(`/calls/${id}`).set(auth(ada))).body.status).toBe('active');

      await act(ada, id, 'leave').expect(200);
      expect((await http().get(`/calls/${id}`).set(auth(bob))).body.status).toBe('active');
      await act(bob, id, 'leave').expect(200);
      expect((await http().get(`/calls/${id}`).set(auth(bob))).body.status).toBe('ended');
      expect((await lastCallMessage(cat, group)).body).toMatch(/^Voice call/);
    });

    it('lists call history newest first with direction, and pages it', async () => {
      const page = await http().get('/calls?limit=2').set(auth(ada));
      expect(page.body.items).toHaveLength(2);
      expect(page.body.items[0].direction).toBe('outgoing');
      expect(page.body.nextCursor).toBeTruthy();
      const next = await http().get(`/calls?limit=2&cursor=${page.body.nextCursor}`).set(auth(ada));
      expect(next.body.items[0].createdAt <= page.body.items[1].createdAt).toBe(true);
      expect((await http().get('/calls?cursor=zzz').set(auth(ada))).status).toBe(400);
      expect((await http().get('/calls').set(auth(eve))).body.items).toEqual([]);
    });
  });

  describe('blocking', () => {
    let ada: Person;
    let bob: Person;
    let cat: Person;
    let chatId: string;

    beforeAll(async () => {
      [ada, bob, cat] = [await person('Efe'), await person('Femi'), await person('Gbenga')];
      chatId = (await http().post('/conversations/direct').set(auth(ada)).send({ userId: bob.id })).body.id;
      await http().post(`/conversations/${chatId}/messages`).set(auth(bob)).send({ clientId: 'bl-1', body: 'hi' }).expect(201);
    });

    it('stops messages, new chats, calls, payments, QR scans, search and statuses in both directions', async () => {
      const status = await http().post('/status').set(auth(ada)).send({ type: 'text', body: 'my status' });
      expect((await http().get('/status/feed').set(auth(bob))).body).toHaveLength(1);
      const qr = (await http().get('/contacts/qr').set(auth(ada))).body.payload as string;
      expect((await http().get('/people?q=efe').set(auth(bob))).body.length).toBeGreaterThan(0);

      expect((await http().post('/blocks').set(auth(ada)).send({ userId: ada.id })).status).toBe(400);
      expect((await http().post('/blocks').set(auth(ada)).send({ userId: 999999 })).status).toBe(404);
      await http().post('/blocks').set(auth(ada)).send({ userId: bob.id }).expect(200);
      await http().post('/blocks').set(auth(ada)).send({ userId: bob.id }).expect(200);

      const send = (p: Person, id: string) =>
        http().post(`/conversations/${chatId}/messages`).set(auth(p)).send({ clientId: id, body: 'hello?' });
      expect((await send(bob, 'bl-2')).status).toBe(403);
      expect((await send(ada, 'bl-3')).status).toBe(403);
      expect((await http().post('/conversations/direct').set(auth(bob)).send({ userId: ada.id })).status).toBe(403);
      expect((await http().post('/calls').set(auth(bob)).send({ conversationId: chatId, type: 'audio' })).status).toBe(403);
      expect((await http().post('/wallet/transfer').set(auth(bob)).send({ toUserId: ada.id, amount: 1000, idempotencyKey: 'bl-pay' })).status).toBe(403);
      expect((await http().post('/contacts/scan').set(auth(bob)).send({ code: qr })).status).toBe(404);
      expect((await http().get('/people?q=efe').set(auth(bob))).body).toEqual([]);
      expect((await http().get('/people?q=femi').set(auth(ada))).body).toEqual([]);
      expect((await http().get('/status/feed').set(auth(bob))).body).toEqual([]);
      expect((await http().post(`/status/${status.body.id}/view`).set(auth(bob))).status).toBe(404);
    });

    it('shows only the people you blocked, never who blocked you', async () => {
      expect((await http().get('/blocks').set(auth(ada))).body.map((u: { id: number }) => u.id)).toEqual([bob.id]);
      expect((await http().get('/blocks').set(auth(bob))).body).toEqual([]);
    });

    it('leaves a group you both belong to alone', async () => {
      const group = (await http().post('/conversations/group').set(auth(cat)).send({ title: 'Mixed', memberIds: [ada.id, bob.id] })).body.id;
      const sent = await http().post(`/conversations/${group}/messages`).set(auth(bob)).send({ clientId: 'bl-g', body: 'group hello' });
      expect(sent.status).toBe(201);
    });

    it('lets messages flow again after unblocking', async () => {
      await http().delete(`/blocks/${bob.id}`).set(auth(ada)).expect(200);
      expect((await http().post(`/conversations/${chatId}/messages`).set(auth(bob)).send({ clientId: 'bl-4', body: 'back' })).status).toBe(201);
      expect((await http().get('/blocks').set(auth(ada))).body).toEqual([]);
    });
  });

  describe('reports and moderation', () => {
    let ada: Person;
    let bob: Person;
    let cat: Person;
    let eve: Person;
    let mgr: Person;
    let boss: Person;
    let sup: Person;
    let groupId: string;
    let badMessageId: number;
    let reportId: number;

    const report = (p: Person, body: Record<string, unknown>) => http().post('/reports').set(auth(p)).send(body);

    beforeAll(async () => {
      [ada, bob, cat, eve] = [await person('Hauwa'), await person('Ife'), await person('Jide'), await person('Kelechi')];
      [mgr, boss, sup] = [await person('Mgr'), await person('Boss'), await person('Sup')];
      const db = app.get<DataSource>(getDataSourceToken());
      await db.query(`UPDATE users SET role = 'manager' WHERE id = $1`, [mgr.id]);
      await db.query(`UPDATE users SET role = 'admin' WHERE id = $1`, [boss.id]);
      await db.query(`UPDATE users SET role = 'superadmin' WHERE id = $1`, [sup.id]);
      groupId = (await http().post('/conversations/group').set(auth(ada)).send({ title: 'Chat', memberIds: [bob.id, cat.id] })).body.id;
      await http().post(`/conversations/${groupId}/messages`).set(auth(cat)).send({ clientId: 'rp-0', body: 'earlier line' });
      badMessageId = (await http().post(`/conversations/${groupId}/messages`).set(auth(bob)).send({ clientId: 'rp-1', body: 'abusive words here' })).body.id;
    });

    it('needs a real reason, a target the reporter can see, and not yourself', async () => {
      const base = { targetType: 'message', targetId: badMessageId, category: 'abuse' };
      expect((await report(ada, { ...base, reason: 'bad' })).status).toBe(400);
      expect((await report(ada, { ...base, category: 'nonsense', reason: 'this is abusive to me' })).status).toBe(400);
      expect((await report(eve, { ...base, reason: 'I was not even in that chat' })).status).toBe(404);
      expect((await report(bob, { ...base, reason: 'reporting my own message' })).status).toBe(400);
      expect((await report(ada, { targetType: 'user', targetId: 999999, category: 'spam', reason: 'does not exist at all' })).status).toBe(404);
    });

    it('files a report once, and a second reporter adds another', async () => {
      const made = await report(ada, { targetType: 'message', targetId: badMessageId, category: 'abuse', reason: 'He insulted me in the group chat' });
      expect(made.status).toBe(201);
      expect(made.body.status).toBe('open');
      reportId = made.body.id;
      expect((await report(ada, { targetType: 'message', targetId: badMessageId, category: 'abuse', reason: 'sending it a second time' })).status).toBe(409);
      expect((await report(cat, { targetType: 'message', targetId: badMessageId, category: 'harassment', reason: 'He does this to everyone' })).status).toBe(201);
      expect((await http().get('/reports/mine').set(auth(ada))).body).toHaveLength(1);
    });

    it('keeps the queue and the evidence for staff only, and logs who opened private chat content', async () => {
      expect((await http().get('/reports').set(auth(ada))).status).toBe(403);
      expect((await http().get(`/reports/${reportId}`).set(auth(ada))).status).toBe(403);
      const list = await http().get('/reports?status=open').set(auth(mgr));
      expect(list.status).toBe(200);
      const row = list.body.items.find((r: { id: number }) => r.id === reportId);
      expect(row.reportsOnTarget).toBe(2);
      expect(row.accusedUsername).toBeTruthy();

      const detail = await http().get(`/reports/${reportId}`).set(auth(mgr));
      expect(detail.body.evidence.message.body).toBe('abusive words here');
      expect(detail.body.evidence.before.map((m: { body: string }) => m.body)).toContain('earlier line');
      const db = app.get<DataSource>(getDataSourceToken());
      const logged = (await db.query(`SELECT 1 FROM audit_logs WHERE action = 'user.view_messages' AND "actorId" = $1`, [mgr.id])) as unknown[];
      expect(logged.length).toBeGreaterThan(0);
      expect((await http().get('/reports').set(auth(sup))).status).toBe(200);
    });

    it('lets a manager check the evidence but only an admin decide', async () => {
      expect((await http().patch(`/reports/${reportId}/verify`).set(auth(mgr)).send({ valid: true })).status).toBe(400);
      const verified = await http().patch(`/reports/${reportId}/verify`).set(auth(mgr)).send({ valid: true, note: 'Clear insult in the message' });
      expect(verified.status).toBe(200);
      expect(verified.body.status).toBe('reviewed');
      expect((await http().patch(`/reports/${reportId}/verify`).set(auth(ada)).send({ valid: true, note: 'trying it' })).status).toBe(403);

      const decide = (p: Person, body: Record<string, unknown>) => http().patch(`/reports/${reportId}/decide`).set(auth(p)).send(body);
      expect((await decide(mgr, { decision: 'remove_content', reason: 'violates the rules' })).status).toBe(403);
      expect((await decide(sup, { decision: 'remove_content', reason: 'violates the rules' })).status).toBe(403);
      expect((await decide(boss, { decision: 'remove_content', reason: 'x' })).status).toBe(400);
    });

    it('removes the message, closes every report on it, tells the reporters and audits it', async () => {
      const done = await http().patch(`/reports/${reportId}/decide`).set(auth(boss)).send({ decision: 'remove_content', reason: 'Abusive language breaks the rules' });
      expect(done.status).toBe(200);
      expect(done.body.status).toBe('actioned');

      const history = await http().get(`/conversations/${groupId}/messages?limit=10`).set(auth(cat));
      const gone = history.body.items.find((m: { id: number }) => m.id === badMessageId);
      expect(gone.deleted).toBe(true);
      expect(gone.body).toBeNull();

      for (const p of [ada, cat]) {
        const mine = await http().get('/reports/mine').set(auth(p));
        expect(mine.body[0].status).toBe('actioned');
        expect(mine.body[0].decisionReason).toContain('Abusive language');
      }
      const db = app.get<DataSource>(getDataSourceToken());
      const logged = (await db.query(`SELECT 1 FROM audit_logs WHERE action = 'report.decide' AND "actorId" = $1`, [boss.id])) as unknown[];
      expect(logged).toHaveLength(1);
      expect((await http().patch(`/reports/${reportId}/decide`).set(auth(boss)).send({ decision: 'dismiss', reason: 'second thoughts' })).status).toBe(409);
    });

    it('suspends a user: their token stops working at once and they cannot sign in', async () => {
      const made = await report(ada, { targetType: 'user', targetId: bob.id, category: 'harassment', reason: 'He keeps messaging me after I asked him to stop' });
      expect((await http().patch(`/reports/${made.body.id}/decide`).set(auth(boss)).send({ decision: 'remove_content', reason: 'a person is not content' })).status).toBe(400);
      const socket = await connect(bob);
      const closed = new Promise((resolve) => socket.on('disconnect', resolve));
      expect((await http().patch(`/reports/${made.body.id}/decide`).set(auth(boss)).send({ decision: 'suspend_user', reason: 'Repeated harassment' })).status).toBe(200);
      await closed;
      expect((await http().get('/auth/me').set(auth(bob))).status).toBe(401);
    });

    it('dismisses a report and refuses to suspend someone who outranks the admin', async () => {
      const dismissed = await report(cat, { targetType: 'user', targetId: ada.id, category: 'spam', reason: 'I think this account is spam' });
      const out = await http().patch(`/reports/${dismissed.body.id}/decide`).set(auth(boss)).send({ decision: 'dismiss', reason: 'No evidence of spam' });
      expect(out.body.status).toBe('dismissed');
      expect((await http().get('/auth/me').set(auth(ada))).status).toBe(200);

      const high = await report(cat, { targetType: 'user', targetId: sup.id, category: 'other', reason: 'testing the limits of the rules' });
      expect((await http().patch(`/reports/${high.body.id}/decide`).set(auth(boss)).send({ decision: 'suspend_user', reason: 'cannot do this' })).status).toBe(403);
      expect((await http().get('/auth/me').set(auth(sup))).status).toBe(200);
      expect((await http().get(`/reports/${high.body.id}`).set(auth(boss))).body.status).toBe('open');
    });

    it('reports a status and removes it', async () => {
      await http().post('/conversations/direct').set(auth(cat)).send({ userId: ada.id });
      const status = await http().post('/status').set(auth(ada)).send({ type: 'text', body: 'nasty post' });
      const made = await report(cat, { targetType: 'status', targetId: status.body.id, category: 'scam', reason: 'This status tries to scam people' });
      expect(made.status).toBe(201);
      await http().patch(`/reports/${made.body.id}/decide`).set(auth(boss)).send({ decision: 'remove_content', reason: 'Scam content' }).expect(200);
      expect((await http().get('/status/feed').set(auth(cat))).body).toEqual([]);
    });
  });

  describe('dashboards and reports', () => {
    let ada: Person;
    let bob: Person;
    let mgr: Person;
    let boss: Person;
    let sup: Person;

    beforeAll(async () => {
      [ada, bob] = [await person('Lola'), await person('Mide')];
      [mgr, boss, sup] = [await person('Mgr2'), await person('Boss2'), await person('Sup2')];
      const db = app.get<DataSource>(getDataSourceToken());
      await db.query(`UPDATE users SET role = 'manager' WHERE id = $1`, [mgr.id]);
      await db.query(`UPDATE users SET role = 'admin' WHERE id = $1`, [boss.id]);
      await db.query(`UPDATE users SET role = 'superadmin' WHERE id = $1`, [sup.id]);
      const chat = await http().post('/conversations/direct').set(auth(ada)).send({ userId: bob.id });
      await http().post(`/conversations/${chat.body.id}/messages`).set(auth(ada)).send({ clientId: 'dash-1', body: 'hello there' });
    });

    it('keeps each dashboard to the people allowed to see it', async () => {
      expect((await http().get('/dashboard/manager').set(auth(ada))).status).toBe(403);
      expect((await http().get('/dashboard/manager').set(auth(mgr))).status).toBe(200);
      expect((await http().get('/dashboard/admin').set(auth(mgr))).status).toBe(403);
      expect((await http().get('/dashboard/admin').set(auth(boss))).status).toBe(200);
      expect((await http().get('/dashboard/superadmin').set(auth(boss))).status).toBe(403);
      expect((await http().get('/dashboard/superadmin').set(auth(sup))).status).toBe(200);
    });

    it('shows a manager the work queue and nothing about money', async () => {
      const res = await http().get('/dashboard/manager').set(auth(mgr));
      expect(res.body.people.total).toBeGreaterThan(0);
      expect(res.body.moderation).toHaveProperty('open');
      expect(res.body).not.toHaveProperty('money');
      expect(res.body).not.toHaveProperty('messaging');
    });

    it('shows an admin messaging and money figures', async () => {
      const res = await http().get('/dashboard/admin').set(auth(boss));
      expect(res.body.messaging.today).toBeGreaterThanOrEqual(1);
      expect(res.body.money.currency).toBe('NGN');
      expect(typeof res.body.money.inWalletsKobo).toBe('number');
      expect(res.body.accounts.byRole.superadmin).toBeGreaterThanOrEqual(1);
    });

    it('shows the superadmin who has no second factor', async () => {
      const res = await http().get('/dashboard/superadmin').set(auth(sup));
      expect(res.body.staffWithoutTwoFactor.length).toBeGreaterThanOrEqual(3);
      expect(Array.isArray(res.body.activity.recent)).toBe(true);
    });

    it('limits staff activity to the people below the caller, and exports CSV', async () => {
      const forManager = await http().get('/analytics/staff-activity').set(auth(mgr));
      expect(forManager.body.staff.map((s: { id: number }) => s.id)).toEqual([mgr.id]);
      const forAdmin = await http().get('/analytics/staff-activity').set(auth(boss));
      const ids = forAdmin.body.staff.map((s: { id: number }) => s.id);
      expect(ids).toContain(boss.id);
      expect(ids).toContain(mgr.id);
      expect(ids).not.toContain(sup.id);
      const csv = await http().get('/analytics/staff-activity?format=csv').set(auth(sup));
      expect(csv.headers['content-type']).toContain('text/csv');
      expect(csv.text.split('\n')[0]).toContain('twoFactorEnabled');
      expect((await http().get('/analytics/staff-activity').set(auth(ada))).status).toBe(403);
    });

    it('reports usage per day, admins only, and refuses a bad period', async () => {
      expect((await http().get('/analytics/usage').set(auth(mgr))).status).toBe(403);
      const res = await http().get('/analytics/usage').set(auth(boss));
      expect(res.body.totals.messages).toBeGreaterThanOrEqual(1);
      expect(res.body.byDay.length).toBeGreaterThan(0);
      expect((await http().get('/analytics/usage?format=csv').set(auth(boss))).text).toContain('day,newUsers');
      expect((await http().get('/analytics/usage?from=2026-05-01&to=2026-01-01').set(auth(boss))).status).toBe(400);
      expect((await http().get('/analytics/usage?from=2020-01-01&to=2026-01-01').set(auth(boss))).status).toBe(400);
    });

    it('lets only a superadmin send the weekly digest, and records it', async () => {
      expect((await http().post('/analytics/digest/send').set(auth(boss))).status).toBe(403);
      const res = await http().post('/analytics/digest/send').set(auth(sup));
      expect(res.status).toBe(201);
      expect(res.body.recipients).toBeGreaterThanOrEqual(1);
    });
  });
});
