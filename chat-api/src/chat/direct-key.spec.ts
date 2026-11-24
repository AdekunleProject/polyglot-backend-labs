import { directKey, previewOf } from './direct-key';

describe('directKey', () => {
  it('is the same whichever way round the two people are', () => {
    expect(directKey(3, 17)).toBe('3:17');
    expect(directKey(17, 3)).toBe('3:17');
  });
});

describe('previewOf', () => {
  it('shows text, shortened, and a label for media', () => {
    expect(previewOf({ type: 'text', body: 'hello' })).toBe('hello');
    expect(previewOf({ type: 'text', body: 'x'.repeat(300) })).toHaveLength(100);
    expect(previewOf({ type: 'voice', body: null })).toBe('Voice message');
    expect(previewOf({ type: 'image', body: 'caption' })).toBe('Photo');
  });
});
