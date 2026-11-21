/**
 * Integration test for sign-up, verification, sign-in, password reset,
 * two-factor sign-in and admin-created accounts, against a real MongoDB.
 * Only the mail server is faked (it records messages instead of sending).
 * Needs the same throwaway MongoDB as checkout.e2e-spec.ts (see there).
 */
import { Test } from '@nestjs/testing';
import { INestApplication, ValidationPipe } from '@nestjs/common';
import { getModelToken } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import request from 'supertest';
import * as bcrypt from 'bcryptjs';

import { AppModule } from '../src/app.module';
import { HttpExceptionFilter } from '../src/common/filters/http-exception.filters';
import { MailService } from '../src/helpers/mail/mail-service';
import { User } from '../src/users/schemas/user.schema';
import { Role } from '../src/common/enums/role.enum';
import {
  base32Decode,
  hotp,
  timeStep,
} from '../src/auth/two-factor/totp';

const PASSWORD = 'Passw0rd-e2e!';

class FakeMail {
  sent: { to: string; subject: string; text: string }[] = [];
  // Set to true to behave like a mail server that is down.
  failing = false;
  sendEmail = async (to: string, subject: string, text: string) => {
    if (this.failing) return false;
    this.sent.push({ to, subject, text });
    return true;
  };
  lastCode(to: string): string {
    const message = [...this.sent].reverse().find((m) => m.to === to);
    const match = /code is ([A-Z0-9]{6})/.exec(message?.text ?? '');
    if (!match) throw new Error(`No code was mailed to ${to}`);
    return match[1];
  }
  lastPassword(to: string): string {
    const message = [...this.sent].reverse().find((m) => m.to === to);
    const match = /Temporary password: (\S+)/.exec(message?.text ?? '');
    if (!match) throw new Error(`No password was mailed to ${to}`);
    return match[1];
  }
}

