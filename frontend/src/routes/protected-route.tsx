import { Navigate, useLocation } from 'react-router-dom';
import type { ReactNode } from 'react';
import type { ModuleKey } from '@/types';
import { useAuth } from '@/hooks/use-auth';
import { Loader } from '@/components/shared/loader';

export function ProtectedRoute({ children, module }: { children: ReactNode; module?: ModuleKey }) {
  const { user, loading, hasPermission } = useAuth();
  const location = useLocation();

  if (loading) {
    return (
      <div className="flex h-screen items-center justify-center">
        <Loader />
      </div>
    );
  }

  if (!user) {
    return <Navigate to="/login" state={{ from: location }} replace />;
  }

  if (module && !hasPermission(module, 'view')) {
    return <Navigate to="/dashboard" replace />;
  }

  return <>{children}</>;
}
