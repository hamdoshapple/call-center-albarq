import express, { Router } from 'express';
import { listAdminTickets, getAdminTicket, createAdminTicket, replyAdminTicket, updateAdminTicket, listTicketDepartments, searchTicketSubscribers, listTicketUsers, getTicketTeam, inviteTicketUser, removeTicketUser, ticketProSummary, ticketProPresence, ticketProActivity, ticketProChecklist, ticketProChecklistToggle, ticketProTags, ticketProAddTag, ticketProRemoveTag, ticketProStartTimer, ticketProStopTimer, ticketProTimerStatus } from '../controllers/admin-tickets.controller.js';
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
import * as push from '../controllers/push.controller.js';
import * as whatsapp from '../controllers/whatsapp.controller.js';
import * as subscriberIdentity from '../controllers/subscriber-identity.controller.js';
import * as whatsappTwilio from '../controllers/whatsapp-twilio.controller.js';
import * as telegram from '../controllers/telegram.controller.js';

export const router = Router();

// ---------- Auth (public + protected) ----------
router.post('/auth/login', h(auth.login));
router.post('/subscriber-portal/request-code', h(subscriberPortal.requestCode));
router.post('/subscriber-portal/login', h(subscriberPortal.login));
router.get('/subscriber-portal/push/public-key', h(push.publicKey));
router.get('/employee/push/public-key', h(push.publicKey));
router.post('/subscriber-portal/push/subscribe', h(push.subscribe));
router.post('/employee/push/subscribe', h(push.employeeSubscribe));
router.get('/subscriber-portal/me', h(subscriberPortal.me));
router.get('/subscriber-portal/accounts', h(subscriberPortal.accounts));
router.get('/subscriber-portal/accounts/:id/payments', h(subscriberPortal.accountPayments));
router.get('/subscriber-portal/app-config', h(subscriberPortal.appConfig));
router.get('/subscriber-portal/accounts/:id/tickets', h(subscriberPortal.listAccountTickets));
router.post('/subscriber-portal/accounts/:id/tickets', h(subscriberPortal.createAccountTicket));
router.get('/subscriber-portal/accounts/:id/tickets/:ticketId', h(subscriberPortal.getAccountTicket));
router.post('/subscriber-portal/accounts/:id/tickets/:ticketId/comments', h(subscriberPortal.addAccountTicketComment));

router.get('/subscriber-identity/resolve', authenticate, h(subscriberIdentity.resolve));
router.post('/subscriber-identity/link', authenticate, h(subscriberIdentity.link));
router.get('/subscriber-identity/aliases', authenticate, h(subscriberIdentity.aliases));

router.get('/internal/caller-name', h(internalCaller.callerName));
router.get('/auth/me', authenticate, h(auth.me));


// ---------- Subscriber App Public ----------
router.get('/subscriber-app/public-config', h(subscriberApp.getConfig));
router.get('/subscriber-app/public-banners', h(subscriberApp.listBanners));

// ---------- Twilio WhatsApp Webhook Public ----------
router.post('/whatsapp-twilio/webhook', express.urlencoded({ extended: false }), h(whatsappTwilio.webhook));
router.post('/whatsapp-twilio/status-callback', express.urlencoded({ extended: false }), h(whatsappTwilio.statusCallback));
router.get('/whatsapp-twilio/media/:file', h(whatsappTwilio.mediaFile));

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
router.put('/subscribers-cache/settings', perm('subscribers', 'edit'), h(subscribers.updateCacheScheduleSettings));
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
router.get('/employee/calls', authenticate, h(calls.listLogs));
router.get('/employee/calls/live', authenticate, h(calls.getLive));
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


// ---------- WhatsApp ----------
router.get('/telegram/api-settings', h(telegram.getApi));
router.post('/telegram/api-settings', h(telegram.saveApi));
router.put('/telegram/api-settings', h(telegram.saveApi));
router.get('/telegram/sessions', h(telegram.list));
router.post('/telegram/sessions/start', h(telegram.start));
router.get('/telegram/sessions/:sessionId/status', h(telegram.status));
router.get('/telegram/sessions/:sessionId/qr', h(telegram.qr));
router.delete('/telegram/sessions/:sessionId', h(telegram.deleteSession));
router.put('/telegram/sessions/settings', h(telegram.updateSettings));
router.post('/telegram/sessions/settings', h(telegram.updateSettings));
router.post('/telegram/send', h(telegram.send));
router.get('/telegram/logs', h(telegram.logs));

router.get('/whatsapp/queue-settings', h(whatsapp.getQueueSettings));
router.put('/whatsapp/queue-settings', h(whatsapp.saveQueueSettings));
router.post('/whatsapp/queue-settings', h(whatsapp.saveQueueSettings));
router.get('/whatsapp/sessions', h(whatsapp.list));
router.post('/whatsapp/sessions/start', h(whatsapp.start));
router.get('/whatsapp/sessions/:sessionId/status', h(whatsapp.status));
router.get('/whatsapp/sessions/:sessionId/qr', h(whatsapp.qr));
router.post('/whatsapp/sessions/:sessionId/pair-code', h(whatsapp.pairCode));
router.post('/whatsapp/sessions/logout', h(whatsapp.logout));
router.delete('/whatsapp/sessions/:sessionId', h(whatsapp.deleteSession));
router.put('/whatsapp/sessions/settings', h(whatsapp.updateSettings));
router.post('/whatsapp/sessions/settings', h(whatsapp.updateSettings));
router.post('/whatsapp/send', h(whatsapp.send));
router.get('/whatsapp/logs', h(whatsapp.logs));


