import { useState, useMemo } from 'react';

/* ── Doodle Avatar ── */
function DoodleAvatar({ name, size = 42 }) {
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
                width: size,
                height: size,
                backgroundColor: p.bg,
                borderColor: p.border,
                color: p.color,
                fontSize: size * 0.36,
                fontFamily: 'var(--font-hand)',
            }}
        >
            {initials}
        </div>
    );
}

export default function Sidebar({
    user,
    allUsers,
    conversations,
    activeConversation,
    onSelectUser,
    onOpenConversation,
    onLogout,
}) {
    const [search, setSearch] = useState('');

    const filteredConversations = useMemo(() => {
        if (!search.trim()) return conversations;
        const q = search.toLowerCase();
        return conversations.filter((c) => {
            const other = c.participants.find((p) => p._id !== user.id) || c.participants[0];
            return other?.name?.toLowerCase().includes(q);
        });
    }, [conversations, search, user?.id]);

    const filteredUsers = useMemo(() => {
        if (!search.trim()) return allUsers;
        const q = search.toLowerCase();
        return allUsers.filter(
            (u) => u.name?.toLowerCase().includes(q) || u.email?.toLowerCase().includes(q)
        );
    }, [allUsers, search]);

    return (
        <div className="flex flex-col h-full" style={{ backgroundColor: 'var(--dd-sidebar)' }}>

            {/* ─── Header ─── */}
            <div className="relative flex items-center justify-between px-4 py-3 flex-shrink-0 scallop-border"
                style={{ backgroundColor: 'var(--dd-card)', borderBottom: '1px dashed var(--dd-border)' }}>
                <div className="flex items-center gap-3">
                    <DoodleAvatar name={user?.name} size={36} />
                    <div>
                        <div className="text-sm font-bold" style={{ color: 'var(--dd-text)', fontFamily: 'var(--font-hand)', fontSize: '18px' }}>
                            {user?.name}
                        </div>
                        <div className="text-[11px]" style={{ color: 'var(--dd-text-muted)', fontFamily: 'var(--font-sketch)' }}>
                            ✨ online & cozy
                        </div>
                    </div>
                </div>
                <button
                    onClick={onLogout}
                    className="p-2 rounded-full transition-all duration-200 cursor-pointer wiggle"
                    style={{ color: 'var(--dd-text-secondary)', background: 'var(--dd-paper)' }}
                    onMouseOver={(e) => {
                        e.currentTarget.style.color = 'var(--dd-danger)';
                        e.currentTarget.style.background = 'var(--dd-coral-soft)';
                    }}
                    onMouseOut={(e) => {
                        e.currentTarget.style.color = 'var(--dd-text-secondary)';
                        e.currentTarget.style.background = 'var(--dd-paper)';
                    }}
                    title="Sign out"
                >
                    <svg viewBox="0 0 24 24" width="18" height="18" fill="currentColor">
                        <path d="M16 17v-3H9v-4h7V7l5 5-5 5M14 2a2 2 0 012 2v2h-2V4H5v16h9v-2h2v2a2 2 0 01-2 2H5a2 2 0 01-2-2V4a2 2 0 012-2h9z" />
                    </svg>
                </button>
            </div>

            {/* ─── Search ─── */}
            <div className="px-3 py-2 flex-shrink-0" style={{ background: 'var(--dd-sidebar)' }}>
                <div className="flex items-center gap-2">
                    <input
                        type="text"
                        placeholder="🔍  Search friends..."
                        value={search}
                        onChange={(e) => setSearch(e.target.value)}
                        className="w-full px-4 py-2 text-[13px] doodle-input"
                        style={{ color: 'var(--dd-text)', fontFamily: 'var(--font-sketch)' }}
                    />
                </div>
            </div>

            {/* ─── Lists ─── */}
            <div className="flex-1 overflow-y-auto px-1 py-1">
                {/* Conversations */}
                {filteredConversations.map((c) => {
                    const other = c.participants.find((p) => p._id !== user.id) || c.participants[0];
                    const isActive = activeConversation?._id === c._id;

                    return (
                        <div
                            key={c._id}
                            className={`convo-item flex items-center gap-3 px-3 py-3 cursor-pointer ${isActive ? 'active' : ''}`}
                            onClick={() => onOpenConversation(c)}
                        >
                            <DoodleAvatar name={other?.name} size={44} />
                            <div className="flex-1 min-w-0">
                                <div className="flex items-center justify-between">
                                    <span className="text-[14px] font-semibold truncate"
                                        style={{ color: isActive ? 'var(--dd-primary)' : 'var(--dd-text)' }}>
                                        {other?.name}
                                    </span>
                                    <span className="text-[11px] flex-shrink-0 ml-2"
                                        style={{ color: 'var(--dd-text-muted)', fontFamily: 'var(--font-sketch)' }}>
                                        {c.updatedAt && new Date(c.updatedAt).toLocaleDateString([], { month: 'short', day: 'numeric' })}
                                    </span>
                                </div>
                                <div className="text-[12px] truncate mt-0.5"
                                    style={{ color: 'var(--dd-text-muted)' }}>
                                    {other?.email}
                                </div>
                            </div>
                        </div>
                    );
                })}

                {/* Users section */}
                {filteredUsers.length > 0 && (
                    <div className="px-4 py-2 mt-2 text-[12px] font-bold"
                        style={{
                            fontFamily: 'var(--font-hand)',
                            color: 'var(--dd-primary)',
                            fontSize: '16px',
                        }}>
                        ✦ People
                    </div>
                )}
                {filteredUsers.map((u) => (
                    <div
                        key={u._id}
                        className="convo-item flex items-center gap-3 px-3 py-3 cursor-pointer"
                        onClick={() => onSelectUser(u)}
                    >
                        <DoodleAvatar name={u.name} size={44} />
                        <div className="flex-1 min-w-0">
                            <div className="text-[14px] font-semibold truncate" style={{ color: 'var(--dd-text)' }}>
                                {u.name}
                            </div>
                            <div className="text-[12px] truncate mt-0.5" style={{ color: 'var(--dd-text-muted)' }}>
                                {u.email}
                            </div>
                        </div>
                    </div>
                ))}

                {filteredConversations.length === 0 && filteredUsers.length === 0 && (
                    <div className="px-4 py-10 text-center"
                        style={{ color: 'var(--dd-text-muted)', fontFamily: 'var(--font-hand)', fontSize: '18px' }}>
                        {search ? 'No matches found 🔍' : 'No chats yet! Start a conversation ✨'}
                    </div>
                )}
            </div>
        </div>
    );
}
