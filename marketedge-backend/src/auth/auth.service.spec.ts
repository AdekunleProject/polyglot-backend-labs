import { BadRequestException, ConflictException, UnauthorizedException } from '@nestjs/common';
import * as bcrypt from 'bcrypt';
import {
  AuthService,
  LOCK_MINUTES,
  MAX_LOGIN_ATTEMPTS,
  MAX_OTP_ATTEMPTS,
  RECOVERY_MESSAGE,
} from './auth.service';
import { Role } from './roles.enum';

function setup() {
  const userModel = {
    findOne: vi.fn(),
    findById: vi.fn(),
    create: vi.fn(),
    updateOne: vi.fn().mockResolvedValue({}),
  };
  const jwt = {
    sign: vi.fn((payload: { type: string }, _options?: { expiresIn: string }) => `jwt:${payload.type}`),
    verifyAsync: vi.fn(),
  };
  const email = { sendVerificationEmail: vi.fn(), sendPasswordResetEmail: vi.fn() };
  const social = { verifyGoogle: vi.fn(), verifyApple: vi.fn() };
  const service = new AuthService(userModel as any, jwt as any, email as any, social as any);
  return { service, userModel, jwt, email, social };
}

async function userDoc(overrides: Record<string, unknown> = {}) {
  return {
    _id: 'u1',
    username: 'ada',
    email: 'ada@example.com',
    passwordHash: await bcrypt.hash('correct-password', 4),
    role: Role.CUSTOMER,
    isVerified: true,
    failedLoginAttempts: 0,
    ...overrides,
  };
}

describe('AuthService.registerLocal', () => {
  it('stores a lower-cased email and hashes both the password and the code', async () => {
    const { service, userModel, email } = setup();
    userModel.findOne.mockResolvedValue(null);
    userModel.create.mockImplementation(async (doc: Record<string, unknown>) => ({ ...doc, _id: 'u1' }));

    await service.registerLocal({ username: ' ada ', email: ' Ada@Example.COM ', password: 'password123' });

    const saved = userModel.create.mock.calls[0][0];
    expect(saved.email).toBe('ada@example.com');
    expect(saved.username).toBe('ada');
    expect(saved.role).toBe(Role.CUSTOMER);
    expect(saved.isVerified).toBe(false);
    expect(saved.passwordHash).not.toBe('password123');

    const queuedEmail = email.sendVerificationEmail.mock.calls[0][0];
    expect(queuedEmail.email).toBe('ada@example.com');
    expect(await bcrypt.compare(queuedEmail.otp, saved.verifyOtpCode)).toBe(true);
  });

  it('refuses a duplicate username or email', async () => {
    const { service, userModel } = setup();
    userModel.findOne.mockResolvedValue(await userDoc());
    await expect(
      service.registerLocal({ username: 'ada', email: 'ada@example.com', password: 'password123' }),
    ).rejects.toThrow(ConflictException);
  });
});

