// PersonaChat — the AI persona conversation panel.
// Ported from feature/Persona_chat RN chat screen into the doodle web style.
// Streams Gemini replies chunk-by-chunk over the main app's socket.io connection
// and paces the reveal at the persona's typingSpeed so it reads as "typing".
import { useEffect, useRef, useState, useCallback } from 'react';
import { personaApi, PERSONA_SOCKET as SOCKET } from '../lib/personaApi';

/* ── Doodle avatar (matches Sidebar/ChatPanel) ── */
function DoodleAvatar({ name, size = 38 }) {
    const palettes = [
        { bg: 'var(--dd-lavender-soft)', border: 'var(--dd-lavender)', color: 'var(--dd-primary)' },
        { bg: 'var(--dd-coral-soft)', border: 'var(--dd-coral)', color: '#c0574a' },
        { bg: 'var(--dd-sage-soft)', border: 'var(--dd-sage)', color: '#5a8555' },
        { bg: 'var(--dd-sky-soft)', border: 'var(--dd-sky)', color: '#4a7fa0' },
        { bg: 'var(--dd-honey-soft)', border: 'var(--dd-honey)', color: '#a08040' },
        { bg: 'var(--dd-rose-soft)', border: 'var(--dd-rose)', color: '#b06a7a' },
    ];
    const idx = name ? name.charCodeAt(0) % palettes.length : 0;
    const p = palettes[idx];
    const initials = name ? name.split(' ').map((w) => w[0]).join('').slice(0, 2).toUpperCase() : '?';
    return (
        <div
            className="rounded-full flex items-center justify-center font-bold flex-shrink-0"
            style={{
                width: size, height: size,
                backgroundColor: p.bg, border: `2px solid ${p.border}`, color: p.color,
                fontSize: size * 0.36, fontFamily: 'var(--font-hand)',
            }}
        >
            {initials}
        </div>
    );
}

/* ── A single persona chat bubble (port of MessageBubble) ── */
function Bubble({ text, own, streaming }) {
    const style = own
        ? {
            backgroundColor: 'var(--dd-primary)', color: '#fff',
            borderRadius: '18px 18px 6px 18px', boxShadow: 'var(--dd-shadow-sm)',
        }
        : {
            backgroundColor: 'var(--dd-card)', color: 'var(--dd-text)',
            borderRadius: '18px 18px 18px 6px',
            border: '1.5px dashed var(--dd-border-sketch)', boxShadow: 'var(--dd-shadow-sm)',
        };
    return (
        <div className={`flex ${own ? 'justify-end' : 'justify-start'} mb-2`}>
            <div
                className="max-w-[78%] px-3.5 py-2 text-[14px] whitespace-pre-wrap break-words"
                style={{ ...style, fontFamily: 'var(--font-body)', lineHeight: 1.45 }}
            >
                {text}
                {streaming && <span className="opacity-60">▌</span>}
            </div>
        </div>
    );
}

/* ── Typing dots ── */
function TypingDots() {
    return (
        <div className="flex justify-start mb-2">
            <div
                className="px-4 py-2.5 flex items-center gap-1.5"
                style={{
                    backgroundColor: 'var(--dd-card)',
                    border: '1.5px dashed var(--dd-border-sketch)',
                    borderRadius: '18px 18px 18px 6px',
                    boxShadow: 'var(--dd-shadow-sm)',
                }}
            >
                <span className="typing-dot" style={{ animationDelay: '0s' }} />
                <span className="typing-dot" style={{ animationDelay: '0.15s' }} />
                <span className="typing-dot" style={{ animationDelay: '0.3s' }} />
            </div>
        </div>
    );
}

