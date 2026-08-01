import { create } from 'zustand';
import { UserDto, AuthTokens } from '@escola/shared-types';
import { apiFetch, setAccessToken } from '../lib/api';

interface AuthState {
  user: UserDto | null;
  tokens: AuthTokens | null;
  isLoading: boolean;
  setAuth: (user: UserDto, tokens: AuthTokens) => void;
  logout: () => Promise<void>;
  checkAuth: () => Promise<void>;
}

export const useAuthStore = create<AuthState>((set) => ({
  user: null,
  tokens: null,
  isLoading: true,

  setAuth: (user, tokens) => {
    setAccessToken(tokens.accessToken);
    set({ user, tokens, isLoading: false });
  },

  logout: async () => {
    setAccessToken(null);
    set({ user: null, tokens: null });
    try {
      await apiFetch('/auth/logout', { method: 'POST' });
    } catch {
      // best-effort revocation of the HttpOnly refresh cookie
    }
  },

  checkAuth: async () => {
    try {
      const data = await apiFetch<{ user: UserDto }>('/auth/me');
      set({ user: data.user, isLoading: false });
    } catch {
      setAccessToken(null);
      set({ user: null, tokens: null, isLoading: false });
    }
  },
}));

if (typeof window !== 'undefined') {
  window.addEventListener('auth:unauthorized', () => {
    setAccessToken(null);
    useAuthStore.setState({ user: null, tokens: null, isLoading: false });
  });
}
