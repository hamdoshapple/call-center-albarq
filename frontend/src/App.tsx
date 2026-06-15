import { Routes, Route, Navigate } from 'react-router-dom';
import { AppLayout } from '@/layouts/app-layout';
import { ProtectedRoute } from '@/routes/protected-route';
import { LoginPage } from '@/pages/login';
import { DashboardPage } from '@/pages/dashboard';
import { LiveCallsPage } from '@/pages/live-calls';
import { AgentsPage } from '@/pages/agents';
import { DepartmentsPage } from '@/pages/departments';
import { QueuesPage } from '@/pages/queues';
import { IVRPage } from '@/pages/ivr';
import { VoicePromptsPage } from '@/pages/voice-prompts';
import { CallTransferPage } from '@/pages/call-transfer';
import { CallLogsPage } from '@/pages/call-logs';
import { RecordingsPage } from '@/pages/recordings';
import { SubscribersPage } from '@/pages/subscribers';
import { SubscriberPortalPage } from '@/pages/subscriber-portal';
import { TG400Page } from '@/pages/tg400';
import { AsteriskPage } from '@/pages/asterisk';
import { ReportsPage } from '@/pages/reports';
import { PermissionsPage } from '@/pages/permissions';
import { CompanySettingsPage } from '@/pages/company-settings';
import { NotFoundPage } from '@/pages/not-found';
import { VpnPage } from '@/pages/vpn';
import AdminTicketsPage from '@/pages/admin-tickets';
import PushNotificationsPage from '@/pages/push-notifications';
import WhatsappPage from '@/pages/whatsapp';

function RootRedirect() {
  const host = window.location.hostname;
  if (host === 'user.albarq.app') {
    return <Navigate to="/my" replace />;
  }
  return <Navigate to="/dashboard" replace />;
}

export function App() {
  return (
    <Routes>
        <Route path="/my" element={<SubscriberPortalPage />} />
      <Route path="/login" element={<LoginPage />} />
      <Route
        element={
          <ProtectedRoute>
            <AppLayout />
          </ProtectedRoute>
        }
      >
        <Route path="/dashboard" element={<DashboardPage />} />
        <Route path="/live-calls" element={<ProtectedRoute module="live_calls"><LiveCallsPage /></ProtectedRoute>} />
        <Route path="/call-transfer" element={<ProtectedRoute module="call_transfer"><CallTransferPage /></ProtectedRoute>} />
        <Route path="/subscribers" element={<ProtectedRoute module="subscribers"><SubscribersPage /></ProtectedRoute>} />
        <Route path="/subscribers/:id" element={<ProtectedRoute module="subscribers"><SubscribersPage /></ProtectedRoute>} />
        <Route path="/admin-tickets" element={<ProtectedRoute><AdminTicketsPage /></ProtectedRoute>} />
        <Route path="/push-notifications" element={<ProtectedRoute><PushNotificationsPage /></ProtectedRoute>} />
        <Route path="/whatsapp" element={<ProtectedRoute><WhatsappPage /></ProtectedRoute>} />
        <Route path="/agents" element={<ProtectedRoute module="agents"><AgentsPage /></ProtectedRoute>} />
        <Route path="/departments" element={<ProtectedRoute module="departments"><DepartmentsPage /></ProtectedRoute>} />
        <Route path="/queues" element={<ProtectedRoute module="queues"><QueuesPage /></ProtectedRoute>} />
        <Route path="/reports" element={<ProtectedRoute module="reports"><ReportsPage /></ProtectedRoute>} />
        <Route path="/ivr" element={<ProtectedRoute module="ivr"><IVRPage /></ProtectedRoute>} />
        <Route path="/voice-prompts" element={<ProtectedRoute module="voice_prompts"><VoicePromptsPage /></ProtectedRoute>} />
        <Route path="/call-logs" element={<ProtectedRoute module="call_logs"><CallLogsPage /></ProtectedRoute>} />
        <Route path="/recordings" element={<ProtectedRoute module="recordings"><RecordingsPage /></ProtectedRoute>} />
        <Route path="/tg400" element={<ProtectedRoute module="tg400"><TG400Page /></ProtectedRoute>} />
        <Route path="/asterisk" element={<ProtectedRoute module="asterisk"><AsteriskPage /></ProtectedRoute>} />
        <Route path="/vpn" element={<ProtectedRoute module="vpn"><VpnPage /></ProtectedRoute>} />
        <Route path="/permissions" element={<ProtectedRoute module="permissions"><PermissionsPage /></ProtectedRoute>} />
        <Route path="/company-settings" element={<ProtectedRoute module="company_settings"><CompanySettingsPage /></ProtectedRoute>} />
      </Route>
      <Route path="/" element={<RootRedirect />} />
      <Route path="*" element={<NotFoundPage />} />
    </Routes>
  );
}
