import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { ShieldCheck } from 'lucide-react';
import { PageHeader } from '@/components/shared/page-header';
import { Loader } from '@/components/shared/loader';
import { Card, CardContent } from '@/components/ui/card';
import { Checkbox } from '@/components/ui/checkbox';
import { Badge } from '@/components/ui/badge';
import {
  Tabs,
  TabsList,
  TabsTrigger,
  TabsContent,
} from '@/components/ui/tabs';
import { permissionsApi } from '@/api';
import { MODULES, ALL_ACTIONS } from '@/data/permissions';
import type { Role, PermissionAction } from '@/types';
import { useAuth } from '@/hooks/use-auth';
import { useToast } from '@/components/ui/use-toast';

const ROLES: Role[] = ['super_admin', 'manager', 'supervisor', 'agent', 'accountant', 'support'];

export function PermissionsPage() {
  const { t } = useTranslation();
  const { toast } = useToast();
  const { hasPermission, refreshPermissions } = useAuth();
  const qc = useQueryClient();

  const { data: perms, isLoading } = useQuery({ queryKey: ['permissions'], queryFn: permissionsApi.getPermissions });
  const [role, setRole] = useState<Role>('manager');
  const canEdit = hasPermission('permissions', 'edit');

  const toggleMut = useMutation({
    mutationFn: ({ r, m, a, enabled }: { r: Role; m: typeof MODULES[number]; a: PermissionAction; enabled: boolean }) =>
      permissionsApi.togglePermission(r, m, a, enabled),
    onSuccess: async () => {
      qc.invalidateQueries({ queryKey: ['permissions'] });
      await refreshPermissions();
      toast({ title: t('permissions.updated') });
    },
  });

  if (isLoading || !perms) return <Loader />;

  return (
    <div className="space-y-6">
      <PageHeader title={t('permissions.title')} subtitle={t('permissions.subtitle')} icon={<ShieldCheck className="h-5 w-5" />} />

      <Tabs value={role} onValueChange={(v) => setRole(v as Role)}>
        <TabsList className="flex-wrap">
          {ROLES.map((r) => <TabsTrigger key={r} value={r}>{t(`roles.${r}`)}</TabsTrigger>)}
        </TabsList>

        {ROLES.map((r) => (
          <TabsContent key={r} value={r}>
            <Card>
              <CardContent className="p-0">
                {r === 'super_admin' && (
                  <div className="border-b bg-muted/40 p-3 text-sm text-muted-foreground">
                    <Badge variant="secondary">{t('permissions.full_access')}</Badge>
                  </div>
                )}
                <div className="overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="border-b text-start">
                        <th className="p-3 text-start font-medium">{t('permissions.module')}</th>
                        {ALL_ACTIONS.map((a) => <th key={a} className="p-3 text-center font-medium">{t(`permissions.actions.${a}`)}</th>)}
                      </tr>
                    </thead>
                    <tbody>
                      {MODULES.map((m) => (
                        <tr key={m} className="border-b last:border-0 hover:bg-muted/30">
                          <td className="p-3 font-medium">{t(`nav.${m}`)}</td>
                          {ALL_ACTIONS.map((a) => {
                            const checked = perms[r][m]?.includes(a) ?? false;
                            return (
                              <td key={a} className="p-3 text-center">
                                <div className="flex justify-center">
                                  <Checkbox
                                    checked={checked}
                                    disabled={!canEdit || r === 'super_admin'}
                                    onCheckedChange={(v) => toggleMut.mutate({ r, m, a, enabled: !!v })}
                                  />
                                </div>
                              </td>
                            );
                          })}
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </CardContent>
            </Card>
          </TabsContent>
        ))}
      </Tabs>
    </div>
  );
}
