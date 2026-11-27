const protectedOp = (summary, extra = {}) => ({ summary, tags: [summary.startsWith('Admin') ? 'Admin' : 'API'], ...extra,
  requestBody: { required: false, content: { 'application/json': { schema: { type: 'object', additionalProperties: true } } } },
  responses: { '200': { description: 'Successful response' }, '400': { description: 'Invalid request' }, '401': { description: 'Authentication required' }, '403': { description: 'Forbidden' }, '404': { description: 'Resource not found' } } });
const pathOp = (summary, parameter, extra = {}) => ({ ...protectedOp(summary), ...extra,
  parameters: [{ name: parameter, in: 'path', required: true, schema: { type: 'string' } }] });
const uploadNoteOp = {
  ...protectedOp('Admin upload note'),
  requestBody: {
    required: true,
    content: {
      'multipart/form-data': {
        schema: {
          type: 'object', required: ['file', 'title'],
          properties: { file: { type: 'string', format: 'binary' }, title: { type: 'string' },
            level: { type: 'string' }, language: { type: 'string' }, isPublished: { type: 'boolean' } },
        },
      },
    },
  },
};

export const openapiSpec = {
  openapi: '3.0.3',
  info: { title: 'TalkReady API', version: '1.0.0', description: 'TalkReady authentication, notes, practice, chat, and administration API.' },
  servers: [{ url: '/api/v1' }],
  components: { securitySchemes: { bearerAuth: { type: 'http', scheme: 'bearer', bearerFormat: 'JWT' } } },
  security: [{ bearerAuth: [] }],
  paths: {
    '/health': { get: { ...protectedOp('Health'), security: [] } },
    '/auth/register': { post: protectedOp('Register', { security: [] }) }, '/auth/login': { post: protectedOp('Login', { security: [] }) },
    '/auth/refresh': { post: protectedOp('Refresh access token', { security: [] }) }, '/auth/logout': { post: protectedOp('Log out', { security: [] }) },
    '/auth/me': { get: protectedOp('Get current user'), patch: protectedOp('Update current user') },
    '/sessions': { post: protectedOp('Create interview session') },
    '/sessions/{id}/next-question': { get: pathOp('Get the next question', 'id') },
    '/sessions/{id}/hint': { post: pathOp('Get a question hint', 'id') }, '/sessions/{id}/finish': { post: pathOp('Finish session', 'id') },
    '/sessions/{id}/answers': { post: pathOp('Submit an answer', 'id') }, '/sessions/{id}/report': { get: pathOp('Get session report', 'id') },
    '/sessions/{id}/retry': { post: pathOp('Retry a question', 'id') }, '/progress': { get: protectedOp('Get progress') },
    '/chat': { post: protectedOp('Chat with notes') }, '/chat/history': { get: protectedOp('Get chat history') },
    '/chat/sessions/{id}': { delete: pathOp('Delete chat session', 'id') },
    '/speech/transcribe': { post: { ...protectedOp('Transcribe an answer recording'), requestBody: { required: true, content: { 'multipart/form-data': { schema: { type: 'object', required: ['file'], properties: { file: { type: 'string', format: 'binary' } } } } } }, responses: { ...protectedOp('Transcribe an answer recording').responses, '413': { description: 'Audio exceeds 25 MB' }, '422': { description: 'Invalid audio or recording exceeds 60 seconds' }, '503': { description: 'Optional Whisper transcription is disabled' } } } },
    '/languages': { get: { ...protectedOp('List supported languages'), security: [] } },
    '/translations/{lang}': { get: pathOp('Get UI translations', 'lang', { security: [] }) },
    '/admin/ping': { get: protectedOp('Admin ping') },
    '/admin/settings/llm': {
      get: protectedOp('Admin LLM status', { responses: { '200': { description: 'LLM enablement and Ollama reachability' }, '401': { description: 'Authentication required' }, '403': { description: 'Admin role required' } } }),
      patch: { ...protectedOp('Admin enable or disable LLM'), requestBody: { required: true, content: { 'application/json': { schema: { type: 'object', required: ['enabled'], properties: { enabled: { type: 'boolean' } }, additionalProperties: false } } } }, responses: { '200': { description: 'LLM setting updated with service reachability' }, '400': { description: 'Invalid setting' }, '401': { description: 'Authentication required' }, '403': { description: 'Admin role required' } } },
    },
    '/admin/users': { get: protectedOp('Admin list users') }, '/admin/users/{id}': { patch: pathOp('Admin update user', 'id'), delete: pathOp('Admin deactivate user', 'id') },
    '/admin/notes': { get: protectedOp('Admin list notes'), post: protectedOp('Admin create note') },
    '/admin/notes/upload': { post: uploadNoteOp },
    '/admin/notes/{id}': { get: pathOp('Admin get note', 'id'), patch: pathOp('Admin update note', 'id'), delete: pathOp('Admin delete note', 'id') },
    '/admin/phrase-banks': { get: protectedOp('Admin list phrase banks'), post: protectedOp('Admin create phrase bank') },
    '/admin/phrase-banks/{category}': { get: pathOp('Admin get phrase bank', 'category'), patch: pathOp('Admin update phrase bank', 'category'), delete: pathOp('Admin delete phrase bank', 'category') },
    '/admin/translations/{lang}': { put: pathOp('Admin update translations', 'lang') }, '/admin/languages/{code}': { patch: pathOp('Admin enable or disable language', 'code') },
    '/admin/chat/flagged': { get: protectedOp('Admin list flagged chat answers') }, '/admin/chat/messages/{id}': { patch: pathOp('Admin review flagged chat answer', 'id') },
    '/admin/stats': { get: protectedOp('Admin analytics') }, '/admin/export/sessions.csv': { get: protectedOp('Admin export sessions as CSV') },
  },
};

export default openapiSpec;
