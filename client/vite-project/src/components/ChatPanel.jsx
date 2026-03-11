import { useEffect, useRef, useState } from 'react';
import ChatBubble from './ChatBubble';

/* ── Avatar helper (same as sidebar) ── */
function Avatar({ name, size = 40 }) {
    const colors = [
        '#00a884', '#53bdeb', '#ff6b6b', '#d4a574',
        '#7c8db5', '#bf59cf', '#e8a838', '#25d366',
    ];
    const idx = name ? name.charCodeAt(0) % colors.length : 0;
    const initials = name
        ? name.split(' ').map((w) => w[0]).join('').slice(0, 2).toUpperCase()
        : '?';

    return (
        <div
            className="flex-shrink-0 rounded-full flex items-center justify-center font-medium"
            style={{
                width: size,
                height: size,
                backgroundColor: colors[idx],
                color: '#fff',
                fontSize: size * 0.38,
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
    const bottomRef = useRef(null);
    const fileInputRef = useRef(null);

    /* Auto-scroll to bottom when new messages arrive */
    useEffect(() => {
        bottomRef.current?.scrollIntoView({ behavior: 'smooth' });
    }, [messages]);

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

    /* ─── Empty state: no conversation selected ─── */
    if (!conversation) {
        return (
            <div
                className="flex flex-1 flex-col items-center justify-center select-none"
                style={{ backgroundColor: 'var(--wa-deeper)' }}
            >
                <div className="w-[320px] text-center">
                    {/* Illustration */}
                    <div className="mx-auto mb-6 w-20 h-20 rounded-full flex items-center justify-center"
                        style={{ backgroundColor: 'var(--wa-panel)' }}>
                        <svg viewBox="0 0 303 172" width="72" fill="none">
                            <path
                                d="M229.565 160.229c32.647-16.166 55.563-50.206 55.563-89.229C285.128 31.763 253.365 0 214.128 0c-30.674 0-57.162 19.465-67.128 46.712C136.934 19.465 110.446 0 79.772 0 40.535 0 8.772 31.763 8.772 71c0 39.023 22.916 73.063 55.563 89.229L147 172l82.565-11.771z"
                                fill="var(--wa-green)" fillOpacity=".08"
                            />
                        </svg>
                    </div>
                    <h2 className="text-2xl font-light mb-2.5"
                        style={{ color: 'var(--wa-text-primary)' }}>
                        ChatApp Web
                    </h2>
                    <p className="text-sm leading-relaxed"
                        style={{ color: 'var(--wa-text-muted)' }}>
                        Send and receive messages. Select a conversation from the sidebar to start chatting.
                    </p>
                    <div className="mt-8 flex items-center justify-center gap-1.5 text-xs"
                        style={{ color: 'var(--wa-text-muted)' }}>
                        <svg viewBox="0 0 10 12" width="10" fill="currentColor" opacity="0.5">
                            <path d="M5.008 0C2.444 0 .36 2.084.36 4.648v2.704C.36 9.916 2.444 12 5.008 12s4.648-2.084 4.648-4.648V4.648C9.656 2.084 7.572 0 5.008 0zm3.2 7.352c0 1.764-1.436 3.2-3.2 3.2s-3.2-1.436-3.2-3.2V4.648c0-1.764 1.436-3.2 3.2-3.2s3.2 1.436 3.2 3.2v2.704z" />
                        </svg>
                        End-to-end encrypted
                    </div>
                </div>
            </div>
        );
    }

    /* ─── Active conversation ─── */
    return (
        <div className="flex flex-1 flex-col h-full" style={{ backgroundColor: 'var(--wa-deeper)' }}>
            {/* ═══ Header ═══ */}
            <div
                className="flex items-center gap-3 px-3 py-2 flex-shrink-0"
                style={{
                    backgroundColor: 'var(--wa-header)',
                    borderBottom: '1px solid var(--wa-border)',
                }}
            >
                {/* Back button — visible on mobile only */}
                {isMobile && (
                    <button
                        onClick={onBack}
                        className="p-1 rounded-full transition-colors cursor-pointer mr-1"
                        style={{ color: 'var(--wa-text-secondary)' }}
                        onMouseOver={(e) => (e.currentTarget.style.color = 'var(--wa-green)')}
                        onMouseOut={(e) => (e.currentTarget.style.color = 'var(--wa-text-secondary)')}
                    >
                        <svg viewBox="0 0 24 24" width="22" height="22" fill="currentColor">
                            <path d="M20 11H7.83l5.59-5.59L12 4l-8 8 8 8 1.41-1.41L7.83 13H20v-2z" />
                        </svg>
                    </button>
                )}
                <Avatar name={otherUser?.name} size={38} />
                <div className="flex-1 min-w-0">
                    <div className="text-[15px] font-medium truncate"
                        style={{ color: 'var(--wa-text-primary)' }}>
                        {otherUser?.name || 'Conversation'}
                    </div>
                    <div className="text-[12px]" style={{ color: 'var(--wa-text-muted)' }}>
                        online
                    </div>
                </div>
                {/* Actions */}
                <div className="flex items-center gap-1">
                    <button className="p-2 rounded-full cursor-pointer"
                        style={{ color: 'var(--wa-text-secondary)' }}>
                        <svg viewBox="0 0 24 24" width="20" height="20" fill="currentColor">
                            <path d="M15.009 13.805h-.636l-.22-.219a5.184 5.184 0 001.256-3.386 5.207 5.207 0 10-5.207 5.208 5.183 5.183 0 003.385-1.255l.221.22v.635l4.004 3.999 1.194-1.195-3.997-4.007zm-4.808 0a3.6 3.6 0 110-7.202 3.6 3.6 0 010 7.202z" />
                        </svg>
                    </button>
                    <button className="p-2 rounded-full cursor-pointer"
                        style={{ color: 'var(--wa-text-secondary)' }}>
                        <svg viewBox="0 0 24 24" width="20" height="20" fill="currentColor">
                            <path d="M12 7a2 2 0 10-.001-4.001A2 2 0 0012 7zm0 2a2 2 0 10-.001 3.999A2 2 0 0012 9zm0 6a2 2 0 10-.001 3.999A2 2 0 0012 15z" />
                        </svg>
                    </button>
                </div>
            </div>

            {/* ═══ Messages Area ═══ */}
            <div className="chat-wallpaper flex-1 overflow-y-auto px-[5%] md:px-[12%] py-2">
                {messages.map((m, i) => {
                    const own = m.sender._id === user.id;
                    /* Show tail on first message or when sender changes */
                    const prevMsg = messages[i - 1];
                    const showTail = !prevMsg || prevMsg.sender._id !== m.sender._id;
                    return (
                        <ChatBubble key={m._id} message={m} isOwn={own} showTail={showTail} />
                    );
                })}
                <div ref={bottomRef} />
            </div>

            {/* ═══ File Preview ═══ */}
            {file && (
                <div
                    className="flex items-center gap-2 px-4 py-2 text-xs"
                    style={{
                        backgroundColor: 'var(--wa-panel)',
                        borderTop: '1px solid var(--wa-border)',
                        color: 'var(--wa-text-secondary)',
                    }}
                >
                    <span>📎 {file.name}</span>
                    <button
                        onClick={() => { setFile(null); if (fileInputRef.current) fileInputRef.current.value = ''; }}
                        className="ml-auto text-sm cursor-pointer"
                        style={{ color: 'var(--wa-danger)' }}
                    >
                        ✕
                    </button>
                </div>
            )}

            {/* ═══ Input Bar ═══ */}
            <form
                onSubmit={handleSubmit}
                className="flex items-center gap-2 px-3 py-2 flex-shrink-0"
                style={{
                    backgroundColor: 'var(--wa-panel)',
                    borderTop: '1px solid var(--wa-border)',
                }}
            >
                {/* Emoji placeholder */}
                <button type="button" className="p-1.5 rounded-full cursor-pointer flex-shrink-0"
                    style={{ color: 'var(--wa-text-secondary)' }}>
                    <svg viewBox="0 0 24 24" width="22" height="22" fill="currentColor">
                        <path d="M9.153 11.603c.795 0 1.44-.88 1.44-1.962s-.645-1.962-1.44-1.962-1.44.88-1.44 1.962.645 1.962 1.44 1.962zm5.694 0c.795 0 1.44-.88 1.44-1.962s-.645-1.962-1.44-1.962-1.44.88-1.44 1.962.645 1.962 1.44 1.962zM11.84 16.249c2.178 0 4.152-1.283 5.053-3.253H6.787c.9 1.97 2.875 3.253 5.053 3.253zM12 1.014C5.926 1.014 1.014 5.926 1.014 12S5.926 22.986 12 22.986 22.986 18.074 22.986 12 18.074 1.014 12 1.014zM12 21.5a9.5 9.5 0 110-19 9.5 9.5 0 010 19z" />
                    </svg>
                </button>

                {/* Attachment */}
                <label className="p-1.5 rounded-full cursor-pointer flex-shrink-0 transition-colors"
                    style={{ color: 'var(--wa-text-secondary)' }}
                    onMouseOver={(e) => (e.currentTarget.style.color = 'var(--wa-green)')}
                    onMouseOut={(e) => (e.currentTarget.style.color = 'var(--wa-text-secondary)')}
                >
                    <svg viewBox="0 0 24 24" width="22" height="22" fill="currentColor">
                        <path d="M1.816 15.556v.002c0 1.502.584 2.912 1.646 3.972s2.472 1.647 3.974 1.647a5.58 5.58 0 003.972-1.645l9.547-9.548c.769-.768 1.147-1.767 1.058-2.817-.079-.968-.548-1.927-1.319-2.698-1.594-1.592-4.068-1.711-5.517-.262l-7.916 7.915c-.881.881-.792 2.25.214 3.261.501.501 1.103.798 1.645.798.364 0 .724-.195 1.001-.472l4.531-4.527-.707-.708-4.536 4.533c-.147.147-.313.22-.504.22-.303 0-.694-.197-1.073-.576-.726-.726-.882-1.545-.436-1.993l7.915-7.916c1.056-1.056 3.08-.953 4.31.278.59.59.937 1.312.993 2.022.051.643-.185 1.313-.666 1.795L8.394 19.863a4.198 4.198 0 01-2.958 1.228c-1.12 0-2.171-.437-2.961-1.226a4.155 4.155 0 01-1.231-2.96c0-1.115.436-2.17 1.228-2.96L13.01 3.407l-.707-.707L1.764 13.236a5.58 5.58 0 00-1.644 3.972l.003.003-.307.345z" />
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
                    placeholder="Type a message"
                    className="flex-1 rounded-lg px-3 py-2 text-[14px]"
                    style={{
                        backgroundColor: 'var(--wa-input)',
                        color: 'var(--wa-text-primary)',
                        border: 'none',
                    }}
                    value={text}
                    onChange={(e) => setText(e.target.value)}
                />

                {/* Send button */}
                <button
                    type="submit"
                    className="p-2 rounded-full transition-colors cursor-pointer flex-shrink-0"
                    style={{ color: 'var(--wa-text-secondary)' }}
                    onMouseOver={(e) => (e.currentTarget.style.color = 'var(--wa-green)')}
                    onMouseOut={(e) => (e.currentTarget.style.color = 'var(--wa-text-secondary)')}
                >
                    <svg viewBox="0 0 24 24" width="22" height="22" fill="currentColor">
                        <path d="M1.101 21.757L23.8 12.028 1.101 2.3l.011 7.912 13.623 1.816-13.623 1.817-.011 7.912z" />
                    </svg>
                </button>
            </form>
        </div>
    );
}
