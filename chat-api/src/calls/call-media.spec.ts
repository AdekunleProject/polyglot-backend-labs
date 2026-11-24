import { FakeMedia, LiveKitMedia, readGrant } from './call-media';

describe('call media', () => {
  it('makes a LiveKit token that lets one person join one room', async () => {
    const media = new LiveKitMedia('wss://example.livekit.cloud', 'APIkey1234', 'secret-secret-secret-secret-1234');
    const jwt = await media.createToken({ room: 'call_abc', identity: '42', name: 'Ada' });
    expect(jwt.split('.')).toHaveLength(3);
    expect(readGrant(jwt)).toEqual({ identity: '42', room: 'call_abc', roomJoin: true });
  });

  it('fake media works in development and refuses in production', async () => {
    expect(await new FakeMedia(false).createToken({ room: 'r', identity: '1' })).toBe('fake.r.1');
    await expect(new FakeMedia(true).createToken({ room: 'r', identity: '1' })).rejects.toThrow(/not configured/);
  });
});
