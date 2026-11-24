/** The same key for (3, 17) and (17, 3), so two people never get two direct chats. */
export function directKey(a: number, b: number): string {
  return a < b ? `${a}:${b}` : `${b}:${a}`;
}

/** How a message looks in a push notification or the chat list. */
export function previewOf(message: { type: string; body: string | null }): string {
  switch (message.type) {
    case 'image':
      return 'Photo';
    case 'video':
      return 'Video';
    case 'voice':
      return 'Voice message';
    case 'file':
      return 'File';
    default:
      return (message.body ?? '').slice(0, 100);
  }
}