export default function PersonaChat({
    user,
    persona, // { _id, name, relationship, typingSpeed, proactivityConfig }
    socket,
    authClient,
    onBack,
    isMobile,
}) {
    const [messages, setMessages] = useState([]);
    const [inputText, setInputText] = useState('');
    const [isTyping, setIsTyping] = useState(false);
    const [streamingText, setStreamingText] = useState('');
    const [sending, setSending] = useState(false);
    const [initLoading, setInitLoading] = useState(true);
    const [error, setError] = useState('');
    const [proactivity, setProactivity] = useState(persona?.proactivityConfig ?? null);
    const [proactiveBusy, setProactiveBusy] = useState(false);

    const scrollRef = useRef(null);
    // The full reply streamed so far; `streamingText` chases it at typingSpeed.
    const streamBufferRef = useRef('');
    const revealTimerRef = useRef(null);
    const typingSpeed = persona?.typingSpeed && persona.typingSpeed > 0 ? persona.typingSpeed : 28;

    const startReveal = useCallback(() => {
        if (revealTimerRef.current) return;
        revealTimerRef.current = setInterval(() => {
            const target = streamBufferRef.current;
            setStreamingText((prev) => {
                if (prev.length >= target.length) return prev;
                const step = Math.max(1, Math.round(typingSpeed * 0.06));
                return target.slice(0, prev.length + step);
            });
        }, 60);
    }, [typingSpeed]);

    const stopReveal = useCallback(() => {
        if (revealTimerRef.current) {
            clearInterval(revealTimerRef.current);
            revealTimerRef.current = null;
        }
    }, []);

    /* ── Load conversation + history on mount, wire socket events ── */
    useEffect(() => {
        if (!persona) return;
        let mounted = true;

        (async () => {
            try {
                await personaApi.getOrCreateConversation(authClient, persona._id);
                const data = await personaApi.getMessages(authClient, persona._id, 50);
                if (mounted) setMessages(data.messages || []);
            } catch (e) {
                if (mounted) setError(e?.response?.data?.message ?? 'Failed to load chat');
            } finally {
                if (mounted) setInitLoading(false);
            }
        })();

        // Socket event handlers (scoped to this persona)
        const onTypingStart = () => {
            if (!mounted) return;
            streamBufferRef.current = '';
            setIsTyping(true);
        };
        const onChunk = ({ chunk }) => {
            if (!mounted) return;
            streamBufferRef.current += chunk;
            setIsTyping(false);
            startReveal();
        };
        const onComplete = ({ message }) => {
            if (!mounted) return;
            stopReveal();
            streamBufferRef.current = '';
            setStreamingText('');
            setMessages((prev) => [...prev, message]);
            setIsTyping(false);
            setSending(false);
        };
        const onProactive = ({ personaId, message }) => {
            if (!mounted) return;
            if (personaId !== persona._id) return;
            setMessages((prev) => [...prev, message]);
        };
        const onErr = ({ error: e }) => {
            if (!mounted) return;
            setError(e ?? 'Response failed');
            setStreamingText('');
            setIsTyping(false);
            setSending(false);
        };

        socket?.on(SOCKET.TYPING_START, onTypingStart);
        socket?.on(SOCKET.CHUNK, onChunk);
        socket?.on(SOCKET.COMPLETE, onComplete);
        socket?.on(SOCKET.PROACTIVE, onProactive);
        socket?.on(SOCKET.ERROR, onErr);

        return () => {
            mounted = false;
            stopReveal();
            socket?.off(SOCKET.TYPING_START, onTypingStart);
            socket?.off(SOCKET.CHUNK, onChunk);
            socket?.off(SOCKET.COMPLETE, onComplete);
            socket?.off(SOCKET.PROACTIVE, onProactive);
            socket?.off(SOCKET.ERROR, onErr);
        };
    }, [persona?._id, socket, authClient, startReveal, stopReveal]);

    /* ── Auto-scroll on new content ── */
    useEffect(() => {
        scrollRef.current?.scrollTo({
            top: scrollRef.current.scrollHeight,
            behavior: 'smooth',
        });
    }, [messages.length, streamingText, isTyping]);

    /* ── Send ── */
    const sendMessage = useCallback(() => {
        const text = inputText.trim();
        if (!text || sending || !socket) return;
        const nowIso = new Date().toISOString();
        const optimistic = { _id: `opt_${Date.now()}`, sender: 'user', text, createdAt: nowIso };
        setMessages((prev) => [...prev, optimistic]);
        setInputText('');
        setError('');
        setSending(true);
        socket.emit(SOCKET.SEND, { personaId: persona._id, text });
    }, [inputText, sending, socket, persona._id]);

    /* ── Toggle proactive engine ── */
    const toggleProactive = useCallback(async () => {
        if (!proactivity || proactiveBusy) return;
        setProactiveBusy(true);
        try {
            const res = await personaApi.updateProactivity(authClient, persona._id, {
                enabled: !proactivity.enabled,
            });
            setProactivity(res.data.proactivityConfig);
        } catch (e) {
            setError(e?.response?.data?.message ?? 'Could not update proactive settings');
        } finally {
            setProactiveBusy(false);
        }
    }, [proactivity, proactiveBusy, authClient, persona._id]);

    if (initLoading) {
        return (
            <div className="flex-1 flex items-center justify-center" style={{ backgroundColor: 'var(--dd-cream)' }}>
                <span className="text-4xl animate-pulse" style={{ fontFamily: 'var(--font-hand)', color: 'var(--dd-primary)' }}>
                    💭
                </span>
            </div>
        );
    }

    return (
        <div className="flex flex-1 flex-col h-full min-h-0" style={{ backgroundColor: 'var(--dd-cream)' }}>
            {/* ── Header ── */}
            <div
                className="relative flex items-center gap-3 px-4 py-2.5 flex-shrink-0"
                style={{
                    backgroundColor: 'var(--dd-card)',
                    borderBottom: '2px dashed var(--dd-border)',
                    boxShadow: 'var(--dd-shadow-sm)',
                }}
            >
                {isMobile && (
                    <button onClick={onBack} className="p-1 rounded-full cursor-pointer" style={{ color: 'var(--dd-primary)' }}>
                        <svg viewBox="0 0 24 24" width="22" height="22" fill="currentColor">
                            <path d="M20 11H7.83l5.59-5.59L12 4l-8 8 8 8 1.41-1.41L7.83 13H20v-2z" />
                        </svg>
                    </button>
                )}
                <DoodleAvatar name={persona?.name} size={38} />
                <div className="flex-1 min-w-0">
                    <div className="text-[16px] font-bold truncate" style={{ fontFamily: 'var(--font-hand)', color: 'var(--dd-text)' }}>
                        {persona?.name}
                    </div>
                    <div className="text-[11px] truncate" style={{ color: 'var(--dd-text-muted)', fontFamily: 'var(--font-sketch)' }}>
                        {persona?.relationship || 'persona'} ✦
                    </div>
                </div>

                {/* Proactive toggle */}
                {proactivity && (
                    <button
                        onClick={toggleProactive}
                        disabled={proactiveBusy}
                        className="flex items-center gap-1.5 px-3 py-1.5 rounded-full cursor-pointer transition-all duration-200"
                        style={{
                            background: proactivity.enabled ? 'var(--dd-lavender-soft)' : 'var(--dd-paper)',
                            border: `1.5px dashed ${proactivity.enabled ? 'var(--dd-lavender)' : 'var(--dd-border)'}`,
                            color: proactivity.enabled ? 'var(--dd-primary)' : 'var(--dd-text-muted)',
                            fontFamily: 'var(--font-sketch)',
                        }}
                        title="Toggle proactive messages"
                    >
                        <span className="text-sm">{proactivity.enabled ? '🔔' : '🔕'}</span>
                        <span className="text-[11px] font-semibold">
                            {proactivity.enabled ? `every ${proactivity.cadenceHours}h` : 'Proactive off'}
                        </span>
                    </button>
                )}
            </div>

            {/* ── Error banner ── */}
            {error && (
                <div
                    className="px-4 py-2 text-[12px] flex-shrink-0"
                    style={{ backgroundColor: 'var(--dd-coral-soft)', color: 'var(--dd-danger)', fontFamily: 'var(--font-sketch)' }}
                >
                    {error}
                </div>
            )}

            {/* ── Messages ── */}
            <div ref={scrollRef} className="flex-1 overflow-y-auto px-[6%] py-3 doodle-bg">
                {messages.length === 0 && !streamingText && !isTyping && (
                    <div className="flex flex-col items-center justify-center h-full select-none text-center">
                        <div className="text-5xl mb-3">💬</div>
                        <p className="text-sm" style={{ color: 'var(--dd-text-secondary)', fontFamily: 'var(--font-hand)' }}>
                            Say hello to {persona?.name || 'your persona'}!
                        </p>
                    </div>
                )}

                {messages.map((m) => (
                    <Bubble key={m._id} text={m.text} own={m.sender === 'user'} />
                ))}

                {streamingText ? <Bubble text={streamingText} own={false} streaming /> : null}
                {isTyping && !streamingText ? <TypingDots /> : null}
            </div>

            {/* ── Input bar ── */}
            <form
                onSubmit={(e) => { e.preventDefault(); sendMessage(); }}
                className="flex items-center gap-2 px-3 py-2.5 flex-shrink-0"
                style={{ backgroundColor: 'var(--dd-card)', borderTop: '2px dashed var(--dd-border)' }}
            >
                <input
                    type="text"
                    placeholder="Type something..."
                    className="flex-1 px-4 py-2.5 text-[14px] doodle-input"
                    style={{ color: 'var(--dd-text)' }}
                    value={inputText}
                    onChange={(e) => setInputText(e.target.value)}
                    maxLength={2000}
                />
                <button
                    type="submit"
                    disabled={!inputText.trim() || sending}
                    className="p-2.5 rounded-full cursor-pointer flex-shrink-0 transition-all duration-200"
                    style={{
                        color: inputText.trim() && !sending ? '#fff' : 'var(--dd-text-muted)',
                        background: inputText.trim() && !sending ? 'var(--dd-primary)' : 'var(--dd-paper)',
                        boxShadow: inputText.trim() && !sending ? 'var(--dd-shadow-md)' : 'none',
                        opacity: sending ? 0.6 : 1,
                    }}
                >
                    {sending ? (
                        <span className="block w-4 h-4 mx-auto rounded-full border-2 border-current border-t-transparent animate-spin" />
                    ) : (
                        <svg viewBox="0 0 24 24" width="20" height="20" fill="currentColor">
                            <path d="M2.01 21L23 12 2.01 3 2 10l15 2-15 2z" />
                        </svg>
                    )}
                </button>
            </form>
        </div>
    );
}
