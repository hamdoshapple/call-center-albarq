# Call Center Albarq — API Reference

Base URL: `/api` · Auth: `Authorization: Bearer <token>` (except `POST /auth/login`).

Interactive docs: **`/api/docs`** (Swagger UI) · raw spec: **`/api/openapi.json`**.

All write routes are guarded by role permissions (`module.action`). `super_admin` bypasses all checks. A missing permission returns `403`; a missing/invalid token returns `401`.

## Auth
| Method | Path | Permission | Notes |
| --- | --- | --- | --- |
| POST | `/auth/login` | public | `{ username, password }` → `{ token, user }` |
| GET | `/auth/me` | authenticated | Current user + permission matrix |

## Dashboard
| GET | `/dashboard/stats` | `dashboard.view` | Aggregated KPIs |

## Departments
| GET | `/departments` | `departments.view` |
| POST | `/departments` | `departments.create` |
| PUT | `/departments/:id` | `departments.edit` |
| DELETE | `/departments/:id` | `departments.delete` |

## Agents
| GET | `/agents` | `agents.view` |
| POST | `/agents` | `agents.create` | Creates agent + SIP extension + queue membership |
| PUT | `/agents/:id` | `agents.edit` |
| DELETE | `/agents/:id` | `agents.delete` |

## Queues
| GET | `/queues` | `queues.view` |
| POST | `/queues` | `queues.create` |
| PUT | `/queues/:id` | `queues.edit` |
| DELETE | `/queues/:id` | `queues.delete` |

## IVR
| GET | `/ivr` | `ivr.view` |
| POST | `/ivr` | `ivr.create` | Menu + options |
| PUT | `/ivr/:id` | `ivr.edit` |
| DELETE | `/ivr/:id` | `ivr.delete` |

## Voice prompts
| GET | `/voice-prompts` | `voice_prompts.view` |
| POST | `/voice-prompts` | `voice_prompts.create` |
| PUT | `/voice-prompts/:id` | `voice_prompts.edit` |
| DELETE | `/voice-prompts/:id` | `voice_prompts.delete` |

## TG400 / GSM lines
| GET | `/tg400` | `tg400.view` |
| POST | `/tg400` | `tg400.create` |
| PUT | `/tg400/:id` | `tg400.edit` |
| DELETE | `/tg400/:id` | `tg400.delete` |

## Subscribers
| GET | `/subscribers?q=` | `subscribers.view` | Search by phone/name/PPPoE |
| GET | `/subscribers/:id` | `subscribers.view` | Profile + tickets |
| GET | `/subscribers/:id/tickets` | `subscribers.view` |
| POST | `/subscribers` | `subscribers.create` |
| PUT | `/subscribers/:id` | `subscribers.edit` |

## Recordings
| GET | `/recordings?search=&agentId=&from=` | `recordings.view` |
| GET | `/recordings/:id` | `recordings.view` |
| DELETE | `/recordings/:id` | `recordings.delete` |

## Calls
| GET | `/calls` | `call_logs.view` | Paginated CDR; filters `search,direction,disposition,agentId,queueId,from,to,page,pageSize` |
| GET | `/calls/live` | `live_calls.view` | Active/waiting calls from the Asterisk gateway |
| POST | `/calls/:id/note` | `live_calls.edit` | `{ note }` |

## Asterisk
| GET | `/asterisk/settings` | `asterisk.view` |
| PUT | `/asterisk/settings` | `asterisk.edit` |
| GET | `/asterisk/status` | `asterisk.view` | AMI/ARI/SIP connection status |
| POST | `/asterisk/reload` | `asterisk.edit` | Safe config reload |
| POST | `/asterisk/control/:action` | `live_calls.edit` | `action` = answer\|hangup\|hold\|unhold\|transfer; body `{ uniqueId, target?, attended? }` |

## Reports
| GET | `/reports/agents` | `reports.view` |
| GET | `/reports/queues` | `reports.view` |
| GET | `/reports/peak-hours` | `reports.view` |
| GET | `/reports/missed-calls` | `reports.view` |
| GET | `/reports/callbacks` | `reports.view` |

## Permissions
| GET | `/permissions` | `permissions.view` | Full role × module matrix |
| PUT | `/permissions` | `permissions.edit` | `{ role, module, actions[] }` |

## Company
| GET | `/company` | `company_settings.view` |
| PUT | `/company` | `company_settings.edit` |

## Notifications
| GET | `/notifications` | authenticated |
| PUT | `/notifications/:id/read` | authenticated |

## Transfers & callbacks
| GET | `/transfers` | `call_transfer.view` |
| GET | `/callbacks` | `reports.view` |

## Real-time (Socket.IO)
Connect with `io(url, { auth: { token } })`. Server emits:
- `call:new` — a new live call
- `call:update` — status/duration change
- `call:end` — call ended
- `agent:update` — agent status change
