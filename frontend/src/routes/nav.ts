import type { ModuleKey } from '@/types';
import {
  LayoutDashboard,
  PhoneCall,
  Users,
  Building2,
  ListOrdered,
  Network,
  AudioLines,
  ArrowRightLeft,
  ClipboardList,
  Mic,
  UserSearch,
  Signal,
  Server,
  BarChart3,
  ShieldCheck,
  Settings,
  MessageSquare,
  BellRing,
  MessageCircle,
  type LucideIcon,
} from 'lucide-react';

export type NavGroup = 'operations' | 'telephony' | 'management' | 'system';

export interface NavItem {
  module: ModuleKey;
  path: string;
  icon: LucideIcon;
  group: NavGroup;
}

export const NAV_ITEMS: NavItem[] = [
  { module: 'dashboard', path: '/dashboard', icon: LayoutDashboard, group: 'operations' },
  { module: 'live_calls', path: '/live-calls', icon: PhoneCall, group: 'operations' },
  { module: 'call_transfer', path: '/call-transfer', icon: ArrowRightLeft, group: 'operations' },
  { module: 'subscribers', path: '/subscribers', icon: UserSearch, group: 'operations' },
  { module: 'admin_tickets' as ModuleKey, path: '/admin-tickets', icon: MessageSquare, group: 'operations' },
  { module: 'push_notifications' as ModuleKey, path: '/push-notifications', icon: BellRing, group: 'operations' },
  { module: 'whatsapp' as ModuleKey, path: '/whatsapp', icon: MessageCircle, group: 'operations' },
  { module: 'whatsapp' as ModuleKey, path: '/whatsapp-inbox', icon: MessageSquare, group: 'operations' },

  { module: 'agents', path: '/agents', icon: Users, group: 'management' },
  { module: 'departments', path: '/departments', icon: Building2, group: 'management' },
  { module: 'queues', path: '/queues', icon: ListOrdered, group: 'management' },
  { module: 'reports', path: '/reports', icon: BarChart3, group: 'management' },

  { module: 'ivr', path: '/ivr', icon: Network, group: 'telephony' },
  { module: 'voice_prompts', path: '/voice-prompts', icon: AudioLines, group: 'telephony' },
  { module: 'call_logs', path: '/call-logs', icon: ClipboardList, group: 'telephony' },
  { module: 'recordings', path: '/recordings', icon: Mic, group: 'telephony' },
  { module: 'tg400', path: '/tg400', icon: Signal, group: 'telephony' },

  { module: 'asterisk', path: '/asterisk', icon: Server, group: 'system' },
  { module: 'vpn', path: '/vpn', icon: ShieldCheck, group: 'system' },
  { module: 'permissions', path: '/permissions', icon: ShieldCheck, group: 'system' },
  { module: 'company_settings', path: '/company-settings', icon: Settings, group: 'system' },
];

export const NAV_GROUP_ORDER: NavGroup[] = ['operations', 'telephony', 'management', 'system'];
