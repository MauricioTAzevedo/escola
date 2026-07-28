import { useState } from 'react';
import { Link, useNavigate, useLocation } from 'react-router-dom';
import { useAuthStore } from '../../store/useAuthStore';
import { Button } from './Button';
import { Badge } from './Badge';
import { ThemeToggle } from './ThemeToggle';
import { GraduationCap, LogOut, LayoutDashboard, BookOpen, Building2 } from 'lucide-react';
import { InstitutionSettingsModal } from '../InstitutionSettingsModal';

export function Navbar() {
  const { user, logout } = useAuthStore();
  const navigate = useNavigate();
  const location = useLocation();
  const [settingsOpen, setSettingsOpen] = useState(false);

  if (!user) return null;

  const handleLogout = () => {
    logout();
    navigate('/login');
  };

  const isActive = (path: string) => location.pathname === path;

  return (
    <>
      <header className="bg-white dark:bg-slate-900 border-b border-slate-200 dark:border-slate-800 sticky top-0 z-30 transition-colors">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex justify-between items-center h-16">
            {/* Logo & Brand */}
            <div className="flex items-center space-x-8">
              <Link to="/teacher/subjects" className="flex items-center space-x-2">
                <div className="bg-indigo-600 text-white p-2 rounded-lg">
                  <GraduationCap className="h-5 w-5" />
                </div>
                <span className="font-bold text-slate-900 dark:text-slate-100 text-lg">
                  Plataforma do Professor
                </span>
              </Link>

              {/* Navigation links */}
              <nav className="hidden md:flex space-x-1">
                <Link
                  to="/teacher/subjects"
                  className={`flex items-center space-x-1.5 px-3 py-2 rounded-md text-sm font-medium transition-colors ${
                    isActive('/teacher/subjects')
                      ? 'bg-indigo-50 dark:bg-indigo-950/60 text-indigo-600 dark:text-indigo-400'
                      : 'text-slate-700 dark:text-slate-200 hover:text-indigo-600 dark:hover:text-indigo-400 hover:bg-slate-50 dark:hover:bg-slate-800'
                  }`}
                >
                  <BookOpen className="h-4 w-4" />
                  <span>Questões & Provas</span>
                </Link>

                <Link
                  to="/teacher/dashboard"
                  className={`flex items-center space-x-1.5 px-3 py-2 rounded-md text-sm font-medium transition-colors ${
                    isActive('/teacher/dashboard')
                      ? 'bg-indigo-50 dark:bg-indigo-950/60 text-indigo-600 dark:text-indigo-400'
                      : 'text-slate-700 dark:text-slate-200 hover:text-indigo-600 dark:hover:text-indigo-400 hover:bg-slate-50 dark:hover:bg-slate-800'
                  }`}
                >
                  <LayoutDashboard className="h-4 w-4" />
                  <span>Métricas</span>
                </Link>
              </nav>
            </div>

            {/* Right side */}
            <div className="flex items-center space-x-3">
              {/* Institution Settings — prominent button */}
              <button
                onClick={() => setSettingsOpen(true)}
                title="Configurações da Instituição"
                className="flex items-center space-x-1.5 px-3 py-1.5 rounded-lg text-sm font-semibold bg-indigo-50 dark:bg-indigo-950/60 text-indigo-700 dark:text-indigo-300 border border-indigo-200 dark:border-indigo-800 hover:bg-indigo-100 dark:hover:bg-indigo-900/60 transition-colors"
              >
                <Building2 className="h-4 w-4" />
                <span className="hidden sm:inline">Instituição</span>
              </button>

              <ThemeToggle />

              <div className="text-right hidden sm:block border-l border-slate-200 dark:border-slate-800 pl-3">
                <div className="text-sm font-semibold text-slate-900 dark:text-slate-100">
                  {user.name}
                </div>
                <div className="text-xs text-slate-500 dark:text-slate-400 flex items-center justify-end space-x-1">
                  <span>{user.email}</span>
                  <Badge variant="info">Professor</Badge>
                </div>
              </div>

              <Button variant="ghost" size="sm" onClick={handleLogout} title="Sair do sistema">
                <LogOut className="h-4 w-4 text-slate-600 dark:text-slate-400" />
                <span className="ml-1.5 hidden md:inline">Sair</span>
              </Button>
            </div>
          </div>
        </div>
      </header>

      <InstitutionSettingsModal isOpen={settingsOpen} onClose={() => setSettingsOpen(false)} />
    </>
  );
}
