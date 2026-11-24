import { extensionFor, maxBytes, safeName } from './media-rules';

describe('media rules', () => {
  it('accepts the right types for each kind and refuses programs', () => {
    expect(extensionFor('image', 'image/png')).toBe('.png');
    expect(extensionFor('voice', 'audio/mp4')).toBe('.m4a');
    expect(extensionFor('video', 'video/mp4')).toBe('.mp4');
    expect(extensionFor('file', 'application/pdf')).toBe('.pdf');
    expect(extensionFor('file', 'application/x-msdownload')).toBeNull();
    expect(extensionFor('image', 'video/mp4')).toBeNull();
    expect(extensionFor('file', 'text/html')).toBeNull();
  });

  it('uses defaults and env overrides for size limits', () => {
    const none = () => undefined;
    expect(maxBytes('video', none)).toBe(100 * 1024 * 1024);
    expect(maxBytes('video', (k) => (k === 'MAX_VIDEO_MB' ? '5' : undefined))).toBe(5 * 1024 * 1024);
    expect(maxBytes('image', () => 'abc')).toBe(10 * 1024 * 1024);
  });

  it('cleans display names', () => {
    expect(safeName('../../etc/passwd')).toBe('.._.._etc_passwd');
    expect(safeName('a\u0000b.pdf')).toBe('ab.pdf');
    expect(safeName('   ')).toBeNull();
    expect(safeName(undefined)).toBeNull();
  });
});
