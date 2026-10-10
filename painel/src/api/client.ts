import { STORAGE_KEYS } from '../config/constants';
import { readStorage, removeStorage, writeStorage } from '../lib/storage';
import type { UsuarioPainel } from '../types';

export class ApiError extends Error {
  status: number;

  constructor(message: string, status: number) {
    super(message);
    this.name = 'ApiError';
    this.status = status;
  }
}

export function getToken() {
  return readStorage(STORAGE_KEYS.token);
}

export function getUsuario(): UsuarioPainel | null {
  try {
    const raw = readStorage(STORAGE_KEYS.usuario);
    if (!raw) return null;
    return JSON.parse(raw) as UsuarioPainel;
  } catch {
    return null;
  }
}

export function persistSession(token: string, usuario: UsuarioPainel) {
  writeStorage(STORAGE_KEYS.token, token);
  writeStorage(STORAGE_KEYS.usuario, JSON.stringify(usuario));
}

export function clearSession() {
  removeStorage(STORAGE_KEYS.token);
  removeStorage(STORAGE_KEYS.usuario);
}

type UnauthorizedListener = () => void;
let onUnauthorized: UnauthorizedListener | null = null;

export function setUnauthorizedHandler(handler: UnauthorizedListener | null) {
  onUnauthorized = handler;
}

function redirectLogin() {
  if (typeof window === 'undefined') return;
  const base = import.meta.env.BASE_URL.replace(/\/$/, '');
  window.location.assign(`${base}/login`);
}

export async function api<T>(path: string, init: RequestInit = {}): Promise<T> {
  const headers = new Headers(init.headers);
  if (!headers.has('Content-Type') && init.body) {
    headers.set('Content-Type', 'application/json');
  }

  const token = getToken();
  if (token) headers.set('Authorization', `Bearer ${token}`);

  const res = await fetch(`/api/painel${path}`, {
    ...init,
    headers,
    credentials: 'same-origin',
  });

  if (res.status === 401) {
    clearSession();
    onUnauthorized?.();
    if (!onUnauthorized) redirectLogin();
    throw new ApiError('nao_autorizado', 401);
  }

  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    const msg = typeof data?.erro === 'string' && data.erro ? data.erro : res.statusText;
    throw new ApiError(msg, res.status);
  }

  return data as T;
}

export async function loginRequest(login: string, pin: string) {
  const res = await fetch('/api/painel/login', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    credentials: 'same-origin',
    body: JSON.stringify({ login: login || undefined, pin }),
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    throw new ApiError(typeof data?.erro === 'string' ? data.erro : 'PIN inválido', res.status);
  }
  if (typeof data?.token !== 'string' || !data.token) {
    throw new ApiError('Resposta de login inválida', res.status);
  }
  const usuario = (data.usuario || {
    id: 0,
    nome: 'Administrador',
    login: login || 'admin',
    role: 'admin',
  }) as UsuarioPainel;
  return { token: data.token as string, usuario };
}
