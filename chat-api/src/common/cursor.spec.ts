import { decodeCursor, encodeCursor } from './cursor';

describe('cursor', () => {
  it('round-trips an id', () => {
    expect(decodeCursor(encodeCursor(1234))).toBe(1234);
  });

  it('rejects anything that is not a cursor', () => {
    expect(decodeCursor('not a cursor!')).toBeNull();
    expect(decodeCursor(Buffer.from("1; DROP TABLE posts").toString('base64url'))).toBeNull();
    expect(decodeCursor('')).toBeNull();
  });
});
