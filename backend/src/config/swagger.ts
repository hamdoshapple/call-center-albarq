// Minimal hand-written OpenAPI 3 document. Kept concise but covers auth and the
// main resource groups so the API is explorable via Swagger UI at /api/docs.
export const openApiDocument = {
  openapi: '3.0.3',
  info: {
    title: 'Call Center Albarq API',
    version: '1.0.0',
    description:
      'REST API for the Call Center Albarq platform. Authenticate via POST /api/auth/login (demo: admin / admin123), then pass the Bearer token. Live call/agent events stream over Socket.IO.',
  },
  servers: [{ url: '/api', description: 'API base path' }],
  components: {
    securitySchemes: {
      bearerAuth: { type: 'http', scheme: 'bearer', bearerFormat: 'JWT' },
    },
  },
  security: [{ bearerAuth: [] }],
  paths: {
    '/auth/login': {
      post: {
        tags: ['Auth'],
        summary: 'Login and obtain a JWT',
        security: [],
        requestBody: {
          required: true,
          content: {
            'application/json': {
              schema: {
                type: 'object',
                required: ['username', 'password'],
                properties: {
                  username: { type: 'string', example: 'admin' },
                  password: { type: 'string', example: 'admin123' },
                },
              },
            },
          },
        },
        responses: { 200: { description: 'Authenticated' }, 401: { description: 'Invalid credentials' } },
      },
    },
    '/auth/me': { get: { tags: ['Auth'], summary: 'Current user + permissions', responses: { 200: { description: 'OK' } } } },
    '/dashboard/stats': { get: { tags: ['Dashboard'], summary: 'Aggregated KPIs', responses: { 200: { description: 'OK' } } } },
    '/agents': {
      get: { tags: ['Agents'], summary: 'List agents', responses: { 200: { description: 'OK' } } },
      post: { tags: ['Agents'], summary: 'Create agent', responses: { 201: { description: 'Created' } } },
    },
    '/agents/{id}': {
      put: { tags: ['Agents'], summary: 'Update agent', parameters: [{ name: 'id', in: 'path', required: true, schema: { type: 'string' } }], responses: { 200: { description: 'OK' } } },
      delete: { tags: ['Agents'], summary: 'Delete agent', parameters: [{ name: 'id', in: 'path', required: true, schema: { type: 'string' } }], responses: { 204: { description: 'Deleted' } } },
    },
    '/departments': { get: { tags: ['Departments'], summary: 'List departments', responses: { 200: { description: 'OK' } } }, post: { tags: ['Departments'], summary: 'Create', responses: { 201: { description: 'Created' } } } },
    '/queues': { get: { tags: ['Queues'], summary: 'List queues', responses: { 200: { description: 'OK' } } }, post: { tags: ['Queues'], summary: 'Create', responses: { 201: { description: 'Created' } } } },
    '/ivr': { get: { tags: ['IVR'], summary: 'List IVR menus', responses: { 200: { description: 'OK' } } }, post: { tags: ['IVR'], summary: 'Create', responses: { 201: { description: 'Created' } } } },
    '/voice-prompts': { get: { tags: ['Voice Prompts'], summary: 'List prompts', responses: { 200: { description: 'OK' } } } },
    '/tg400': { get: { tags: ['TG400'], summary: 'List GSM lines', responses: { 200: { description: 'OK' } } } },
    '/subscribers': { get: { tags: ['Subscribers'], summary: 'Search subscribers (?q=)', responses: { 200: { description: 'OK' } } } },
    '/recordings': { get: { tags: ['Recordings'], summary: 'List recordings', responses: { 200: { description: 'OK' } } } },
    '/calls': { get: { tags: ['Calls'], summary: 'Paginated call logs (CDR)', responses: { 200: { description: 'OK' } } } },
    '/calls/live': { get: { tags: ['Calls'], summary: 'Active/waiting calls', responses: { 200: { description: 'OK' } } } },
    '/asterisk/status': { get: { tags: ['Asterisk'], summary: 'AMI/ARI connection status', responses: { 200: { description: 'OK' } } } },
    '/asterisk/settings': { get: { tags: ['Asterisk'], summary: 'Get settings', responses: { 200: { description: 'OK' } } }, put: { tags: ['Asterisk'], summary: 'Update settings', responses: { 200: { description: 'OK' } } } },
    '/asterisk/control/{action}': { post: { tags: ['Asterisk'], summary: 'Call control: answer|hangup|hold|unhold|transfer', parameters: [{ name: 'action', in: 'path', required: true, schema: { type: 'string' } }], responses: { 200: { description: 'OK' } } } },
    '/reports/agents': { get: { tags: ['Reports'], summary: 'Agent performance', responses: { 200: { description: 'OK' } } } },
    '/permissions': { get: { tags: ['Permissions'], summary: 'Role permission matrix', responses: { 200: { description: 'OK' } } } },
    '/company': { get: { tags: ['Company'], summary: 'Company settings', responses: { 200: { description: 'OK' } } } },
  },
};
