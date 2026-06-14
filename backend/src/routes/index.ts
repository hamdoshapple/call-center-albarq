import { Router } from 'express';
import { authenticate } from '../middleware/auth.js';
import { requirePermission as perm } from '../middleware/rbac.js';
import { asyncHandler as h } from '../utils/asyncHandler.js';

import * as auth from '../controllers/auth.controller.js';
import * as departments from '../controllers/departments.controller.js';
import * as agents from '../controllers/agents.controller.js';
import * as queues from '../controllers/queues.controller.js';
import * as ivr from '../controllers/ivr.controller.js';
import * as prompts from '../controllers/voicePrompts.controller.js';
import * as tg400 from '../controllers/tg400.controller.js';
import * as subscribers from '../controllers/subscribers.controller.js';
import * as recordings from '../controllers/recordings.controller.js';
import * as calls from '../controllers/calls.controller.js';
import * as subscriberPortal from '../controllers/subscriber-portal.controller.js';
import * as internalCaller from '../controllers/internal-caller.controller.js';
import * as asterisk from '../controllers/asterisk.controller.js';
import * as reports from '../controllers/reports.controller.js';
import * as misc from '../controllers/misc.controller.js';
import * as vpn from '../controllers/vpn.controller.js';
import * as dataSource from '../controllers/data-source.controller.js';
import * as subscriberApp from '../controllers/subscriber-app.controller.js';

export const router = Router();

// ---------- Auth (public + protected) ----------
router.post('/auth/login', h(auth.login));
router.post('/subscriber-portal/request-code', h(subscriberPortal.requestCode));
router.post('/subscriber-portal/login', h(subscriberPortal.login));
router.get('/subscriber-portal/me', h(subscriberPortal.me));
router.get('/subscriber-portal/accounts', h(subscriberPortal.accounts));
router.get('/subscriber-portal/accounts/:id/payments', h(subscriberPortal.accountPayments));
router.get('/subscriber-portal/app-config', h(subscriberPortal.appConfig));
router.get('/subscriber-portal/accounts/:id/tickets', h(subscriberPortal.listAccountTickets));
router.post('/subscriber-portal/accounts/:id/tickets', h(subscriberPortal.createAccountTicket));
router.get('/subscriber-portal/accounts/:id/tickets/:ticketId', h(subscriberPortal.getAccountTicket));
router.post('/subscriber-portal/accounts/:id/tickets/:ticketId/comments', h(subscriberPortal.addAccountTicketComment));

router.get('/internal/caller-name', h(internalCaller.callerName));
router.get('/auth/me', authenticate, h(auth.me));


// ---------- Subscriber App Public ----------
router.get('/subscriber-app/public-config', h(subscriberApp.getConfig));
router.get('/subscriber-app/public-banners', h(subscriberApp.listBanners));

// All routes below require authentication.
router.use(authenticate);

// ---------- Dashboard ----------
router.get('/dashboard/stats', perm('dashboard'), h(misc.dashboardStats));

// ---------- Departments ----------
router.get('/departments', perm('departments'), h(departments.list));
router.post('/departments', perm('departments', 'create'), h(departments.create));
router.put('/departments/:id', perm('departments', 'edit'), h(departments.update));
router.delete('/departments/:id', perm('departments', 'delete'), h(departments.remove));

// ---------- Agents ----------
router.get('/agents', perm('agents'), h(agents.list));
router.post('/agents', perm('agents', 'create'), h(agents.create));
router.put('/agents/:id', perm('agents', 'edit'), h(agents.update));
router.delete('/agents/:id', perm('agents', 'delete'), h(agents.remove));

// ---------- Queues ----------
router.get('/queues', perm('queues'), h(queues.list));
router.post('/queues', perm('queues', 'create'), h(queues.create));
router.put('/queues/:id', perm('queues', 'edit'), h(queues.update));
router.delete('/queues/:id', perm('queues', 'delete'), h(queues.remove));

// ---------- IVR ----------
router.get('/ivr', perm('ivr'), h(ivr.list));
router.post('/ivr', perm('ivr', 'create'), h(ivr.create));
router.put('/ivr/:id', perm('ivr', 'edit'), h(ivr.update));
router.post('/ivr/:id/apply', perm('ivr', 'edit'), h(ivr.apply));
router.delete('/ivr/:id', perm('ivr', 'delete'), h(ivr.remove));

