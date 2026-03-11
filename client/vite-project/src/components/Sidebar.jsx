import { useState, useMemo } from 'react';

/* ── Avatar helper ── */
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

    /* Filter conversations & users by search query */
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
        <div className="flex flex-col h-full" style={{ backgroundColor: 'var(--wa-panel)' }}>
            {/* ─── Header ─── */}
            <div
                className="flex items-center justify-between px-4 py-2.5 flex-shrink-0"
                style={{
                    backgroundColor: 'var(--wa-header)',
                    borderRight: '1px solid var(--wa-border)',
                }}
            >
                <div className="flex items-center gap-3">
                    <Avatar name={user?.name} size={36} />
                    <span className="text-sm font-medium" style={{ color: 'var(--wa-text-primary)' }}>
                        {user?.name}
                    </span>
                </div>
                <button
                    onClick={onLogout}
                    className="p-1.5 rounded-full transition-colors cursor-pointer"
                    style={{ color: 'var(--wa-text-secondary)' }}
                    onMouseOver={(e) => (e.currentTarget.style.backgroundColor = 'var(--wa-hover)')}
                    onMouseOut={(e) => (e.currentTarget.style.backgroundColor = 'transparent')}
                    title="Logout"
                >
                    <svg viewBox="0 0 24 24" width="20" height="20" fill="currentColor">
                        <path d="M16 17v-3H9v-4h7V7l5 5-5 5M14 2a2 2 0 012 2v2h-2V4H5v16h9v-2h2v2a2 2 0 01-2 2H5a2 2 0 01-2-2V4a2 2 0 012-2h9z" />
                    </svg>
                </button>
            </div>

            {/* ─── Search Bar ─── */}
            <div className="px-2 py-1.5 flex-shrink-0" style={{ backgroundColor: 'var(--wa-panel)' }}>
                <div
                    className="flex items-center gap-3 rounded-lg px-3 py-1.5"
                    style={{ backgroundColor: 'var(--wa-input)' }}
                >
                    <svg
                        viewBox="0 0 24 24" width="16" height="16"
                        style={{ fill: 'var(--wa-text-muted)', flexShrink: 0 }}
                    >
                        <path d="M15.009 13.805h-.636l-.22-.219a5.184 5.184 0 001.256-3.386 5.207 5.207 0 10-5.207 5.208 5.183 5.183 0 003.385-1.255l.221.22v.635l4.004 3.999 1.194-1.195-3.997-4.007zm-4.808 0a3.6 3.6 0 110-7.202 3.6 3.6 0 010 7.202z" />
                    </svg>
                    <input
                        type="text"
                        placeholder="Search or start new chat"
                        value={search}
                        onChange={(e) => setSearch(e.target.value)}
                        className="flex-1 bg-transparent text-[13px] placeholder-opacity-70"
                        style={{
                            color: 'var(--wa-text-primary)',
                            '--tw-placeholder-opacity': 1,
                        }}
                    />
                </div>
            </div>

            {/* ─── Chat / User Lists ─── */}
            <div className="flex-1 overflow-y-auto">
                {/* Conversations */}
                {filteredConversations.map((c) => {
                    const other = c.participants.find((p) => p._id !== user.id) || c.participants[0];
                    const isActive = activeConversation?._id === c._id;

                    return (
                        <div
                            key={c._id}
                            className="conversation-item flex items-center gap-3 px-3 py-2.5 cursor-pointer"
                            style={{
                                backgroundColor: isActive ? 'var(--wa-active)' : 'transparent',
                                borderBottom: '1px solid var(--wa-border)',
                            }}
                            onClick={() => onOpenConversation(c)}
                        >
                            <Avatar name={other?.name} size={44} />
                            <div className="flex-1 min-w-0">
                                <div className="flex items-center justify-between">
                                    <span className="text-[15px] font-normal truncate"
                                        style={{ color: 'var(--wa-text-primary)' }}>
                                        {other?.name}
                                    </span>
                                    <span className="text-[11px] flex-shrink-0 ml-2"
                                        style={{ color: 'var(--wa-text-muted)' }}>
                                        {c.updatedAt && new Date(c.updatedAt).toLocaleDateString([], {
                                            month: 'short',
                                            day: 'numeric',
                                        })}
                                    </span>
                                </div>
                                <div className="text-[13px] truncate mt-0.5"
                                    style={{ color: 'var(--wa-text-muted)' }}>
                                    {other?.email}
                                </div>
                            </div>
                        </div>
                    );
                })}

                {/* Users section header */}
                {filteredUsers.length > 0 && (
                    <div className="px-4 py-2 text-xs font-medium uppercase tracking-wider"
                        style={{
                            color: 'var(--wa-green)',
                            backgroundColor: 'var(--wa-deeper)',
                            borderBottom: '1px solid var(--wa-border)',
                        }}>
                        All Users
                    </div>
                )}
                {filteredUsers.map((u) => (
                    <div
                        key={u._id}
                        className="conversation-item flex items-center gap-3 px-3 py-2.5 cursor-pointer"
                        style={{ borderBottom: '1px solid var(--wa-border)' }}
                        onClick={() => onSelectUser(u)}
                    >
                        <Avatar name={u.name} size={44} />
                        <div className="flex-1 min-w-0">
                            <div className="text-[15px] truncate"
                                style={{ color: 'var(--wa-text-primary)' }}>
                                {u.name}
                            </div>
                            <div className="text-[13px] truncate mt-0.5"
                                style={{ color: 'var(--wa-text-muted)' }}>
                                {u.email}
                            </div>
                        </div>
                    </div>
                ))}

                {/* Empty state */}
                {filteredConversations.length === 0 && filteredUsers.length === 0 && (
                    <div className="px-4 py-8 text-center text-sm"
                        style={{ color: 'var(--wa-text-muted)' }}>
                        {search ? 'No results found' : 'No conversations yet'}
                    </div>
                )}
            </div>
        </div>
    );
}
