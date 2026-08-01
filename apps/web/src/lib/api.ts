const API_URL = import.meta.env.VITE_API_URL || '/api';

export class ApiError extends Error {
  status: number;
  data: unknown;

  constructor(message: string, status: number, data?: unknown) {
    super(message);
    this.status = status;
    this.data = data;
  }
}

let accessToken: string | null = null;
let refreshPromise: Promise<string | null> | null = null;

export function setAccessToken(token: string | null) {
  accessToken = token;
}

export function getAccessToken() {
  return accessToken;
}

function notifyUnauthorized() {
  window.dispatchEvent(new CustomEvent('auth:unauthorized'));
}

function requestRefresh(): Promise<string | null> {
  if (!refreshPromise) {
    refreshPromise = fetch(`${API_URL}/auth/refresh`, {
      method: 'POST',
      credentials: 'include',
    })
      .then(async (res) => {
        if (!res.ok) return null;
        const data = await res.json().catch(() => null);
        const token = data?.tokens?.accessToken ?? null;
        if (token) accessToken = token;
        return token;
      })
      .catch(() => null)
      .finally(() => {
        refreshPromise = null;
      });
  }
  return refreshPromise;
}

export async function apiFetch<T = unknown>(
  endpoint: string,
  options: RequestInit = {}
): Promise<T> {
  const headers: Record<string, string> = {
    ...(options.body ? { 'Content-Type': 'application/json' } : {}),
    ...(options.headers as Record<string, string>),
  };

  if (accessToken) {
    headers['Authorization'] = `Bearer ${accessToken}`;
  }

  const url = endpoint.startsWith('http') ? endpoint : `${API_URL}${endpoint}`;
  const requestOptions: RequestInit = { ...options, headers, credentials: 'include' };

  let response: Response;
  try {
    response = await fetch(url, requestOptions);
  } catch {
    throw new ApiError('Sem conexão com o servidor. Verifique sua conexão.', 0);
  }

  const isAuthEndpoint =
    endpoint.includes('/auth/login') || endpoint.includes('/auth/refresh');

  if (response.status === 401 && !isAuthEndpoint) {
    const newToken = await requestRefresh();
    if (newToken) {
      headers['Authorization'] = `Bearer ${newToken}`;
      try {
        response = await fetch(url, { ...options, headers, credentials: 'include' });
      } catch {
        throw new ApiError('Sem conexão com o servidor. Verifique sua conexão.', 0);
      }
    } else {
      setAccessToken(null);
      notifyUnauthorized();
    }
  }

  const data = await response.json().catch(() => ({}));

  if (!response.ok) {
    throw new ApiError(data.error || 'Ocorreu um erro na requisição', response.status, data);
  }

  return data as T;
}
