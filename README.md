# Call Center Albarq — مركز اتصال البرق

A complete, production-ready **call center management platform** for an ISP/company running **Asterisk + TG400 GSM Gateway**. Arabic-first (RTL), bilingual (AR/EN), with a full React frontend, a Node/Express/Prisma backend, real-time live calls over Socket.IO, and a mockable Asterisk AMI/ARI integration layer.

The whole system runs as a **safe public demo** on mock data — no real Asterisk, TG400, or SIP credentials required — yet the code is structured to connect to a real PBX by flipping a single environment variable.

> **Demo login:** `admin` / `admin123`

---

## Features

17 modules, all functional with seeded demo data:

| Module | Highlights |
| --- | --- |
| **Auth & RBAC** | JWT login, 6 roles (super_admin, manager, supervisor, agent, accountant, support), per-module view/create/edit/delete permissions |
| **Dashboard** | Calls today, active/answered/missed/waiting, online/busy agents, avg wait & talk time, charts |
| **Live Calls** | Real-time table fed by Socket.IO; answer / transfer / hold / hangup / note / open subscriber |
| **Agents** | CRUD, SIP extension/username/password, department, status, working hours, performance |
| **Departments** | CRUD, color, assigned agents |
| **Queues** | CRUD, ring strategy (ringall/linear/leastrecent/roundrobin), max wait, MoH, announcement |
| **IVR / Auto Attendant** | Menu builder, key→destination mapping, greeting prompt, timeout/invalid handling |
| **Voice Prompts** | Welcome / waiting / closed-hours / busy prompts, audio list |
| **Call Transfer** | Blind/attended, to agent/queue/external, transfer history |
| **Call Logs (CDR)** | Filter by date/agent/queue/number/status, pagination, CSV export, recording link |
| **Recordings** | Search, filter, audio player, download, delete |
| **Subscribers** | Lookup by phone, profile (PPPoE, package, status, debt, tickets) |
| **TG400 / GSM Lines** | 4 SIM slots, carrier, signal, routes, usage stats |
| **Asterisk Settings** | Server IP, SIP/RTP ports, AMI/ARI, trunk, extension range, recording path, safe reload |
| **Reports** | Agent & queue performance, peak hours, missed calls, callbacks |
| **Permissions** | Editable role × module matrix |
| **Company Settings** | Name, logo, theme color, language, business hours, holidays |

---

## Tech stack

**Frontend:** React 18 + Vite + TypeScript · TailwindCSS · shadcn/ui (Radix) · React Router · TanStack Query · i18next (RTL/LTR) · Recharts

**Backend:** Node.js + Express + TypeScript · Prisma ORM + MySQL · JWT auth + RBAC · Socket.IO · Swagger/OpenAPI · Zod validation

**Integration:** Asterisk gateway abstraction — `MockAsteriskGateway` (in-process simulator) and `LiveAsteriskGateway` (AMI/ARI integration scaffold)

**Infra:** Docker Compose (frontend, backend, MySQL, Redis)

---

## Quick start (Docker)

```bash
docker compose up --build
```

- Frontend: http://localhost:3000
- Backend API: http://localhost:4000/api
- Swagger UI: http://localhost:4000/api/docs

The backend auto-runs `prisma db push` and seeds demo data on first boot. Login with `admin` / `admin123`.

---

## Local development

### Frontend

```bash
cd frontend
npm install
npm run dev        # http://localhost:5173
```

The frontend ships with a built-in **mock API layer** (`src/api`) so it runs standalone with no backend — this is what powers the public demo.

### Backend

```bash
cd backend
cp .env.example .env          # adjust DATABASE_URL if needed
npm install
npx prisma generate
npx prisma db push            # create tables
npm run seed                  # seed demo data (admin/admin123)
npm run dev                   # http://localhost:4000
```

A MySQL instance is required. The fastest way:

```bash
docker run -d --name albarq-mysql \
  -e MYSQL_DATABASE=callcenter -e MYSQL_USER=albarq -e MYSQL_PASSWORD=albarqpass \
  -e MYSQL_ROOT_PASSWORD=rootpass -p 3306:3306 mysql:8.0
```

---

## API documentation

Interactive Swagger UI is served at **`/api/docs`** and the raw spec at **`/api/openapi.json`**.

Authenticate first:

```bash
curl -X POST http://localhost:4000/api/auth/login \
  -H 'Content-Type: application/json' \
  -d '{"username":"admin","password":"admin123"}'
```

Use the returned `token` as `Authorization: Bearer <token>` on all other endpoints. See [`docs/API.md`](docs/API.md) for the full route list.

---

## Architecture

```
frontend/   React + Vite SPA (mock API layer → ready to point at real backend)
backend/    Express REST API + Socket.IO
  src/
    asterisk/    Gateway abstraction (mock simulator + live AMI/ARI scaffold)
    controllers/ Per-module request handlers
    middleware/  auth (JWT), rbac (permissions), error handling
    routes/      All REST routes, permission-guarded
    seed/        Demo data seeder + role/permission matrix
    sockets/     Socket.IO server bridging gateway events
  prisma/        MySQL schema (users, roles, permissions, agents, extensions,
                 departments, queues, queue_members, ivr_menus, ivr_options,
                 voice_prompts, tg400_lines, calls, call_events, recordings,
                 subscribers, tickets, callbacks, settings, audit_logs,
                 notifications)
```

### Real-time

Live call and agent events stream over Socket.IO on channels `call:new`, `call:update`, `call:end`, `agent:update`. Clients authenticate with the JWT in `handshake.auth.token`.

### Going live with a real Asterisk

The app depends only on the `AsteriskGateway` interface. To connect a real PBX:

1. Set `ASTERISK_MODE=live` and `DEMO_MODE=false`.
2. Fill in AMI/ARI credentials in `.env`.
3. Implement the TODO-marked methods in `backend/src/asterisk/live.ts` (AMI socket on `:5038`, ARI REST/WebSocket on `:8088`).

No controller, route, or frontend change is required — the rest of the stack is gateway-agnostic.

---

## Demo safety

- Mock data only; no real credentials committed.
- SIP passwords are demo placeholders and masked in the UI by default.
- `DEMO_MODE=true` / `ASTERISK_MODE=mock` keep everything in-process with zero external connections.

---

## License

Demo/educational project for Call Center Albarq.
