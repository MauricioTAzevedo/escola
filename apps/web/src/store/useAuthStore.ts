import { create } from 'zustand';
import { UserDto, AuthTokens } from '@escola/shared-types';
import { apiFetch } from '../lib/api';

interface AuthState {
  user: UserDto | null;
  tokens: AuthTokens | null;
  isLoading: boolean;
  setAuth: (user: UserDto, tokens: AuthTokens) => void;
  logout: () => void;
  checkAuth: () => Promise<void>;
}

export const useAuthStore = create<AuthState>((set) => ({
  user: null,
  tokens: null,
  isLoading: true,

  setAuth: (user, tokens) => {
    localStorage.setItem('token', tokens.accessToken);
    localStorage.setItem('refreshToken', tokens.refreshToken);
    set({ user, tokens, isLoading: false });
  },

  logout: () => {
    localStorage.removeItem('token');
    localStorage.removeItem('refreshToken');
    set({ user: null, tokens: null, isLoading: false });
  },

  checkAuth: async () => {
    const token = localStorage.getItem('token');
    if (!token) {
      set({ user: null, tokens: null, isLoading: false });
      return;
    }

    try {
      const data = await apiFetch<{ user: UserDto }>('/auth/me');
      set({ user: data.user, isLoading: false });
    } catch {
      localStorage.removeItem('token');
      localStorage.removeItem('refreshToken');
      set({ user: null, tokens: null, isLoading: false });
    }
  },
}));
