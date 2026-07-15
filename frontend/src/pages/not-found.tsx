import { Link } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { PhoneOff } from 'lucide-react';
import { Button } from '@/components/ui/button';

export function NotFoundPage() {
  const { t } = useTranslation();
  return (
    <div className="flex min-h-screen flex-col items-center justify-center gap-4 bg-muted/30 p-4 text-center">
      <div className="flex h-20 w-20 items-center justify-center rounded-full bg-primary/10 text-primary">
        <PhoneOff className="h-10 w-10" />
      </div>
      <h1 className="text-5xl font-bold">404</h1>
      <p className="text-muted-foreground">الصفحة غير موجودة / Page not found</p>
      <Button asChild>
        <Link to="/dashboard">{t('nav.dashboard')}</Link>
      </Button>
    </div>
  );
}