// ---------- Twilio WhatsApp Inbox ----------
router.get('/whatsapp-twilio/settings', h(whatsappTwilio.getSettings));
router.put('/whatsapp-twilio/settings', h(whatsappTwilio.saveSettings));
router.get('/whatsapp-twilio/conversations', h(whatsappTwilio.conversations));
router.get('/whatsapp-twilio/conversations/:id/profile', h(whatsappTwilio.conversationProfile));
router.get('/whatsapp-twilio/conversations/:id/messages', h(whatsappTwilio.messages));
router.post('/whatsapp-twilio/conversations/:id/reply', h(whatsappTwilio.reply));
router.post('/whatsapp-twilio/conversations/:id/read', h(whatsappTwilio.markRead));
router.get('/whatsapp-twilio/conversations/:id/team-state', h(whatsappTwilio.teamState));
router.post('/whatsapp-twilio/conversations/:id/team-presence', h(whatsappTwilio.teamPresence));
router.post('/whatsapp-twilio/conversations/:id/claim', h(whatsappTwilio.claimConversation));
router.post('/whatsapp-twilio/conversations/:id/unclaim', h(whatsappTwilio.unclaimConversation));
router.post('/whatsapp-twilio/conversations/:id/priority', h(whatsappTwilio.setConversationPriority));
router.post('/whatsapp-twilio/conversations/:id/team-typing', h(whatsappTwilio.teamTyping));
router.post('/whatsapp-twilio/conversations/:id/pin', h(whatsappTwilio.setConversationPinned));

// ---------- Push Notifications ----------
router.post('/employee/push/test', authenticate, h(push.employeeTestPush));
router.get('/push/stats', h(push.stats));
router.get('/push/subscribers', h(push.subscribers));
router.get('/push/logs', h(push.logs));
router.get('/push/settings', h(push.getSettings));
router.put('/push/settings', h(push.saveSettings));
router.post('/push/send', h(push.send));
router.post('/push/campaign-preview', h(push.campaignPreview));
router.post('/push/campaign-confirm', h(push.campaignConfirm));
router.post('/push-notifications/campaign-preview', h(push.campaignPreview));
router.post('/push-notifications/campaign-confirm', h(push.campaignConfirm));


router.get('/push/twilio-templates', h(push.twilioTemplates));
router.post('/push/twilio-templates/sync', h(push.syncTwilioTemplates));
router.put('/push/twilio-templates', h(push.saveTwilioTemplates));
router.post('/push/send-twilio-template', h(push.sendTwilioTemplate));

router.get('/push/campaign-jobs', h(push.campaignJobs));
router.get('/push/campaign-jobs/:id', h(push.campaignJob));
router.post('/push/campaign-jobs/:id/cancel', h(push.cancelCampaignJob));
router.post('/push/campaign-jobs/:id/pause', h(push.pauseCampaignJob));
router.post('/push/campaign-jobs/:id/resume', h(push.resumeCampaignJob));
router.post('/push/auto/expiry-debt', h(push.autoExpiryDebt));
router.post('/push/auto/finance', h(push.financeEventWatcher));
router.post('/push/auto/finance-events', h(push.financeEventWatcher));

// ---------- Notifications ----------
router.get('/notifications', h(misc.listNotifications));
router.put('/notifications/:id/read', h(misc.markNotificationRead));

// ---------- Transfers & callbacks ----------
router.get('/transfers', perm('call_transfer'), h(misc.listTransfers));
router.get('/callbacks', perm('reports'), h(misc.listCallbacks));
router.get('/admin-ticket-departments', listTicketDepartments);
router.get('/admin-ticket-subscribers', searchTicketSubscribers);
router.get('/admin-tickets-pro/summary', ticketProSummary);
router.get('/admin-tickets/users', listTicketUsers);
router.get('/admin-tickets', listAdminTickets);
router.post('/admin-tickets', createAdminTicket);
router.get('/admin-tickets/:id/presence', ticketProPresence);
router.post('/admin-tickets/:id/presence', ticketProPresence);
router.get('/admin-tickets/:id/activity', ticketProActivity);
router.get('/admin-tickets/:id/checklist', ticketProChecklist);
router.patch('/admin-tickets/:id/checklist/:itemId', ticketProChecklistToggle);
router.get('/admin-tickets/:id/tags', ticketProTags);
router.post('/admin-tickets/:id/tags', ticketProAddTag);
router.delete('/admin-tickets/:id/tags/:tag', ticketProRemoveTag);
router.post('/admin-tickets/:id/timer/start', ticketProStartTimer);
router.post('/admin-tickets/:id/timer/stop', ticketProStopTimer);
router.get('/admin-tickets/:id/timer', ticketProTimerStatus);
router.get('/admin-tickets/:id/team', getTicketTeam);
router.post('/admin-tickets/:id/team/invite', inviteTicketUser);
router.delete('/admin-tickets/:id/team/:userId', removeTicketUser);
router.get('/admin-tickets/:id', getAdminTicket);
router.post('/admin-tickets/:id/replies', replyAdminTicket);
router.patch('/admin-tickets/:id', updateAdminTicket);



// Push campaign preview routes

