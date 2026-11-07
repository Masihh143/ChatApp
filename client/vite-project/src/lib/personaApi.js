// Persona-bot API + socket-event helpers for the main chat client.
// Reuses the main app's axios client (authClient) so there's one login.
// Base paths are relative to the client's /api prefix (see App.jsx authClient).

const SOCKET = {
    SEND: 'persona:message:send',
    CHUNK: 'persona:message:chunk',
    COMPLETE: 'persona:message:complete',
    ERROR: 'persona:message:error',
    TYPING_START: 'persona:typing:start',
    TYPING_STOP: 'persona:typing:stop',
    PROACTIVE: 'persona:message:proactive',
};

export const personaApi = {
    list: (c) => c.get('/persona'),
    get: (c, id) => c.get(`/persona/${id}`),
    create: (c, data) => c.post('/persona', data),
    delete: (c, id) => c.delete(`/persona/${id}`),
    updateProactivity: (c, id, data) => c.patch(`/persona/${id}/proactivity`, data),
    getOrCreateConversation: (c, personaId) => c.post(`/persona/conversations/${personaId}`),
    getMessages: (c, personaId, limit = 50) =>
        c.get(`/persona/conversations/${personaId}/messages?limit=${limit}`),
    uploadExport: (c, personaId, file) => {
        const fd = new FormData();
        fd.append('file', file);
        return c.post(`/persona/${personaId}/export`, fd, {
            headers: { 'Content-Type': 'multipart/form-data' },
        });
    },
    getExportStatus: (c, personaId) => c.get(`/persona/${personaId}/export/status`),
};

export { SOCKET as PERSONA_SOCKET };