// ---------- Voice prompts ----------
router.get('/voice-prompts', perm('voice_prompts'), h(prompts.list));
router.get('/voice-prompts/:fileName/audio', perm('voice_prompts'), h(prompts.audio));
router.post('/voice-prompts', perm('voice_prompts', 'create'), h(prompts.create));
router.post('/voice-prompts/upload', perm('voice_prompts', 'create'), prompts.uploadVoicePrompt, h(prompts.upload));
router.put('/voice-prompts/:id', perm('voice_prompts', 'edit'), h(prompts.update));
router.post('/voice-prompts/:id/apply', perm('voice_prompts', 'edit'), h(prompts.applyPrompt));
router.post('/voice-prompts/:id/set-moh', perm('voice_prompts', 'edit'), h(prompts.setAsMoh));
router.delete('/voice-prompts/:id', perm('voice_prompts', 'delete'), h(prompts.remove));

// ---------- TG400 lines ----------
router.get('/tg400/live', perm('tg400'), h(tg400.live));
router.get('/tg400', perm('tg400'), h(tg400.list));
router.post('/tg400', perm('tg400', 'create'), h(tg400.create));
router.put('/tg400/:id', perm('tg400', 'edit'), h(tg400.update));
router.delete('/tg400/:id', perm('tg400', 'delete'), h(tg400.remove));

// ---------- Data source / subscriber cache ----------
router.get('/data-source/status', perm('subscribers'), h(dataSource.status));
router.post('/data-source/refresh', perm('subscribers', 'edit'), h(dataSource.refresh));
router.put('/data-source/settings', perm('subscribers', 'edit'), h(dataSource.update));

// ---------- Subscribers ----------
router.get('/subscribers', perm('subscribers'), h(subscribers.search));
router.get('/subscribers-cache/status', perm('subscribers'), h(subscribers.cacheStatus));
router.post('/subscribers-cache/refresh', perm('subscribers', 'edit'), h(subscribers.refreshCache));
router.get('/subscribers/:id', perm('subscribers'), h(subscribers.getOne));
router.get('/subscribers/:id/tickets', perm('subscribers'), h(subscribers.getTickets));
router.post('/subscribers/:id/tickets', perm('subscribers', 'edit'), h(subscribers.createTicket));
router.put('/subscribers/:id/tickets/:ticketId/status', perm('subscribers', 'edit'), h(subscribers.updateTicketStatus));
router.post('/subscribers/:id/tickets/:ticketId/comments', perm('subscribers', 'edit'), h(subscribers.addTicketComment));
router.post('/subscribers', perm('subscribers', 'create'), h(subscribers.create));
router.put('/subscribers/:id', perm('subscribers', 'edit'), h(subscribers.update));

// ---------- Recordings ----------
router.get('/recordings', perm('recordings'), h(recordings.list));
router.get('/recordings/:id/audio', perm('recordings'), h(recordings.streamAudio));
router.get('/recordings/:id', perm('recordings'), h(recordings.getOne));
router.delete('/recordings/:id', perm('recordings', 'delete'), h(recordings.remove));

// ---------- Call logs / live ----------
router.get('/calls', perm('call_logs'), h(calls.listLogs));
router.get('/calls/live', perm('live_calls'), h(calls.getLive));
router.post('/calls/:id/note', perm('live_calls', 'edit'), h(calls.addNote));

// ---------- Asterisk (settings + control) ----------
router.get('/asterisk/settings', perm('asterisk'), h(asterisk.getSettings));
router.put('/asterisk/settings', perm('asterisk', 'edit'), h(asterisk.updateSettings));
router.get('/asterisk/status', perm('asterisk'), h(asterisk.connectionStatus));
router.get('/asterisk/simple-raw-settings', perm('asterisk'), h(asterisk.getDiscoveredSimpleRawSettings));
router.put('/asterisk/simple-raw-settings', perm('asterisk', 'edit'), h(asterisk.updateDiscoveredSimpleRawSettings));
router.get('/asterisk/raw/:file', perm('asterisk'), h(asterisk.readRawFile));
router.put('/asterisk/raw/:file', perm('asterisk', 'edit'), h(asterisk.writeRawFile));
router.get('/asterisk/agent-statuses', perm('live_calls'), h(asterisk.agentStatuses));
router.get('/asterisk/parked-calls', perm('live_calls'), h(asterisk.parkedCalls));
router.get('/asterisk/held-calls', perm('live_calls'), h(asterisk.heldCalls));
router.post('/asterisk/reload', perm('asterisk', 'edit'), h(asterisk.reload));

