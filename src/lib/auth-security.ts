import crypto from 'crypto';
import { promisify } from 'util';

const scryptAsync = promisify(crypto.scrypt);

const SESSION_PREFIX = 'cci1';
const SESSION_TTL_SECONDS = 60 * 60 * 24; // 24 hours

// Use env-provided secret if configured; otherwise generate an ephemeral cryptographically strong key per process
const SESSION_SECRET: Buffer = process.env.SESSION_SECRET
  ? crypto.createHash('sha256').update(process.env.SESSION_SECRET).digest()
  : crypto.randomBytes(32);

export async function hashPassword(password: string): Promise<string> {
  const salt = crypto.randomBytes(16).toString('hex');
  const derived = (await scryptAsync(password, salt, 64)) as Buffer;
  return `scrypt$${salt}$${derived.toString('hex')}`;
}

export async function verifyPassword(password: string, storedHash: string): Promise<boolean> {
  const parts = storedHash.split('$');
  if (parts.length !== 3 || parts[0] !== 'scrypt') {
    return false;
  }

  const [, salt, keyHex] = parts;
  if (!salt || !keyHex || keyHex.length !== 128) {
    return false;
  }

  try {
    const storedKey = Buffer.from(keyHex, 'hex');
    const derivedKey = (await scryptAsync(password, salt, 64)) as Buffer;
    if (storedKey.length !== derivedKey.length) {
      return false;
    }
    return crypto.timingSafeEqual(storedKey, derivedKey);
  } catch {
    return false;
  }
}

export interface SessionTokenPayload {
  sub: string;
  uid: string;
  email: string;
  iat: number;
  exp: number;
}

export function signSessionToken(input: { sub: string; uid: string; email: string }): string {
  const nowSec = Math.floor(Date.now() / 1000);
  const payload: SessionTokenPayload = {
    sub: input.sub,
    uid: input.uid,
    email: input.email.toLowerCase(),
    iat: nowSec,
    exp: nowSec + SESSION_TTL_SECONDS,
  };

  const payloadB64 = Buffer.from(JSON.stringify(payload), 'utf8').toString('base64url');
  const signingInput = `${SESSION_PREFIX}.${payloadB64}`;
  const signature = crypto
    .createHmac('sha256', SESSION_SECRET)
    .update(signingInput)
    .digest('base64url');

  return `${signingInput}.${signature}`;
}

export function verifySessionToken(token: string): SessionTokenPayload | null {
  const parts = token.split('.');
  if (parts.length !== 3 || parts[0] !== SESSION_PREFIX) {
    return null;
  }

  const [prefix, payloadB64, sigB64] = parts;
  const signingInput = `${prefix}.${payloadB64}`;
  const expectedSig = crypto
    .createHmac('sha256', SESSION_SECRET)
    .update(signingInput)
    .digest();

  let providedSig: Buffer;
  try {
    providedSig = Buffer.from(sigB64, 'base64url');
  } catch {
    return null;
  }

  if (providedSig.length !== expectedSig.length) {
    return null;
  }

  if (!crypto.timingSafeEqual(providedSig, expectedSig)) {
    return null;
  }

  try {
    const parsed = JSON.parse(
      Buffer.from(payloadB64, 'base64url').toString('utf8')
    ) as SessionTokenPayload;

    if (
      typeof parsed.sub !== 'string' ||
      typeof parsed.uid !== 'string' ||
      typeof parsed.email !== 'string' ||
      typeof parsed.exp !== 'number'
    ) {
      return null;
    }

    const nowSec = Math.floor(Date.now() / 1000);
    if (parsed.exp <= nowSec) {
      return null;
    }

    return parsed;
  } catch {
    return null;
  }
}

export function hashInviteCode(rawCode: string): string {
  const normalized = rawCode.trim().toUpperCase();
  return crypto.createHash('sha256').update(normalized).digest('hex');
}

export function generateInviteCode(role: 'programme_manager' | 'facilitator' | 'participant'): {
  rawCode: string;
  codeHash: string;
  codePrefix: string;
} {
  const roleTag =
    role === 'programme_manager' ? 'PM' : role === 'facilitator' ? 'FM' : 'PT';
  const alphabet = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  const randomChunk = (len: number) => {
    const bytes = crypto.randomBytes(len);
    let out = '';
    for (let i = 0; i < len; i += 1) {
      out += alphabet[bytes[i] % alphabet.length];
    }
    return out;
  };

  const part1 = randomChunk(4);
  const part2 = randomChunk(4);
  const rawCode = `CCI-${roleTag}-${part1}-${part2}`;
  const codeHash = hashInviteCode(rawCode);
  const codePrefix = `CCI-${roleTag}-${part1}-••••`;

  return { rawCode, codeHash, codePrefix };
}
