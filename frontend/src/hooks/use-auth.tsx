import {
  createContext,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from 'react';
import type { ModuleKey, PermissionAction, RolePermissions, User } from '@/types';
import { authApi, permissionsApi } from '@/api';
import { can } from '@/data/permissions';

interface AuthContextValue {
  user: User | null;
  permissions: RolePermissions | null;
  loading: boolean;
  login: (username: string, password: string) => Promise<void>;
  logout: () => void;
  hasPermission: (module: ModuleKey, action?: PermissionAction) => boolean;
  refreshPermissions: () => Promise<void>;
}

const AuthContext = createContext<AuthContextValue | undefined>(undefined);
const TOKEN_KEY = 'cc_token';

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [permissions, setPermissions] = useState<RolePermissions | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const token = localStorage.getItem(TOKEN_KEY);
    if (!token) {
      setLoading(false);
      return;
    }
    Promise.all([authApi.me(token), permissionsApi.getPermissions()])
      .then(([u, p]) => {
        setUser(u);
        setPermissions(p);
      })
      .catch(() => localStorage.removeItem(TOKEN_KEY))
      .finally(() => setLoading(false));
  }, []);

  const login = async (username: string, password: string) => {
    const session = await authApi.login(username, password);
    localStorage.setItem(TOKEN_KEY, session.token);
    const perms = await permissionsApi.getPermissions();
    setUser(session.user);
    setPermissions(perms);
  };

  const logout = () => {
    localStorage.removeItem(TOKEN_KEY);
    setUser(null);
    setPermissions(null);
  };

  const refreshPermissions = async () => {
    const perms = await permissionsApi.getPermissions();
    setPermissions(perms);
  };

  const hasPermission = (module: ModuleKey, action: PermissionAction = 'view') => {
    if (!user || !permissions) return false;
    return can(permissions, user.role, module, action);
  };

  const value = useMemo<AuthContextValue>(
    () => ({ user, permissions, loading, login, logout, hasPermission, refreshPermissions }),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [user, permissions, loading]
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used within AuthProvider');
  return ctx;
}
