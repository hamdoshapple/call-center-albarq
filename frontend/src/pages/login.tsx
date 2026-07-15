import { useState } from 'react';
import { useNavigate, Navigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { Phone, Lock, User as UserIcon, Loader2, Moon, Sun, Languages } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Card, CardContent } from '@/components/ui/card';
import { useAuth } from '@/hooks/use-auth';
import { useTheme } from '@/hooks/use-theme';
import { useLanguage } from '@/hooks/use-language';
import { authApi } from '@/api';

export function LoginPage() {
  const { t } = useTranslation();
  const { user, login } = useAuth();
  const { theme, toggleTheme } = useTheme();
  const { toggleLanguage } = useLanguage();
  const navigate = useNavigate();

  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  if (user) return <Navigate to="/dashboard" replace />;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setLoading(true);
    try {
      await login(username, password);
      navigate('/whatsapp-inbox', { replace: true });
    } catch {
      setError(t('auth.login_error'));
    } finally {
      setLoading(false);
    }
  };

  const demoUsers = authApi.listDemoUsers();

  return (
    <div className="relative flex min-h-screen items-center justify-center overflow-hidden bg-gradient-to-br from-primary/90 via-primary to-sky-800 p-4">
      <div className="absolute inset-0 opacity-10" style={{ backgroundImage: 'radial-gradient(circle at 20% 30%, white 1px, transparent 1px)', backgroundSize: '40px 40px' }} />

      <div className="absolute end-4 top-4 flex gap-2">
        <Button variant="ghost" size="icon" className="text-white hover:bg-white/20" onClick={toggleLanguage}>
          <Languages className="h-5 w-5" />
        </Button>
        <Button variant="ghost" size="icon" className="text-white hover:bg-white/20" onClick={toggleTheme}>
          {theme === 'dark' ? <Sun className="h-5 w-5" /> : <Moon className="h-5 w-5" />}
        </Button>
      </div>

      <div className="relative grid w-full max-w-4xl overflow-hidden rounded-2xl shadow-2xl md:grid-cols-2">
        {/* Brand panel */}
        <div className="hidden flex-col justify-between bg-sidebar p-10 text-sidebar-foreground md:flex">
          <div className="flex items-center gap-3">
            <img src="/logo.svg" alt="logo" className="h-12 w-12" />
            <div>
              <p className="text-lg font-bold">{t('app.name')}</p>
              <p className="text-xs text-sidebar-foreground/60">{t('app.tagline')}</p>
            </div>
          </div>
          <div className="space-y-4">
            <h2 className="text-2xl font-bold leading-snug">
              منصة متكاملة لإدارة مركز الاتصال
            </h2>
            <p className="text-sm text-sidebar-foreground/70 leading-relaxed">
              مكالمات مباشرة، قوائم انتظار، رد آلي IVR، خطوط GSM وتقارير أداء — كل ذلك في لوحة تحكم واحدة مدعومة بـ Asterisk و TG400.
            </p>
            <div className="flex items-center gap-2 text-sm text-sidebar-foreground/80">
              <Phone className="h-4 w-4" />
              <span>Asterisk • AMI / ARI • TG400 GSM Gateway</span>
            </div>
          </div>
          <p className="text-xs text-sidebar-foreground/40">© 2026 Call Center Albarq</p>
        </div>

        {/* Form panel */}
        <Card className="rounded-none border-0">
          <CardContent className="flex flex-col justify-center gap-6 p-8 md:p-10">
            <div className="space-y-1.5 text-center md:text-start">
              <div className="mx-auto mb-3 flex h-12 w-12 items-center justify-center rounded-xl bg-primary/10 text-primary md:mx-0 md:hidden">
                <img src="/logo.svg" alt="logo" className="h-8 w-8" />
              </div>
              <h1 className="text-2xl font-bold">{t('auth.welcome_back')}</h1>
              <p className="text-sm text-muted-foreground">{t('auth.login_subtitle')}</p>
            </div>

            <form onSubmit={handleSubmit} className="space-y-4">
              <div className="space-y-2">
                <Label htmlFor="username">{t('auth.username')}</Label>
                <div className="relative">
                  <UserIcon className="absolute start-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                  <Input
                    id="username"
                    value={username}
                    onChange={(e) => setUsername(e.target.value)}
                    className="ps-9"
                    placeholder="admin"
                    autoComplete="username"
                  />
                </div>
              </div>

              <div className="space-y-2">
                <Label htmlFor="password">{t('auth.password')}</Label>
                <div className="relative">
                  <Lock className="absolute start-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                  <Input
                    id="password"
                    type="password"
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    className="ps-9"
                    placeholder="••••••••"
                    autoComplete="current-password"
                  />
                </div>
              </div>

              {error && (
                <p className="rounded-md bg-destructive/10 px-3 py-2 text-sm text-destructive">{error}</p>
              )}

              <Button type="submit" className="w-full" size="lg" disabled={loading}>
                {loading ? (
                  <>
                    <Loader2 className="h-4 w-4 animate-spin" />
                    {t('auth.signing_in')}
                  </>
                ) : (
                  t('auth.login')
                )}
              </Button>
            </form>

            <div className="rounded-lg border border-dashed bg-muted/40 p-3 text-xs">
              <p className="mb-1.5 font-semibold text-muted-foreground">{t('auth.demo_credentials')}:</p>
              <p className="font-mono">admin / admin123</p>
              <p className="mt-1 text-muted-foreground">
                {demoUsers.map((u) => u.username).join(' · ')}
              </p>
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
