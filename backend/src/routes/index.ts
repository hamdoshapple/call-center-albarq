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
import * as asterisk from '../controllers/asterisk.controller.js';
import * as reports from '../controllers/reports.controller.js';
import * as misc from '../controllers/misc.controller.js';

export const router = Router();

// ---------- Auth (public + protected) ----------
router.post('/auth/login', h(auth.login));
router.get('/auth/me', authenticate, h(auth.me));

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
router.get('/tg400', perm('tg400'), h(tg400.list));
router.post('/tg400', perm('tg400', 'create'), h(tg400.create));
router.put('/tg400/:id', perm('tg400', 'edit'), h(tg400.update));
router.delete('/tg400/:id', perm('tg400', 'delete'), h(tg400.remove));

// ---------- Subscribers ----------
router.get('/subscribers', perm('subscribers'), h(subscribers.search));
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
router.get('/asterisk/agent-statuses', perm('live_calls'), h(asterisk.agentStatuses));
router.get('/asterisk/parked-calls', perm('live_calls'), h(asterisk.parkedCalls));
router.get('/asterisk/held-calls', perm('live_calls'), h(asterisk.heldCalls));
router.post('/asterisk/reload', perm('asterisk', 'edit'), h(asterisk.reload));
router.post('/asterisk/control/:action', perm('live_calls', 'edit'), h(asterisk.control));

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

// ---------- Notifications ----------
router.get('/notifications', h(misc.listNotifications));
router.put('/notifications/:id/read', h(misc.markNotificationRead));

// ---------- Transfers & callbacks ----------
router.get('/transfers', perm('call_transfer'), h(misc.listTransfers));
router.get('/callbacks', perm('reports'), h(misc.listCallbacks));
