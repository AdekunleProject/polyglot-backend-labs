import { randomInt } from 'crypto';
import type { Repository } from 'typeorm';
import type { User } from './entities/user.entity';

export const USERNAME_PATTERN = /^[a-z0-9_]{3,30}$/;

/** Turns any text into a valid username base: lowercase letters, digits, underscores, 3 to 24 long. */
export function usernameBase(text: string): string {
  const cleaned = text
    .toLowerCase()
    .replace(/[^a-z0-9_]+/g, '_')
    .replace(/^_+|_+$/g, '')
    .slice(0, 24);
  return cleaned.length >= 3 ? cleaned : `user_${cleaned}`.replace(/_+$/, '').padEnd(5, '0');
}

/** A username nobody has. Tries the plain one first, then adds digits. */
export async function uniqueUsername(users: Repository<User>, text: string): Promise<string> {
  const base = usernameBase(text);
  for (let attempt = 0; attempt < 8; attempt += 1) {
    const candidate = attempt === 0 ? base : `${base}${randomInt(100, 99999)}`.slice(0, 30);
    if (!(await users.existsBy({ username: candidate }))) return candidate;
  }
  return `${base.slice(0, 18)}${Date.now().toString(36)}`.slice(0, 30);
}
