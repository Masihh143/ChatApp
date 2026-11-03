import { useEffect, useRef, useState, useCallback } from 'react';
import ChatBubble from './ChatBubble';
import { MessageSkeleton } from './SkeletonLoader';
import VoiceRecorder from './VoiceRecorder';

/* ── Common emojis for picker (WhatsApp-style) ── */
const EMOJI_CATEGORIES = [
    ['😀', '😃', '😄', '😁', '😅', '😂', '🤣', '😊', '😇', '🙂', '😉', '😍', '🥰', '😘', '😗', '😋', '😛', '😜', '🤪', '😎'],
    ['👍', '👎', '👏', '🙌', '👋', '🤝', '🙏', '✌️', '🤞', '🤟', '🤘', '👌', '🤌', '🤙', '💪', '❤️', '🧡', '💛', '💚', '💙'],
    ['🔥', '⭐', '✨', '💫', '🌟', '🙈', '🙉', '🙊', '💯', '✅', '❌', '❗', '❓', '💬', '💭', '🗨️', '👀', '🎉', '🎊', '🙏'],
];

/* ── Doodle Avatar ── */
function DoodleAvatar({ name, size = 38, showOnline, isOnline: online }) {
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
        <div className="relative flex-shrink-0">
            <div
                className="rounded-full flex items-center justify-center font-bold doodle-avatar"
                style={{
                    width: size, height: size,
                    backgroundColor: p.bg, borderColor: p.border, color: p.color,
                    fontSize: size * 0.36, fontFamily: 'var(--font-hand)',
                }}
            >
                {initials}
            </div>
            {showOnline && (
                <div
                    className="absolute bottom-0 right-0 rounded-full"
                    style={{
                        width: size * 0.28,
                        height: size * 0.28,
                        backgroundColor: online ? 'var(--dd-sage)' : 'var(--dd-text-muted)',
                        border: '2px solid var(--dd-card)',
                    }}
                />
            )}
        </div>
    );
}

