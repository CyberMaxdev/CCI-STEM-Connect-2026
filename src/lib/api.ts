import { auth } from './firebase';

// Ephemeral in-memory session token for email/password authentication.
// Intentionally kept strictly in JS memory (never persisted to localStorage/sessionStorage).
let memorySessionToken: string | null = null;

export function setSessionToken(token: string | null) {
  memorySessionToken = token;
}

export function getSessionToken(): string | null {
  return memorySessionToken;
}

export class ApiError extends Error {
  status: number;
  details?: unknown;

  constructor(message: string, status: number, details?: unknown) {
    super(message);
    this.name = 'ApiError';
    this.status = status;
    this.details = details;
  }
}

async function parseJsonResponse<T>(response: Response): Promise<T> {
  const text = await response.text();
  let data: Record<string, unknown> = {};
  if (text) {
    try {
      data = JSON.parse(text) as Record<string, unknown>;
    } catch {
      data = { error: text };
    }
  }

  if (!response.ok) {
    const message =
      typeof data.error === 'string'
        ? data.error
        : `Request failed with status ${response.status}`;
    throw new ApiError(message, response.status, data.details);
  }

  return data as T;
}

export async function publicApiFetch<T>(
  path: string,
  options: {
    method?: 'GET' | 'POST';
    body?: unknown;
  } = {}
): Promise<T> {
  const headers: Record<string, string> = {};
  if (options.body !== undefined) {
    headers['Content-Type'] = 'application/json';
  }

  const response = await fetch(path, {
    method: options.method ?? 'POST',
    headers,
    body: options.body !== undefined ? JSON.stringify(options.body) : undefined,
  });

  return parseJsonResponse<T>(response);
}

export async function apiFetch<T>(
  path: string,
  options: {
    method?: 'GET' | 'POST' | 'PATCH' | 'PUT' | 'DELETE';
    body?: unknown;
  } = {}
): Promise<T> {
  let token: string | null = memorySessionToken;

  if (!token) {
    const user = auth.currentUser;
    if (!user) {
      throw new ApiError('Please sign in to continue.', 401);
    }
    token = await user.getIdToken();
  }

  const headers: Record<string, string> = {
    Authorization: `Bearer ${token}`,
  };

  if (options.body !== undefined) {
    headers['Content-Type'] = 'application/json';
  }

  const response = await fetch(path, {
    method: options.method ?? 'GET',
    headers,
    body: options.body !== undefined ? JSON.stringify(options.body) : undefined,
  });

  return parseJsonResponse<T>(response);
}
