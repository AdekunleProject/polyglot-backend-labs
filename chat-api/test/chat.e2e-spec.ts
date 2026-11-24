/**
 * Chat integration test: REST and live sockets against a real PostgreSQL.
 * See app.e2e-spec.ts for how to run a throwaway database.
 */
import { Test } from '@nestjs/testing';
import { INestApplication } from '@nestjs/common';
import { getDataSourceToken } from '@nestjs/typeorm';
import { DataSource } from 'typeorm';
import request from 'supertest';
import { io, Socket } from 'socket.io-client';
import { AppModule } from '../src/app.module';
import { configureApp } from '../src/app.setup';
import { FileUpload } from '../src/aws/aws.file-upload';
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
  deleted: string[] = [];
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
    app = moduleRef.createNestApplication();
    configureApp(app);
    await app.init();
    await app.listen(0);
    port = (app.getHttpServer().address() as { port: number }).port;
    await app
      .get<DataSource>(getDataSourceToken())
      .query(
        'TRUNCATE TABLE phone_codes, device_links, media_uploads, messages, conversation_members, conversations, devices, audit_logs, recovery_codes, mail_tokens, sessions, users RESTART IDENTITY CASCADE',
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
});