describe('AuthService.loginLocal', () => {
  it('returns an access token and a refresh token with different types', async () => {
    const { service, userModel, jwt } = setup();
    userModel.findOne.mockResolvedValue(await userDoc());

    const tokens = await service.loginLocal({ username: 'ada', password: 'correct-password' });

    expect(tokens).toEqual({ accessToken: 'jwt:access', refreshToken: 'jwt:refresh', role: Role.CUSTOMER });
    expect(jwt.sign.mock.calls[0][1]).toEqual({ expiresIn: '15m' });
    expect(jwt.sign.mock.calls[1][1]).toEqual({ expiresIn: '7d' });
  });

  it('gives the same answer for an unknown user and a wrong password', async () => {
    const { service, userModel } = setup();
    userModel.findOne.mockResolvedValueOnce(null);
    const unknown = await service.loginLocal({ username: 'ghost', password: 'x' }).catch((e) => e.message);

    userModel.findOne.mockResolvedValueOnce(await userDoc());
    const wrong = await service.loginLocal({ username: 'ada', password: 'wrong' }).catch((e) => e.message);

    expect(unknown).toBe('Invalid credentials.');
    expect(wrong).toBe('Invalid credentials.');
  });

  it('counts a failed attempt and locks the account on the last allowed one', async () => {
    const { service, userModel } = setup();
    userModel.findOne.mockResolvedValue(await userDoc({ failedLoginAttempts: MAX_LOGIN_ATTEMPTS - 1 }));

    await expect(service.loginLocal({ username: 'ada', password: 'wrong' })).rejects.toThrow(UnauthorizedException);

    const update = userModel.updateOne.mock.calls[0][1].$set;
    expect(update.failedLoginAttempts).toBe(0);
    const lockedFor = update.lockedUntil.getTime() - Date.now();
    expect(lockedFor).toBeGreaterThan((LOCK_MINUTES - 1) * 60 * 1000);
  });

  it('refuses a locked account even with the right password', async () => {
    const { service, userModel } = setup();
    userModel.findOne.mockResolvedValue(await userDoc({ lockedUntil: new Date(Date.now() + 60_000) }));
    await expect(service.loginLocal({ username: 'ada', password: 'correct-password' })).rejects.toThrow('locked');
  });

  it('does not reveal that an account is unverified to someone with the wrong password', async () => {
    const { service, userModel } = setup();
    userModel.findOne.mockResolvedValue(await userDoc({ isVerified: false }));
    await expect(service.loginLocal({ username: 'ada', password: 'wrong' })).rejects.toThrow('Invalid credentials.');
    await expect(service.loginLocal({ username: 'ada', password: 'correct-password' })).rejects.toThrow('verify your email');
  });

  it('clears the failure counter after a successful login', async () => {
    const { service, userModel } = setup();
    userModel.findOne.mockResolvedValue(await userDoc({ failedLoginAttempts: 3 }));
    await service.loginLocal({ username: 'ada', password: 'correct-password' });
    expect(userModel.updateOne.mock.calls[0][1].$set.failedLoginAttempts).toBe(0);
  });
});

describe('AuthService.refreshTokens', () => {
  it('issues a new pair for a valid refresh token', async () => {
    const { service, userModel, jwt } = setup();
    jwt.verifyAsync.mockResolvedValue({ type: 'refresh', sub: 'u1' });
    userModel.findById.mockResolvedValue(await userDoc());
    await expect(service.refreshTokens('r')).resolves.toMatchObject({ accessToken: 'jwt:access' });
  });

  it('rejects an access token, a bad token and a deleted user', async () => {
    const { service, userModel, jwt } = setup();
    jwt.verifyAsync.mockResolvedValueOnce({ type: 'access', sub: 'u1' });
    await expect(service.refreshTokens('a')).rejects.toThrow(UnauthorizedException);

    jwt.verifyAsync.mockRejectedValueOnce(new Error('expired'));
    await expect(service.refreshTokens('b')).rejects.toThrow(UnauthorizedException);

    jwt.verifyAsync.mockResolvedValueOnce({ type: 'refresh', sub: 'gone' });
    userModel.findById.mockResolvedValue(null);
    await expect(service.refreshTokens('c')).rejects.toThrow(UnauthorizedException);
  });
});

describe('AuthService.verifyEmailOtp', () => {
  const future = () => new Date(Date.now() + 60_000);

  it('verifies the account with the right code', async () => {
    const { service, userModel } = setup();
    userModel.findOne.mockResolvedValue(
      await userDoc({ isVerified: false, verifyOtpCode: await bcrypt.hash('ABC234', 4), verifyOtpExpiresAt: future() }),
    );
    await expect(service.verifyEmailOtp('ada@example.com', 'abc234')).resolves.toBe(true);
    expect(userModel.updateOne.mock.calls[0][1].$set.isVerified).toBe(true);
  });

  it('counts a wrong code', async () => {
    const { service, userModel } = setup();
    userModel.findOne.mockResolvedValue(
      await userDoc({ verifyOtpCode: await bcrypt.hash('ABC234', 4), verifyOtpExpiresAt: future(), verifyOtpAttempts: 0 }),
    );
    await expect(service.verifyEmailOtp('ada@example.com', 'WRONG1')).rejects.toThrow(UnauthorizedException);
    expect(userModel.updateOne.mock.calls[0][1]).toEqual({ $inc: { verifyOtpAttempts: 1 } });
  });

  it('refuses even the right code after too many wrong ones', async () => {
    const { service, userModel } = setup();
    userModel.findOne.mockResolvedValue(
      await userDoc({
        verifyOtpCode: await bcrypt.hash('ABC234', 4),
        verifyOtpExpiresAt: future(),
        verifyOtpAttempts: MAX_OTP_ATTEMPTS,
      }),
    );
    await expect(service.verifyEmailOtp('ada@example.com', 'ABC234')).rejects.toThrow(BadRequestException);
  });

  it('refuses an expired code', async () => {
    const { service, userModel } = setup();
    userModel.findOne.mockResolvedValue(
      await userDoc({ verifyOtpCode: await bcrypt.hash('ABC234', 4), verifyOtpExpiresAt: new Date(Date.now() - 1000) }),
    );
    await expect(service.verifyEmailOtp('ada@example.com', 'ABC234')).rejects.toThrow('expired');
  });
});

