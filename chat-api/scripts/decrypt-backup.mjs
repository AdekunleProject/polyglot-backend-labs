// Opens a .chatbackup file on your own computer. Nothing is sent anywhere.
//   node scripts/decrypt-backup.mjs my.chatbackup "my password" > chats.json
import { readFileSync } from 'node:fs';
import { createDecipheriv, scryptSync } from 'node:crypto';
import { gunzipSync } from 'node:zlib';

const [file, password] = process.argv.slice(2);
if (!file || !password) {
  console.error('Usage: node decrypt-backup.mjs <file> <password>');
  process.exit(1);
}
const data = readFileSync(file);
const magic = 'CHATBK1';
if (data.subarray(0, magic.length).toString() !== magic) {
  console.error('Not a chat backup file');
  process.exit(1);
}
let at = magic.length;
const salt = data.subarray(at, (at += 16));
const iv = data.subarray(at, (at += 12));
const tag = data.subarray(at, (at += 16));
const key = scryptSync(password, salt, 32, { N: 2 ** 15, r: 8, p: 1, maxmem: 128 * 1024 * 1024 });
const decipher = createDecipheriv('aes-256-gcm', key, iv);
decipher.setAuthTag(tag);
try {
  const plain = Buffer.concat([decipher.update(data.subarray(at)), decipher.final()]);
  process.stdout.write(gunzipSync(plain));
} catch {
  console.error('Wrong password, or the backup was changed');
  process.exit(1);
}
