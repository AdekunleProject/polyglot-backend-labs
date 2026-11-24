import { Logger, ServiceUnavailableException } from '@nestjs/common';
import { AccessToken } from 'livekit-server-sdk';

/** The media server carries the audio and video. This API only decides who may join which room. */
export interface CallMedia {
  readonly name: string;
  /** Where the app connects. */
  readonly url: string;
  /** A short-lived pass for one person in one room. */
  createToken(input: { room: string; identity: string; name: string }): Promise<string>;
}

export const CALL_MEDIA = Symbol('CALL_MEDIA');

/** LiveKit. The token is made here from your API key and secret, so no request leaves the server. */
export class LiveKitMedia implements CallMedia {
  readonly name = 'livekit';
  private readonly logger = new Logger('LiveKitMedia');

  constructor(
    readonly url: string,
    private readonly apiKey: string,
    private readonly apiSecret: string,
  ) {}

  async createToken(input: { room: string; identity: string; name: string }) {
    const token = new AccessToken(this.apiKey, this.apiSecret, {
      identity: input.identity,
      name: input.name,
      ttl: 60 * 60,
    });
    token.addGrant({ room: input.room, roomJoin: true, canPublish: true, canSubscribe: true });
    const jwt = await token.toJwt();
    this.logger.debug(`Token for ${input.identity} in ${input.room}`);
    return jwt;
  }
}

/** For development and tests. The token means nothing to a real media server. Refuses to work in production. */
export class FakeMedia implements CallMedia {
  readonly name = 'fake';
  readonly url = 'wss://livekit.fake.test';

  constructor(private readonly production: boolean) {}

  async createToken(input: { room: string; identity: string }) {
    if (this.production) throw new ServiceUnavailableException('Calls are not configured');
    return `fake.${input.room}.${input.identity}`;
  }
}

/** What a LiveKit token says, for tests. */
export function readGrant(jwt: string): { identity: string; room: string; roomJoin: boolean } {
  const payload = JSON.parse(Buffer.from(jwt.split('.')[1], 'base64url').toString('utf8')) as {
    sub: string;
    video?: { room?: string; roomJoin?: boolean };
  };
  return { identity: payload.sub, room: payload.video?.room ?? '', roomJoin: !!payload.video?.roomJoin };
}
