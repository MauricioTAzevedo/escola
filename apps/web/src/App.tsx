import { useEffect } from 'react';
import { BrowserRouter, Routes, Route, Navigate } from 'react-router';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { useAuthStore } from './store/useAuthStore';
import { Navbar } from './components/ui/Navbar';
import { ProtectedRoute } from './components/ProtectedRoute';
import { ErrorBoundary } from './components/ErrorBoundary';
import { Login } from './pages/Login';
import { TeacherDashboard } from './pages/TeacherDashboard';
import { TeacherSubjects } from './pages/TeacherSubjects';

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      retry: 1,
      refetchOnWindowFocus: false,
    },
  },
});

export function App() {
  const checkAuth = useAuthStore((state) => state.checkAuth);

  useEffect(() => {
    checkAuth();
  }, [checkAuth]);

  return (
    <QueryClientProvider client={queryClient}>
      <BrowserRouter>
        <div className="min-h-screen bg-slate-50 dark:bg-slate-950 text-slate-900 dark:text-slate-100 flex flex-col font-sans transition-colors">
          <Navbar />
          <main className="flex-1">
            <ErrorBoundary>
              <Routes>
                <Route path="/login" element={<Login />} />

                {/* Teacher Routes */}
                <Route element={<ProtectedRoute allowedRoles={['TEACHER', 'ADMIN']} />}>
                  <Route path="/teacher/subjects" element={<TeacherSubjects />} />
                  <Route path="/teacher/dashboard" element={<TeacherDashboard />} />
                </Route>

                {/* Default redirect to teacher subjects */}
                <Route path="*" element={<Navigate to="/teacher/subjects" replace />} />
              </Routes>
            </ErrorBoundary>
          </main>
        </div>
      </BrowserRouter>
    </QueryClientProvider>
  );
}