router.get('/asterisk/contacts', perm('asterisk'), h(asterisk.contacts));
router.get('/asterisk/contacts-json', perm('asterisk'), h(asterisk.contactsJson));
router.get('/asterisk/endpoints-json', perm('asterisk'), h(asterisk.endpointsJson));
router.get('/asterisk/queues-json', perm('asterisk'), h(asterisk.queuesJson));
router.get('/asterisk/channels-json', perm('asterisk'), h(asterisk.channelsJson));
router.get('/asterisk/endpoints', perm('asterisk'), h(asterisk.endpoints));
router.get('/asterisk/registrations', perm('asterisk'), h(asterisk.registrations));
router.get('/asterisk/transports', perm('asterisk'), h(asterisk.transports));
router.get('/asterisk/pjsip-settings', perm('asterisk'), h(asterisk.pjsipSettings));
router.get('/asterisk/channels', perm('asterisk'), h(asterisk.channels));
router.get('/asterisk/uptime', perm('asterisk'), h(asterisk.uptime));
router.get('/asterisk/queues', perm('asterisk'), h(asterisk.queues));
router.post('/asterisk/cli', perm('asterisk', 'edit'), h(asterisk.cli));
router.post('/asterisk/reload-pjsip', perm('asterisk', 'edit'), h(asterisk.reloadPjsip));
router.post('/asterisk/reload-dialplan', perm('asterisk', 'edit'), h(asterisk.reloadDialplan));

router.post('/asterisk/control/:action', perm('live_calls', 'edit'), h(asterisk.control));


// ---------- VPN / L2TP ----------
router.get('/vpn', perm('vpn'), h(vpn.list));
router.post('/vpn', perm('vpn', 'create'), h(vpn.create));
router.put('/vpn/:id', perm('vpn', 'edit'), h(vpn.update));
router.delete('/vpn/:id', perm('vpn', 'delete'), h(vpn.remove));
router.post('/vpn/:id/toggle', perm('vpn', 'edit'), h(vpn.toggle));
router.post('/vpn/:id/extend', perm('vpn', 'edit'), h(vpn.extend));
router.post('/vpn/generate-chap', perm('vpn', 'edit'), h(vpn.generateChap));
router.post('/vpn/restart-service', perm('vpn', 'edit'), h(vpn.restartService));
router.post('/vpn/:id/apply-routes', perm('vpn', 'edit'), h(vpn.applyRoutes));
router.get('/vpn/logs', perm('vpn'), h(vpn.logs));
router.get('/vpn/status', perm('vpn'), h(vpn.status));

// ---------- Reports ----------
router.get('/reports/agents', perm('reports'), h(reports.agentPerformance));
router.get('/reports/queues', perm('reports'), h(reports.queuePerformance));
router.get('/reports/peak-hours', perm('reports'), h(reports.peakHours));
router.get('/reports/missed-calls', perm('reports'), h(reports.missedCalls));
router.get('/reports/callbacks', perm('reports'), h(reports.callbacks));

// ---------- Permissions ----------
router.get('/permissions', perm('permissions'), h(misc.getPermissions));
router.put('/permissions', perm('permissions', 'edit'), h(misc.setPermission));

// ---------- Company settings ----------
router.get('/company', perm('company_settings'), h(misc.getCompany));
router.put('/company', perm('company_settings', 'edit'), h(misc.updateCompany));

// ---------- Subscriber App ----------
router.get('/subscriber-app/config', perm('company_settings'), h(subscriberApp.getConfig));
router.put('/subscriber-app/config', perm('company_settings','edit'), h(subscriberApp.updateConfig));
router.get('/subscriber-app/banners', perm('company_settings'), h(subscriberApp.listBanners));
router.post('/subscriber-app/banners', perm('company_settings','edit'), h(subscriberApp.createBanner));

router.delete('/subscriber-app/banners/:id', perm('company_settings','edit'), h(subscriberApp.deleteBanner));

router.post(
  '/subscriber-app/upload',
  perm('company_settings','edit'),
  subscriberApp.uploadSubscriberImage,
  h(subscriberApp.uploadImage)
);

router.delete(
  '/subscriber-app/upload',
  perm('company_settings','edit'),
  h(subscriberApp.deleteImage)
);


// ---------- Notifications ----------
router.get('/notifications', h(misc.listNotifications));
router.put('/notifications/:id/read', h(misc.markNotificationRead));

// ---------- Transfers & callbacks ----------
router.get('/transfers', perm('call_transfer'), h(misc.listTransfers));
router.get('/callbacks', perm('reports'), h(misc.listCallbacks));
