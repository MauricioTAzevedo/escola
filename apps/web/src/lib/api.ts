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

let isRefreshing = false;

export async function apiFetch<T = unknown>(
  endpoint: string,
  options: RequestInit = {}
): Promise<T> {
  const token = localStorage.getItem('token');

  const headers: Record<string, string> = {
    ...(options.body ? { 'Content-Type': 'application/json' } : {}),
    ...(options.headers as Record<string, string>),
  };

  if (token) {
    headers['Authorization'] = `Bearer ${token}`;
  }

  const url = endpoint.startsWith('http') ? endpoint : `${API_URL}${endpoint}`;

  let response: Response;
  try {
    response = await fetch(url, { ...options, headers });
  } catch {
    throw new ApiError('Sem conexão com o servidor. Verifique sua conexão.', 0);
  }

  // Automatic token refresh interceptor on 401 Unauthorized
  if (
    response.status === 401 &&
    !endpoint.includes('/auth/login') &&
    !endpoint.includes('/auth/refresh')
  ) {
    const refreshToken = localStorage.getItem('refreshToken');
    if (refreshToken && !isRefreshing) {
      isRefreshing = true;
      try {
        const refreshRes = await fetch(`${API_URL}/auth/refresh`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ refreshToken }),
        });

        if (refreshRes.ok) {
          const refreshData = await refreshRes.json();
          const newToken = refreshData.tokens.accessToken;
          localStorage.setItem('token', newToken);
          if (refreshData.tokens.refreshToken) {
            localStorage.setItem('refreshToken', refreshData.tokens.refreshToken);
          }

          // Transparently retry original request with refreshed token
          headers['Authorization'] = `Bearer ${newToken}`;
          const retryRes = await fetch(url, { ...options, headers });
          const retryData = await retryRes.json().catch(() => ({}));
          if (!retryRes.ok) {
            throw new ApiError(
              retryData.error || 'Ocorreu um erro na requisição',
              retryRes.status,
              retryData
            );
          }
          return retryData as T;
        }
      } catch {
        localStorage.removeItem('token');
        localStorage.removeItem('refreshToken');
      } finally {
        isRefreshing = false;
      }
    }
  }

  const data = await response.json().catch(() => ({}));

  if (!response.ok) {
    throw new ApiError(data.error || 'Ocorreu um erro na requisição', response.status, data);
  }

  return data as T;
}
