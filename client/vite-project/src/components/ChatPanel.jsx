import { useEffect, useRef, useState, useCallback } from 'react';
import ChatBubble from './ChatBubble';

/* ── Doodle Avatar ── */
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
    const initials = name
        ? name.split(' ').map((w) => w[0]).join('').slice(0, 2).toUpperCase()
        : '?';

    return (
        <div
            className="flex-shrink-0 rounded-full flex items-center justify-center font-bold doodle-avatar"
            style={{
                width: size, height: size,
                backgroundColor: p.bg, borderColor: p.border, color: p.color,
                fontSize: size * 0.36, fontFamily: 'var(--font-hand)',
            }}
        >
            {initials}
        </div>
    );
}

export default function ChatPanel({
    user,
    conversation,
    messages,
    onSendMessage,
    onBack,
    isMobile,
}) {
    const [text, setText] = useState('');
    const [file, setFile] = useState(null);
    const fileInputRef = useRef(null);

    /* ── New message indicator ── */
    const messagesEndRef = useRef(null);
    const scrollContainerRef = useRef(null);
    const [isAtBottom, setIsAtBottom] = useState(true);
    const [newMsgCount, setNewMsgCount] = useState(0);
    const prevMsgLenRef = useRef(messages.length);

    const handleScroll = useCallback(() => {
        const el = scrollContainerRef.current;
        if (!el) return;
        const atBottom = el.scrollHeight - el.scrollTop - el.clientHeight < 60;
        setIsAtBottom(atBottom);
        if (atBottom) setNewMsgCount(0);
    }, []);

    useEffect(() => {
        const diff = messages.length - prevMsgLenRef.current;
        if (diff > 0) {
            if (isAtBottom) {
                messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
                setNewMsgCount(0);
            } else {
                setNewMsgCount((c) => c + diff);
            }
        }
        prevMsgLenRef.current = messages.length;
    }, [messages.length, isAtBottom]);

    useEffect(() => {
        messagesEndRef.current?.scrollIntoView({ behavior: 'instant' });
        setNewMsgCount(0);
        setIsAtBottom(true);
        prevMsgLenRef.current = messages.length;
    }, [conversation?._id]);

    const scrollToBottom = () => {
        messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
        setNewMsgCount(0);
    };

    const otherUser =
        conversation?.participants.find((p) => p._id !== user.id) || conversation?.participants[0];

    const handleSubmit = (e) => {
        e.preventDefault();
        if (!text.trim() && !file) return;
        onSendMessage(text, file);
        setText('');
        setFile(null);
        if (fileInputRef.current) fileInputRef.current.value = '';
    };

    /* ─── Empty state ─── */
    if (!conversation) {
        return (
            <div className="flex flex-1 flex-col items-center justify-center select-none doodle-bg">
                <div className="text-center max-w-[320px]">
                    <div className="text-6xl mb-4">💭</div>
                    <h2 className="text-2xl font-bold mb-2"
                        style={{ fontFamily: 'var(--font-hand)', color: 'var(--dd-primary)' }}>
                        Pick a friend!
                    </h2>
                    <p className="text-sm leading-relaxed"
                        style={{ color: 'var(--dd-text-secondary)', fontFamily: 'var(--font-sketch)' }}>
                        Select a conversation from the sidebar to start chatting. Your messages are safe and cozy here ✨
                    </p>
                    <div className="mt-6 text-lg opacity-30" style={{ fontFamily: 'var(--font-hand)' }}>
                        ✿ ☆ ♡ ✦
                    </div>
                </div>
            </div>
        );
    }

    /* ─── Active conversation ─── */
    return (
        <div className="flex flex-1 flex-col h-full" style={{ backgroundColor: 'var(--dd-cream)' }}>

            {/* ═══ Header ═══ */}
            <div className="relative flex items-center gap-3 px-4 py-2.5 flex-shrink-0"
                style={{
                    backgroundColor: 'var(--dd-card)',
                    borderBottom: '2px dashed var(--dd-border)',
                    boxShadow: 'var(--dd-shadow-sm)',
                }}>
                {isMobile && (
                    <button
                        onClick={onBack}
                        className="p-1 rounded-full cursor-pointer transition-colors"
                        style={{ color: 'var(--dd-primary)' }}
                    >
                        <svg viewBox="0 0 24 24" width="22" height="22" fill="currentColor">
                            <path d="M20 11H7.83l5.59-5.59L12 4l-8 8 8 8 1.41-1.41L7.83 13H20v-2z" />
                        </svg>
                    </button>
                )}
                <DoodleAvatar name={otherUser?.name} size={38} />
                <div className="flex-1 min-w-0">
                    <div className="text-[16px] font-bold truncate"
                        style={{ fontFamily: 'var(--font-hand)', color: 'var(--dd-text)' }}>
                        {otherUser?.name || 'Friend'}
                    </div>
                    <div className="flex items-center gap-1.5 text-[11px]"
                        style={{ color: 'var(--dd-sage)', fontFamily: 'var(--font-sketch)' }}>
                        <span className="inline-block w-1.5 h-1.5 rounded-full"
                            style={{ backgroundColor: 'var(--dd-sage)' }} />
                        online
                    </div>
                </div>
            </div>

            {/* ═══ Messages ═══ */}
            <div
                ref={scrollContainerRef}
                onScroll={handleScroll}
                className="flex-1 overflow-y-auto px-[4%] md:px-[10%] py-3 doodle-bg"
            >
                {messages.map((m) => {
                    const own = m.sender._id === user.id;
                    return <ChatBubble key={m._id} message={m} isOwn={own} />;
                })}
                <div ref={messagesEndRef} />
            </div>

            {/* ═══ New Message Indicator ═══ */}
            {newMsgCount > 0 && (
                <button
                    onClick={scrollToBottom}
                    className="absolute z-20 right-6 bottom-[72px] flex items-center gap-1.5 px-3.5 py-2 rounded-full cursor-pointer new-msg-pill transition-transform hover:scale-105"
                    style={{
                        background: 'var(--dd-primary)',
                        color: '#fff',
                        fontFamily: 'var(--font-hand)',
                        fontSize: '15px',
                        boxShadow: 'var(--dd-shadow-lg)',
                        border: '2px dashed rgba(255,255,255,0.3)',
                    }}
                >
                    <span className="font-bold">{newMsgCount} new</span>
                    <span>↓</span>
                </button>
            )}

            {/* ═══ File Preview ═══ */}
            {file && (
                <div className="flex items-center gap-2 px-4 py-2 text-[12px] flex-shrink-0"
                    style={{
                        backgroundColor: 'var(--dd-honey-soft)',
                        borderTop: '1px dashed var(--dd-honey)',
                        color: 'var(--dd-text-secondary)',
                        fontFamily: 'var(--font-sketch)',
                    }}>
                    <span>📎</span>
                    <span className="truncate">{file.name}</span>
                    <button
                        onClick={() => { setFile(null); if (fileInputRef.current) fileInputRef.current.value = ''; }}
                        className="ml-auto cursor-pointer text-sm"
                        style={{ color: 'var(--dd-danger)' }}
                    >
                        ✕
                    </button>
                </div>
            )}

            {/* ═══ Input Bar ═══ */}
            <form
                onSubmit={handleSubmit}
                className="flex items-center gap-2 px-3 py-2.5 flex-shrink-0"
                style={{
                    backgroundColor: 'var(--dd-card)',
                    borderTop: '2px dashed var(--dd-border)',
                }}
            >
                {/* Attachment */}
                <label className="p-2 rounded-full cursor-pointer transition-colors flex-shrink-0 wiggle"
                    style={{ color: 'var(--dd-text-secondary)', background: 'var(--dd-paper)' }}
                    onMouseOver={(e) => {
                        e.currentTarget.style.color = 'var(--dd-primary)';
                        e.currentTarget.style.background = 'var(--dd-lavender-soft)';
                    }}
                    onMouseOut={(e) => {
                        e.currentTarget.style.color = 'var(--dd-text-secondary)';
                        e.currentTarget.style.background = 'var(--dd-paper)';
                    }}
                >
                    <svg viewBox="0 0 24 24" width="20" height="20" fill="currentColor">
                        <path d="M16.5 6v11.5c0 2.21-1.79 4-4 4s-4-1.79-4-4V5a2.5 2.5 0 015 0v10.5c0 .83-.67 1.5-1.5 1.5s-1.5-.67-1.5-1.5V6H9v9.5a3 3 0 006 0V5c0-2.21-1.79-4-4-4S7 2.79 7 5v12.5c0 3.04 2.46 5.5 5.5 5.5s5.5-2.46 5.5-5.5V6h-1.5z" />
                    </svg>
                    <input
                        ref={fileInputRef}
                        type="file"
                        accept="image/*,video/*"
                        onChange={(e) => setFile(e.target.files?.[0] || null)}
                        className="hidden"
                    />
                </label>

                {/* Text input */}
                <input
                    type="text"
                    placeholder="Type something nice..."
                    className="flex-1 px-4 py-2.5 text-[14px] doodle-input"
                    style={{ color: 'var(--dd-text)' }}
                    value={text}
                    onChange={(e) => setText(e.target.value)}
                />

                {/* Send button */}
                <button
                    type="submit"
                    className="p-2.5 rounded-full cursor-pointer flex-shrink-0 transition-all duration-200 wiggle"
                    style={{
                        color: text.trim() || file ? '#fff' : 'var(--dd-text-muted)',
                        background: text.trim() || file ? 'var(--dd-primary)' : 'var(--dd-paper)',
                        boxShadow: text.trim() || file ? 'var(--dd-shadow-md)' : 'none',
                    }}
                >
                    <svg viewBox="0 0 24 24" width="20" height="20" fill="currentColor">
                        <path d="M2.01 21L23 12 2.01 3 2 10l15 2-15 2z" />
                    </svg>
                </button>
            </form>
        </div>
    );
}