/* ── Typing indicator ── */
function TypingIndicator() {
    return (
        <div className="flex justify-start mb-2">
            <div
                className="rounded-2xl px-4 py-2.5 flex items-center gap-1.5"
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

/* ── Format last seen ── */
function formatLastSeen(dateStr) {
    if (!dateStr) return 'offline';
    const d = new Date(dateStr);
    const now = new Date();
    const diff = now - d;
    const mins = Math.floor(diff / 60000);
    if (mins < 1) return 'just now';
    if (mins < 60) return `${mins}m ago`;
    const hours = Math.floor(mins / 60);
    if (hours < 24) return `${hours}h ago`;
    return d.toLocaleDateString([], { month: 'short', day: 'numeric' });
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
    otherUserLastSeen = null,
    isOtherTyping = false,
    onForwardMessage,
    conversations = [],
    loading = false,
    onCallStart,
}) {
    const [text, setText] = useState('');
    const [file, setFile] = useState(null);
    const fileInputRef = useRef(null);
    const [loadingOlder, setLoadingOlder] = useState(false);
    const [replyingTo, setReplyingTo] = useState(null);
    const [emojiOpen, setEmojiOpen] = useState(false);
    const emojiPickerRef = useRef(null);
    const [forwardModal, setForwardModal] = useState(null); // message to forward
    const typingTimeoutRef = useRef(null);

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

    const handleForward = useCallback((message) => {
        setForwardModal(message);
    }, []);

    const handleForwardTo = useCallback((targetConversationId) => {
        if (forwardModal && onForwardMessage) {
            onForwardMessage(forwardModal._id, targetConversationId);
        }
        setForwardModal(null);
    }, [forwardModal, onForwardMessage]);

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
        const replyToId = replyingTo?._id || null;
        onSendMessage(text.trim(), file, replyToId);
        setText('');
        setFile(null);
        setReplyingTo(null);
        if (fileInputRef.current) fileInputRef.current.value = '';
    };

    const handleVoiceNote = useCallback((blob, duration) => {
        if (onSendMessage) {
            const file = new File([blob], `voice_note_${Date.now()}.webm`, { type: 'audio/webm;codecs=opus' });
            onSendMessage('', file, null, 'voice_note');
        }
    }, [onSendMessage]);

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
                <DoodleAvatar name={otherUser?.name} size={38} showOnline isOnline={otherUserOnline} />
                <div className="flex-1 min-w-0">
                    <div className="text-[16px] font-bold truncate"
                        style={{ fontFamily: 'var(--font-hand)', color: 'var(--dd-text)' }}>
                        {otherUser?.name || 'Friend'}
                    </div>
                    <div className="flex items-center gap-1.5 text-[11px]"
                        style={{ color: otherUserOnline ? 'var(--dd-sage)' : 'var(--dd-text-muted)', fontFamily: 'var(--font-sketch)' }}>
                        {isOtherTyping ? (
                            <span style={{ color: 'var(--dd-primary)' }}>typing...</span>
                        ) : otherUserOnline ? (
                            'online'
                        ) : (
                            `last seen ${formatLastSeen(otherUserLastSeen)}`
                        )}
                    </div>
                </div>

                {/* Call buttons */}
                <div className="flex items-center gap-1">
                    {onCallStart && (
                        <>
                            <button
                                onClick={() => onCallStart('voice')}
                                className="p-2 rounded-full cursor-pointer transition-colors wiggle"
                                style={{ color: 'var(--dd-text-secondary)', background: 'var(--dd-paper)' }}
                                onMouseOver={(e) => { e.currentTarget.style.color = 'var(--dd-sage)'; e.currentTarget.style.background = 'var(--dd-sage-soft)'; }}
                                onMouseOut={(e) => { e.currentTarget.style.color = 'var(--dd-text-secondary)'; e.currentTarget.style.background = 'var(--dd-paper)'; }}
                                title="Voice call"
                            >
                                <svg viewBox="0 0 24 24" width="18" height="18" fill="currentColor">
                                    <path d="M20.01 15.38c-1.23 0-2.42-.2-3.53-.56-.35-.12-.74-.03-1.01.24l-1.57 1.97c-2.83-1.35-5.48-3.9-6.89-6.83l1.95-1.66c.27-.28.35-.67.24-1.02-.37-1.11-.56-2.3-.56-3.53 0-.54-.45-.99-.99-.99H4.19C3.65 3 3 3.24 3 3.99 3 13.28 10.73 21 20.01 21c.71 0 .99-.63.99-1.18v-3.45c0-.54-.45-.99-.99-.99z" />
                                </svg>
                            </button>
                            <button
                                onClick={() => onCallStart('screen')}
                                className="p-2 rounded-full cursor-pointer transition-colors wiggle"
                                style={{ color: 'var(--dd-text-secondary)', background: 'var(--dd-paper)' }}
                                onMouseOver={(e) => { e.currentTarget.style.color = 'var(--dd-sky)'; e.currentTarget.style.background = 'var(--dd-sky-soft)'; }}
                                onMouseOut={(e) => { e.currentTarget.style.color = 'var(--dd-text-secondary)'; e.currentTarget.style.background = 'var(--dd-paper)'; }}
                                title="Screen share"
                            >
                                <svg viewBox="0 0 24 24" width="18" height="18" fill="currentColor">
                                    <path d="M20 18c1.1 0 1.99-.9 1.99-2L22 6c0-1.1-.9-2-2-2H4c-1.1 0-2 .9-2 2v10c0 1.1.9 2 2 2H0v2h24v-2h-4zM4 6h16v10H4V6z" />
                                </svg>
                            </button>
                        </>
                    )}
                </div>
            </div>

            {/* ═══ Messages ═══ */}
            <div
                ref={scrollContainerRef}
                onScroll={handleScroll}
                className="flex-1 overflow-y-auto px-[4%] md:px-[10%] py-3 doodle-bg"
            >
                {/* Skeleton loader */}
                {loading && messages.length === 0 && <MessageSkeleton count={6} />}

                {/* Load older messages button */}
                {hasMore && !loading && (
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
                    return (
                        <ChatBubble
                            key={m._id}
                            message={m}
                            isOwn={own}
                            onReply={handleReply}
                            onForward={onForwardMessage ? handleForward : undefined}
                            isMobile={isMobile}
                            otherUserName={otherUser?.name}
                        />
                    );
                })}

                {/* Typing indicator */}
                {isOtherTyping && <TypingIndicator />}

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

            {/* ═══ Forward Modal ═══ */}
            {forwardModal && (
                <div className="fixed inset-0 z-40 flex items-center justify-center" style={{ backgroundColor: 'rgba(0,0,0,0.4)' }}>
                    <div
                        className="sketch-card p-4 w-full max-w-[340px] mx-4 max-h-[60vh] flex flex-col"
                        style={{ backgroundColor: 'var(--dd-card)' }}
                    >
                        <div className="flex items-center justify-between mb-3">
                            <h3 className="text-lg font-bold" style={{ fontFamily: 'var(--font-hand)', color: 'var(--dd-primary)' }}>
                                Forward to...
                            </h3>
                            <button
                                onClick={() => setForwardModal(null)}
                                className="p-1 rounded-full cursor-pointer"
                                style={{ color: 'var(--dd-text-muted)' }}
                            >
                                <svg viewBox="0 0 24 24" width="20" height="20" fill="currentColor"><path d="M19 6.41L17.59 5 12 10.59 6.41 5 5 6.41 10.59 12 5 17.59 6.41 19 12 13.41 17.59 19 19 17.59 13.41 12z" /></svg>
                            </button>
                        </div>
                        <div className="overflow-y-auto flex-1">
                            {conversations.filter((c) => c._id !== conversation?._id).map((c) => {
                                const other = c.participants.find((p) => p._id !== user.id) || c.participants[0];
                                return (
                                    <div
                                        key={c._id}
                                        className="convo-item flex items-center gap-3 px-3 py-2.5 cursor-pointer"
                                        onClick={() => handleForwardTo(c._id)}
                                    >
                                        <DoodleAvatar name={other?.name} size={36} />
                                        <span className="text-[14px] font-semibold truncate" style={{ color: 'var(--dd-text)' }}>
                                            {other?.name}
                                        </span>
                                    </div>
                                );
                            })}
                            {conversations.filter((c) => c._id !== conversation?._id).length === 0 && (
                                <p className="text-center py-4" style={{ color: 'var(--dd-text-muted)', fontFamily: 'var(--font-sketch)' }}>
                                    No other conversations
                                </p>
                            )}
                        </div>
                    </div>
                </div>
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
                        accept="image/*,video/*,audio/*"
                        onChange={(e) => setFile(e.target.files?.[0] || null)}
                        className="hidden"
                    />
                </label>

                {/* Voice recorder */}
                <VoiceRecorder
                    onRecordingComplete={handleVoiceNote}
                    disabled={Boolean(text.trim() || file)}
                />

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
