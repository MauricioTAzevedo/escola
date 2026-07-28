import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { UserDto, AuthTokens } from '@escola/shared-types';
import { useAuthStore } from '../store/useAuthStore';
import { apiFetch, ApiError } from '../lib/api';
import { Card, CardContent, CardHeader } from '../components/ui/Card';
import { Input } from '../components/ui/Input';
import { Button } from '../components/ui/Button';
import { GraduationCap, Sparkles } from 'lucide-react';

export function Login() {
  const [isRegister, setIsRegister] = useState(false);
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(false);

  const setAuth = useAuthStore((state) => state.setAuth);
  const navigate = useNavigate();

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setIsLoading(true);

    try {
      if (isRegister) {
        const data = await apiFetch<{ user: UserDto; tokens: AuthTokens }>('/auth/register', {
          method: 'POST',
          body: JSON.stringify({ name, email, password, role: 'TEACHER' }),
        });
        setAuth(data.user, data.tokens);
        navigate('/teacher/subjects');
      } else {
        const data = await apiFetch<{ user: UserDto; tokens: AuthTokens }>('/auth/login', {
          method: 'POST',
          body: JSON.stringify({ email, password }),
        });
        setAuth(data.user, data.tokens);
        navigate('/teacher/subjects');
      }
    } catch (err: any) {
      if (err instanceof ApiError) {
        setError(err.message);
      } else {
        setError('Ocorreu uma falha ao conectar com o servidor.');
      }
    } finally {
      setIsLoading(false);
    }
  };

  const fillDemoTeacher = () => {
    setEmail('prof.carlos@escola.edu.br');
    setPassword('senha123');
    setIsRegister(false);
  };

  return (
    <div className="min-h-screen bg-slate-50 dark:bg-slate-950 flex flex-col justify-center py-12 sm:px-6 lg:px-8 transition-colors">
      <div className="sm:mx-auto sm:w-full sm:max-w-md text-center">
        <div className="inline-flex p-3 bg-indigo-600 text-white rounded-xl shadow-md mb-4">
          <GraduationCap className="h-8 w-8" />
        </div>
        <h2 className="text-3xl font-extrabold text-slate-900 dark:text-slate-100">
          Plataforma do Professor
        </h2>
        <p className="mt-2 text-sm text-slate-600 dark:text-slate-400">
          Criação e Gestão de Questões com Inteligência Artificial (Google Gemini)
        </p>
      </div>

      <div className="mt-8 sm:mx-auto sm:w-full sm:max-w-md">
        <Card>
          <CardHeader className="text-center pb-4">
            <div className="flex border-b border-slate-200 dark:border-slate-800 -mx-6 px-6 -mt-2">
              <button
                type="button"
                className={`flex-1 py-3 text-sm font-semibold border-b-2 ${
                  !isRegister
                    ? 'border-indigo-600 dark:border-indigo-400 text-indigo-600 dark:text-indigo-400'
                    : 'border-transparent text-slate-500 dark:text-slate-400 hover:text-slate-700 dark:hover:text-slate-200'
                }`}
                onClick={() => {
                  setIsRegister(false);
                  setError(null);
                }}
              >
                Acesso do Professor
              </button>
              <button
                type="button"
                className={`flex-1 py-3 text-sm font-semibold border-b-2 ${
                  isRegister
                    ? 'border-indigo-600 dark:border-indigo-400 text-indigo-600 dark:text-indigo-400'
                    : 'border-transparent text-slate-500 dark:text-slate-400 hover:text-slate-700 dark:hover:text-slate-200'
                }`}
                onClick={() => {
                  setIsRegister(true);
                  setError(null);
                }}
              >
                Cadastrar Novo Professor
              </button>
            </div>
          </CardHeader>

          <CardContent className="pt-4">
            {error && (
              <div className="mb-4 p-3 bg-rose-50 dark:bg-rose-950/50 border border-rose-200 dark:border-rose-800 text-rose-700 dark:text-rose-300 rounded-lg text-sm">
                {error}
              </div>
            )}

            <form onSubmit={handleSubmit} className="space-y-4">
              {isRegister && (
                <Input
                  label="Nome Completo do Professor"
                  type="text"
                  required
                  placeholder="Prof. Nome Sobrenome"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                />
              )}

              <Input
                label="E-mail Institucional"
                type="email"
                required
                placeholder="prof.carlos@escola.edu.br"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
              />

              <Input
                label="Senha de Acesso"
                type="password"
                required
                placeholder="••••••••"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
              />

              <Button type="submit" className="w-full mt-2" isLoading={isLoading}>
                {isRegister ? 'Finalizar Cadastro' : 'Entrar no Painel do Professor'}
              </Button>
            </form>

            <div className="mt-6 pt-4 border-t border-slate-100 dark:border-slate-800 text-center space-y-2">
              <p className="text-xs font-medium text-slate-500 dark:text-slate-400">
                Acesso Rápido de Demonstração:
              </p>
              <Button variant="outline" size="sm" onClick={fillDemoTeacher} className="w-full">
                <Sparkles className="h-3.5 w-3.5 mr-1 text-indigo-600 dark:text-indigo-400" />
                Entrar como Prof. Carlos Eduardo
              </Button>
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
