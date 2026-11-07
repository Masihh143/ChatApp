// Shared persona constants (port of @persona-chat/shared).

export const SOCKET_EVENTS = {
    // client → server
    PERSONA_MESSAGE_SEND: 'persona:message:send',
    // server → client
    PERSONA_MESSAGE_CHUNK: 'persona:message:chunk',
    PERSONA_MESSAGE_COMPLETE: 'persona:message:complete',
    PERSONA_MESSAGE_ERROR: 'persona:message:error',
    PERSONA_TYPING_START: 'persona:typing:start',
    PERSONA_TYPING_STOP: 'persona:typing:stop',
    PERSONA_MESSAGE_PROACTIVE: 'persona:message:proactive',
};

// RAG tuning
export const RAG_TOP_K = Number(process.env.RAG_TOP_K ?? 5);
export const MEMORY_TOP_N = Number(process.env.MEMORY_TOP_N ?? 20);

// Proactive engine
export const PROACTIVE_REDIS_CHANNEL = process.env.PERSONA_PROACTIVE_CHANNEL ?? 'persona:proactive';
export const PROACTIVE_TICK_JOB_ID = 'persona-proactive-tick';
export const PERSONA_PROACTIVE_QUEUE = 'persona-proactive';

// Ingestion queue
export const PERSONA_INGESTION_QUEUE = 'chat-ingestion';
