import { useEffect, useRef, useState, useCallback } from 'react';
import ChatBubble from './ChatBubble';

/* ── Common emojis for picker (WhatsApp-style) ── */
const EMOJI_CATEGORIES = [
    ['😀', '😃', '😄', '😁', '😅', '😂', '🤣', '😊', '😇', '🙂', '😉', '😍', '🥰', '😘', '😗', '😋', '😛', '😜', '🤪', '😎'],
    ['👍', '👎', '👏', '🙌', '👋', '🤝', '🙏', '✌️', '🤞', '🤟', '🤘', '👌', '🤌', '🤙', '💪', '❤️', '🧡', '💛', '💚', '💙'],
    ['🔥', '⭐', '✨', '💫', '🌟', '🙈', '🙉', '🙊', '💯', '✅', '❌', '❗', '❓', '💬', '💭', '🗨️', '👀', '🎉', '🎊', '🙏'],
];

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
    hasMore,
    loadOlderMessages,
    otherUserOnline = false,
}) {
    const [text, setText] = useState('');
    const [file, setFile] = useState(null);
    const fileInputRef = useRef(null);
    const [loadingOlder, setLoadingOlder] = useState(false);
    const [replyingTo, setReplyingTo] = useState(null);
    const [emojiOpen, setEmojiOpen] = useState(false);
    const emojiPickerRef = useRef(null);

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

    const handleLoadOlder = async () => {
        if (!loadOlderMessages || loadingOlder) return;
        setLoadingOlder(true);
        try {
            await loadOlderMessages();
        } finally {
            setLoadingOlder(false);
        }
    };

    const otherUser =
        conversation?.participants.find((p) => p._id !== user.id) || conversation?.participants[0];

    const handleReply = useCallback((message) => {
        setReplyingTo(message);
        setEmojiOpen(false);
    }, []);

    /* Close emoji picker on outside click */
    useEffect(() => {
        if (!emojiOpen) return;
        const fn = (e) => {
            if (emojiPickerRef.current && !emojiPickerRef.current.contains(e.target)) setEmojiOpen(false);
        };
        document.addEventListener('click', fn);
        return () => document.removeEventListener('click', fn);
    }, [emojiOpen]);

    const handleSubmit = (e) => {
        e.preventDefault();
        if (!text.trim() && !file) return;
        let finalText = text.trim();
        if (replyingTo) {
            const name = replyingTo.sender?._id === user.id ? 'You' : (otherUser?.name || 'Friend');
            const snippet = (replyingTo.text || '📎 Media').slice(0, 50) + ((replyingTo.text && replyingTo.text.length > 50) ? '…' : '');
            finalText = `↩ ${name}: ${snippet}\n\n${finalText}`.trim();
            setReplyingTo(null);
        }
        onSendMessage(finalText, file);
        setText('');
        setFile(null);
        if (fileInputRef.current) fileInputRef.current.value = '';
    };

    const insertEmoji = (emoji) => {
        setText((prev) => prev + emoji);
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
                        style={{ color: otherUserOnline ? 'var(--dd-sage)' : 'var(--dd-text-muted)', fontFamily: 'var(--font-sketch)' }}>
                        <span className="inline-block w-1.5 h-1.5 rounded-full"
                            style={{ backgroundColor: otherUserOnline ? 'var(--dd-sage)' : 'var(--dd-text-muted)' }} />
                        {otherUserOnline ? 'online' : 'offline'}
                    </div>
                </div>
            </div>

            {/* ═══ Messages ═══ */}
            <div
                ref={scrollContainerRef}
                onScroll={handleScroll}
                className="flex-1 overflow-y-auto px-[4%] md:px-[10%] py-3 doodle-bg"
            >
                {/* Load older messages button */}
                {hasMore && (
                    <div className="flex justify-center py-3">
                        <button
                            onClick={handleLoadOlder}
                            disabled={loadingOlder}
                            className="px-4 py-1.5 rounded-full text-[12px] cursor-pointer transition-all duration-200 wiggle"
                            style={{
                                background: 'var(--dd-lavender-soft)',
                                color: 'var(--dd-primary)',
                                border: '1.5px dashed var(--dd-lavender)',
                                fontFamily: 'var(--font-sketch)',
                            }}
                        >
                            {loadingOlder ? 'Loading...' : '↑ Load older messages'}
                        </button>
                    </div>
                )}
                {messages.map((m) => {
                    const own = m.sender._id === user.id;
                    return <ChatBubble key={m._id} message={m} isOwn={own} onReply={handleReply} isMobile={isMobile} />;
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

            {/* ═══ Reply preview bar ═══ */}
            {replyingTo && (
                <div
                    className="flex items-center gap-2 px-4 py-2 flex-shrink-0"
                    style={{
                        backgroundColor: 'var(--dd-reply-bar)',
                        borderTop: '1px dashed var(--dd-lavender)',
                        fontFamily: 'var(--font-sketch)',
                    }}
                >
                    <span className="text-lg" style={{ color: 'var(--dd-primary)' }}>↩</span>
                    <div className="flex-1 min-w-0">
                        <div className="text-[11px] font-bold" style={{ color: 'var(--dd-primary)' }}>
                            {replyingTo.sender?._id === user.id ? 'You' : (otherUser?.name || 'Friend')}
                        </div>
                        <div className="text-[12px] truncate" style={{ color: 'var(--dd-text-secondary)' }}>
                            {(replyingTo.text || '📎 Media').slice(0, 60)}{(replyingTo.text && replyingTo.text.length > 60) ? '…' : ''}
                        </div>
                    </div>
                    <button
                        type="button"
                        onClick={() => setReplyingTo(null)}
                        className="p-1 rounded-full cursor-pointer flex-shrink-0"
                        style={{ color: 'var(--dd-text-muted)' }}
                    >
                        <svg viewBox="0 0 24 24" width="18" height="18" fill="currentColor"><path d="M19 6.41L17.59 5 12 10.59 6.41 5 5 6.41 10.59 12 5 17.59 6.41 19 12 13.41 17.59 19 19 17.59 13.41 12z" /></svg>
                    </button>
                </div>
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
                className="flex items-center gap-2 px-3 py-2.5 flex-shrink-0 relative"
                style={{
                    backgroundColor: 'var(--dd-card)',
                    borderTop: '2px dashed var(--dd-border)',
                }}
            >
                {/* Emoji picker button + popover */}
                <div className="relative flex-shrink-0" ref={emojiPickerRef}>
                    <button
                        type="button"
                        onClick={(e) => { e.preventDefault(); setEmojiOpen((o) => !o); }}
                        className="p-2 rounded-full cursor-pointer transition-colors flex-shrink-0 wiggle"
                        style={{ color: emojiOpen ? 'var(--dd-primary)' : 'var(--dd-text-secondary)', background: emojiOpen ? 'var(--dd-lavender-soft)' : 'var(--dd-paper)' }}
                        aria-label="Emoji"
                    >
                        <svg viewBox="0 0 24 24" width="20" height="20" fill="currentColor">
                            <path d="M11.99 2C6.47 2 2 6.48 2 12s4.47 10 9.99 10C17.52 22 22 17.52 22 12S17.52 2 11.99 2zM12 20c-4.42 0-8-3.58-8-8s3.58-8 8-8 8 3.58 8 8-3.58 8-8 8zm3.5-9c.83 0 1.5-.67 1.5-1.5S16.33 8 15.5 8 14 8.67 14 9.5s.67 1.5 1.5 1.5zm-7 0c.83 0 1.5-.67 1.5-1.5S9.33 8 8.5 8 7 8.67 7 9.5 7.67 11 8.5 11zm3.5 6.5c2.33 0 4.31-1.46 5.11-3.5H6.89c.8 2.04 2.78 3.5 5.11 3.5z" />
                        </svg>
                    </button>
                    {emojiOpen && (
                        <div
                            className="absolute bottom-full left-0 mb-1 p-2 rounded-xl overflow-y-auto z-30"
                            style={{
                                width: '280px',
                                maxHeight: '220px',
                                backgroundColor: 'var(--dd-card)',
                                border: '2px dashed var(--dd-border)',
                                boxShadow: 'var(--dd-shadow-lg)',
                            }}
                            onClick={(e) => e.stopPropagation()}
                        >
                            {EMOJI_CATEGORIES.map((row, i) => (
                                <div key={i} className="flex flex-wrap gap-1 py-0.5">
                                    {row.map((emoji, j) => (
                                        <button
                                            key={j}
                                            type="button"
                                            className="w-8 h-8 flex items-center justify-center rounded-lg cursor-pointer text-lg hover:scale-110 transition-transform"
                                            style={{ background: 'var(--dd-paper)' }}
                                            onClick={() => insertEmoji(emoji)}
                                        >
                                            {emoji}
                                        </button>
                                    ))}
                                </div>
                            ))}
                        </div>
                    )}
                </div>

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