describe('Authentication (integration)', () => {
  let app: INestApplication;
  let userModel: Model<User>;
  const mail = new FakeMail();
  let counter = 0;

  const http = () => request(app.getHttpServer());
  const bearer = (token: string) => ({ Authorization: `Bearer ${token}` });
  const nextEmail = (label: string) => {
    counter += 1;
    return `${label}-${counter}-${Date.now()}@e2e.test`;
  };

  const signupBody = (email: string) => ({
    firstname: 'Ada',
    lastname: 'Okafor',
    email,
    password: PASSWORD,
    address: '1 Test Street',
    phoneNumber: '08000000000',
    dateOfBirth: '1995-01-01',
    gender: 'female',
  });

  const login = (email: string, password = PASSWORD) =>
    http().post('/auth/login').send({ email, password });

  // Signs up, verifies with the mailed code and signs in.
  async function newCustomer(label = 'customer') {
    const email = nextEmail(label);
    expect((await http().post('/auth/signup').send(signupBody(email))).status).toBe(201);
    const verified = await http()
      .post('/auth/verify-email')
      .send({ email, code: mail.lastCode(email) });
    expect(verified.status).toBe(201);
    const res = await login(email);
    expect(res.status).toBe(201);
    return { email, accessToken: res.body.accessToken as string };
  }

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({ imports: [AppModule] })
      .overrideProvider(MailService)
      .useValue(mail)
      .compile();
    app = moduleRef.createNestApplication({ rawBody: true });
    app.useGlobalPipes(
      new ValidationPipe({
        whitelist: true,
        forbidNonWhitelisted: true,
        transform: true,
        transformOptions: { enableImplicitConversion: true },
      }),
    );
    app.useGlobalFilters(new HttpExceptionFilter());
    await app.init();
    userModel = app.get<Model<User>>(getModelToken(User.name));
  });

  afterAll(async () => {
    await app?.close();
  });

  describe('sign-up and verification', () => {
    it('does not let an unverified account in, then lets it in once the code is used', async () => {
      const email = nextEmail('verify');
      const signup = await http().post('/auth/signup').send(signupBody(email));
      expect(signup.status).toBe(201);
      expect(signup.body.customer.password).toBeUndefined();

      expect((await login(email)).status).toBe(401);
      const wrong = await http().post('/auth/verify-email').send({ email, code: 'AAAAAA' });
      expect(wrong.status).toBe(400);

      const code = mail.lastCode(email);
      expect(
        (await http().post('/auth/verify-email').send({ email, code })).status,
      ).toBe(201);
      // A code works once.
      expect(
        (await http().post('/auth/verify-email').send({ email, code })).status,
      ).toBe(400);
      expect((await login(email)).status).toBe(201);
    });

    it('stores the code as a hash, not as text', async () => {
      const email = nextEmail('hash');
      await http().post('/auth/signup').send(signupBody(email));
      const code = mail.lastCode(email);
      const stored = await userModel.db.collection('mailtokens').find({}).toArray();
      expect(JSON.stringify(stored)).not.toContain(code);
    });

    it('sends a new code on request and the old one stops working', async () => {
      const email = nextEmail('resend');
      await http().post('/auth/signup').send(signupBody(email));
      const first = mail.lastCode(email);
      const resend = await http().post('/auth/resend-verification').send({ email });
      expect(resend.status).toBe(201);
      const second = mail.lastCode(email);
      if (second !== first) {
        expect((await http().post('/auth/verify-email').send({ email, code: first })).status).toBe(400);
      }
      expect((await http().post('/auth/verify-email').send({ email, code: second })).status).toBe(201);
    });

    it('answers a resend for an unknown address exactly like a real one', async () => {
      const real = await http().post('/auth/resend-verification').send({ email: (await newCustomer()).email });
      const unknown = await http().post('/auth/resend-verification').send({ email: nextEmail('nobody') });
      expect(unknown.status).toBe(real.status);
      expect(unknown.body.message).toBe(real.body.message);
    });
  });

  describe('sign-in', () => {
    it('gives the same answer for a wrong password and an unknown email', async () => {
      const { email } = await newCustomer();
      const wrongPassword = await login(email, 'Wrong-Passw0rd!');
      const unknown = await login(nextEmail('nobody'));
      expect(wrongPassword.status).toBe(401);
      expect(unknown.status).toBe(401);
      expect(unknown.body.message).toBe(wrongPassword.body.message);
    });

    it('does not crash on an account that only has Google sign-in', async () => {
      const email = nextEmail('google');
      await userModel.collection.insertOne({
        firstname: 'G',
        lastname: 'User',
        email,
        provider: 'google',
        isVerified: true,
        role: Role.CUSTOMER,
      });
      expect((await login(email)).status).toBe(401);
    });
  });

  describe('password reset', () => {
    // Step 2 then step 3. The cookie from step 2 is what step 3 needs.
    const startReset = async (email: string) => {
      await http().post('/auth/forgot-password').send({ email });
      return mail.lastCode(email);
    };
    const cookieOf = (res: request.Response) =>
      ((res.headers['set-cookie'] as unknown as string[]) ?? [])
        .map((c) => c.split(';')[0])
        .find((c) => c.startsWith('password_reset='));

    it('checks the code, sets a cookie, resets once, and signs in with the new password', async () => {
      const { email } = await newCustomer();
      const code = await startReset(email);
      const newPassword = 'Brand-New-Passw0rd!';

      const verified = await http().post('/auth/verify-password').send({ email, code });
      expect(verified.status).toBe(200);
      expect(verified.body.resetToken).toBeUndefined();
      const cookie = cookieOf(verified)!;
      expect(cookie).toBeDefined();
      expect(String(verified.headers['set-cookie'])).toMatch(/HttpOnly/i);

      const typo = await http()
        .post('/auth/reset-password')
        .set('Cookie', cookie)
        .send({ newPassword, confirmPassword: 'Different-Passw0rd!' });
      expect(typo.status).toBe(400);

      const done = await http()
        .post('/auth/reset-password')
        .set('Cookie', cookie)
        .send({ newPassword, confirmPassword: newPassword });
      expect(done.status).toBe(200);

      const again = await http()
        .post('/auth/reset-password')
        .set('Cookie', cookie)
        .send({ newPassword: 'Another-Passw0rd!', confirmPassword: 'Another-Passw0rd!' });
      expect(again.status).toBe(401);

      expect((await login(email)).status).toBe(401);
      expect((await login(email, newPassword)).status).toBe(201);
    });

    it('rejects a reset without the cookie, and a code used for another email', async () => {
      const a = await newCustomer();
      const b = await newCustomer();
      const code = await startReset(a.email);
      const none = await http()
        .post('/auth/reset-password')
        .send({ newPassword: 'Brand-New-Passw0rd!', confirmPassword: 'Brand-New-Passw0rd!' });
      expect(none.status).toBe(401);
      const wrongEmail = await http()
        .post('/auth/verify-password')
        .send({ email: b.email, code });
      expect(wrongEmail.status).toBe(400);
    });

    it('does not accept an email-verification code as a reset code, or the reverse', async () => {
      const email = nextEmail('purpose');
      await http().post('/auth/signup').send(signupBody(email));
      const verifyCode = mail.lastCode(email);
      const reset = await http()
        .post('/auth/verify-password')
        .send({ email, code: verifyCode });
      expect(reset.status).toBe(400);

      await http().post('/auth/forgot-password').send({ email });
      const resetCode = mail.lastCode(email);
      expect(
        (await http().post('/auth/verify-email').send({ email, code: resetCode })).status,
      ).toBe(400);
    });

    it('answers forgot-password the same for unknown addresses', async () => {
      const real = await http().post('/auth/forgot-password').send({ email: (await newCustomer()).email });
      const unknown = await http().post('/auth/forgot-password').send({ email: nextEmail('nobody') });
      expect(unknown.status).toBe(real.status);
      expect(unknown.body).toEqual(real.body);
    });
  });

  describe('admin-created accounts', () => {
    async function adminToken() {
      const email = nextEmail('admin');
      await userModel.create({
        firstname: 'Root',
        lastname: 'Admin',
        email,
        password: await bcrypt.hash(PASSWORD, 4),
        role: Role.ADMIN,
        isVerified: true,
        isActive: true,
      });
      return (await login(email)).body.accessToken as string;
    }

    it('emails the temporary password and keeps it out of the response', async () => {
      const token = await adminToken();
      const email = nextEmail('made');
      const created = await http()
        .post('/users/create-admin-profile')
        .set(bearer(token))
        .send({ firstname: 'New', lastname: 'Hire', email, role: Role.CUSTOMER });
      expect(created.status).toBe(201);
      expect(created.body.defaultPassword).toBeUndefined();
      const password = mail.lastPassword(email);
      expect((await login(email, password)).status).toBe(201);
    });

    it('shows the password once only when mail is down outside production', async () => {
      const token = await adminToken();
      mail.failing = true;
      try {
        const created = await http()
          .post('/users/create-admin-profile')
          .set(bearer(token))
          .send({ firstname: 'No', lastname: 'Mail', email: nextEmail('nomail'), role: Role.CUSTOMER });
        expect(created.status).toBe(201);
        expect(created.body.defaultPassword).toBeTruthy();
      } finally {
        mail.failing = false;
      }
    });

    it('is for admins only', async () => {
      const { accessToken } = await newCustomer();
      const res = await http()
        .post('/users/create-admin-profile')
        .set(bearer(accessToken))
        .send({ firstname: 'X', lastname: 'Y', email: nextEmail('nope'), role: Role.ADMIN });
      expect(res.status).toBe(403);
    });
  });

  describe('two-factor authentication', () => {
    // Codes must be newer than the last one accepted, so each step of a test
    // uses a later time step: enable on now-1, sign in on now, disable on now+1.
    const totp = (secret: string, offset: number) =>
      hotp(base32Decode(secret), timeStep() + offset);

    it('walks through setup, sign-in with a code, a backup code, and turning it off', async () => {
      const { email, accessToken } = await newCustomer('twofactor');

      const setup = await http().post('/auth/2fa/setup').set(bearer(accessToken));
      expect(setup.status).toBe(200);
      const secret = setup.body.secret as string;
      expect(setup.body.otpauthUrl).toContain(`secret=${secret}`);

      // Not on yet: signing in still works with the password alone.
      expect((await login(email)).body.accessToken).toBeTruthy();

      const wrong = await http().post('/auth/2fa/enable').set(bearer(accessToken)).send({ code: '000000' });
      expect(wrong.status).toBe(400);

      const enabled = await http()
        .post('/auth/2fa/enable')
        .set(bearer(accessToken))
        .send({ code: totp(secret, -1) });
      expect(enabled.status).toBe(200);
      const recoveryCodes = enabled.body.recoveryCodes as string[];
      expect(recoveryCodes).toHaveLength(8);
      expect((await http().post('/auth/2fa/setup').set(bearer(accessToken))).status).toBe(409);

      // The secret is encrypted and backup codes are hashed in the database.
      const stored = await userModel.db.collection('users').findOne({ email });
      expect(stored?.twoFactorSecret).toBeTruthy();
      expect(stored?.twoFactorSecret).not.toContain(secret);
      expect(JSON.stringify(stored?.recoveryCodes)).not.toContain(recoveryCodes[0]);

      // Password alone no longer gives tokens.
      const step1 = await login(email);
      expect(step1.status).toBe(201);
      expect(step1.body.twoFactorRequired).toBe(true);
      expect(step1.body.accessToken).toBeUndefined();
      const challengeToken = step1.body.challengeToken as string;
      // A challenge is not an access token.
      expect((await http().get('/auth/me').set(bearer(challengeToken))).status).toBe(401);

      const second = (code: string, who = email) =>
        http().post('/auth/2fa/login').send({ email: who, challengeToken, code });
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
      const again = await login(email);
      const viaBackup = await http()
        .post('/auth/2fa/login')
        .send({ email, challengeToken: again.body.challengeToken, code: recoveryCodes[0].toLowerCase() });
      expect(viaBackup.status).toBe(200);
      const reuse = await login(email);
      const reused = await http()
        .post('/auth/2fa/login')
        .send({ email, challengeToken: reuse.body.challengeToken, code: recoveryCodes[0] });
      expect(reused.status).toBe(401);

      // Turning it off needs the password and a current code.
      const disableBody = (password: string) => ({ password, code: totp(secret, 1) });
      expect(
        (await http().post('/auth/2fa/disable').set(bearer(accessToken)).send(disableBody('Wrong-Passw0rd!'))).status,
      ).toBe(401);
      expect(
        (await http().post('/auth/2fa/disable').set(bearer(accessToken)).send(disableBody(PASSWORD))).status,
      ).toBe(200);
      const plain = await login(email);
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
});