describe('AuthService password recovery', () => {
  it('gives the same answer for an existing and an unknown email, and mails only the real one', async () => {
    const { service, userModel, email } = setup();
    userModel.findOne.mockResolvedValueOnce(await userDoc());
    const known = await service.forgotPasswordLoop('Ada@Example.com');

    userModel.findOne.mockResolvedValueOnce(null);
    const unknown = await service.forgotPasswordLoop('ghost@example.com');

    expect(known).toBe(RECOVERY_MESSAGE);
    expect(unknown).toBe(RECOVERY_MESSAGE);
    expect(email.sendPasswordResetEmail).toHaveBeenCalledTimes(1);
  });

  it('does not accept an email-verification code as a password reset code', async () => {
    const { service, userModel } = setup();
    userModel.findOne.mockResolvedValue(
      await userDoc({ verifyOtpCode: await bcrypt.hash('ABC234', 4), verifyOtpExpiresAt: new Date(Date.now() + 60_000) }),
    );
    await expect(
      service.verifyResetAndMutatePassword({ email: 'ada@example.com', otpCode: 'ABC234', newPassword: 'new-password-1' }),
    ).rejects.toThrow('Invalid recovery session.');
  });

  it('sets a new password hash with the right reset code', async () => {
    const { service, userModel } = setup();
    userModel.findOne.mockResolvedValue(
      await userDoc({ resetOtpCode: await bcrypt.hash('XYZ789', 4), resetOtpExpiresAt: new Date(Date.now() + 60_000) }),
    );
    await service.verifyResetAndMutatePassword({ email: 'ada@example.com', otpCode: 'xyz789', newPassword: 'new-password-1' });
    const set = userModel.updateOne.mock.calls[0][1].$set;
    expect(await bcrypt.compare('new-password-1', set.passwordHash)).toBe(true);
  });
});

describe('AuthService.loginWithProvider', () => {
  it('creates a verified customer from the identity the provider confirmed', async () => {
    const { service, userModel, social } = setup();
    social.verifyGoogle.mockResolvedValue({ email: 'New@Example.com', providerId: 'g-1' });
    userModel.findOne.mockResolvedValue(null);
    userModel.create.mockImplementation(async (doc: Record<string, unknown>) => ({ ...doc, _id: 'u9' }));

    const tokens = await service.loginWithProvider('google', 'id-token');

    const created = userModel.create.mock.calls[0][0];
    expect(created.email).toBe('new@example.com');
    expect(created.googleId).toBe('g-1');
    expect(created.role).toBe(Role.CUSTOMER);
    expect(created.isVerified).toBe(true);
    expect(tokens.accessToken).toBe('jwt:access');
  });

  it('never creates or logs in anyone when the provider rejects the token', async () => {
    const { service, userModel, social } = setup();
    social.verifyGoogle.mockRejectedValue(new UnauthorizedException('Invalid Google token.'));
    await expect(service.loginWithProvider('google', 'forged')).rejects.toThrow(UnauthorizedException);
    expect(userModel.create).not.toHaveBeenCalled();
    expect(userModel.findOne).not.toHaveBeenCalled();
  });

  it('links a provider id to an existing account with the same verified email', async () => {
    const { service, userModel, social } = setup();
    const existing: any = { ...(await userDoc({ isVerified: false })), save: vi.fn() };
    social.verifyApple.mockResolvedValue({ email: 'ada@example.com', providerId: 'a-1' });
    userModel.findOne.mockResolvedValue(existing);

    await service.loginWithProvider('apple', 'id-token');

    expect(existing.appleId).toBe('a-1');
    expect(existing.isVerified).toBe(true);
    expect(existing.save).toHaveBeenCalled();
  });
});
