import { useCallback, useEffect, useMemo, useState } from 'react';
import axios from 'axios';
import { io } from 'socket.io-client';
import './App.css';

import AuthScreen from './components/AuthScreen';
import Sidebar from './components/Sidebar';
import ChatPanel from './components/ChatPanel';

// In dev, you can set VITE_API_BASE (e.g. http://localhost:5000).
// In production (Render single service), use same-origin by default.
const API_BASE =
  import.meta.env.MODE === 'development'
    ? import.meta.env.VITE_API_BASE || 'http://localhost:5000'
    : '';

/* ── Responsive breakpoint ── */
const MOBILE_BREAKPOINT = 768;

function App() {
  /* ─── Auth state ─── */
  const [token, setToken] = useState(null);
  const [user, setUser] = useState(null);

  /* ─── Chat state ─── */
  const [conversations, setConversations] = useState([]);
  const [allUsers, setAllUsers] = useState([]);
  const [activeConversation, setActiveConversation] = useState(null);
  const [messages, setMessages] = useState([]);
  const [hasMore, setHasMore] = useState(false);
  const [otherUserOnline, setOtherUserOnline] = useState(false);

  /* ─── Responsive state ─── */
  const [isMobile, setIsMobile] = useState(window.innerWidth < MOBILE_BREAKPOINT);
  const [showChat, setShowChat] = useState(false); // mobile: sidebar vs chat

  /* ─── Theme state ─── */
  const [theme, setTheme] = useState(() => {
    return localStorage.getItem('chatapp-theme') || 'light';
  });

  useEffect(() => {
    document.documentElement.setAttribute('data-theme', theme);
    localStorage.setItem('chatapp-theme', theme);
  }, [theme]);

  const toggleTheme = useCallback(() => {
    setTheme((t) => (t === 'light' ? 'dark' : 'light'));
  }, []);

  /* ── Listen for resize ── */
  useEffect(() => {
    const handleResize = () => {
      setIsMobile(window.innerWidth < MOBILE_BREAKPOINT);
    };
    window.addEventListener('resize', handleResize);
    return () => window.removeEventListener('resize', handleResize);
  }, []);

  /* ─── Socket.io ─── */
  const socket = useMemo(() => {
    if (!token) return null;
    return io(API_BASE || undefined, {
      auth: { token },
      transports: ['websocket'],
    });
  }, [token]);

  useEffect(() => {
    if (!socket) return;

    socket.on('connect', () => {});

    socket.on('message:new', (msg) => {
      setMessages((prev) => [...prev, msg]);
    });

    return () => {
      socket.disconnect();
    };
  }, [socket]);

  /* ─── Presence: online/offline for the other user in active conversation ─── */
  useEffect(() => {
    if (!socket || !activeConversation || !user?.id) return;
    const otherId = activeConversation.participants.find((p) => p._id !== user.id)?._id;
    const otherIdStr = otherId != null ? String(otherId) : null;
    setOtherUserOnline(false);

    const onPresence = ({ conversationId, onlineUserIds }) => {
      if (activeConversation._id !== conversationId || !otherIdStr) return;
      setOtherUserOnline(onlineUserIds.includes(otherIdStr));
    };
    const onPresenceUpdate = ({ userId, online }) => {
      if (String(userId) === otherIdStr) setOtherUserOnline(online);
    };

    socket.on('presence', onPresence);
    socket.on('presence:update', onPresenceUpdate);
    return () => {
      socket.off('presence', onPresence);
      socket.off('presence:update', onPresenceUpdate);
    };
  }, [socket, activeConversation?._id, user?.id]);

  /* ─── Axios client ─── */
  const authClient = useMemo(() => {
    return axios.create({
      baseURL: `${API_BASE}/api`,
      headers: token ? { Authorization: `Bearer ${token}` } : {},
    });
  }, [token]);

  /* ─── Data loaders ─── */
  const loadConversations = useCallback(async () => {
    const res = await authClient.get('/conversations');
    setConversations(res.data);
  }, [authClient]);

  const loadUsers = useCallback(async () => {
    const res = await authClient.get('/users');
    setAllUsers(res.data);
  }, [authClient]);

  useEffect(() => {
    if (!token) return;
    loadConversations();
    loadUsers();
  }, [token, loadConversations, loadUsers]);

  /* ─── Auth handler ─── */
  const handleAuth = async (isRegister, form) => {
    const path = isRegister ? '/auth/register' : '/auth/login';
    const payload = isRegister
      ? form
      : { email: form.email, password: form.password };

    const res = await axios.post(`${API_BASE}/api${path}`, payload);
    setToken(res.data.token);
    setUser(res.data.user);
  };

  /* ─── Conversation helpers ─── */
  const openConversation = useCallback(
    async (conversation) => {
      setActiveConversation(conversation);
      if (isMobile) {
        setShowChat(true);
        window.history.pushState({ chatScreen: true, conversationId: conversation._id }, '', window.location.pathname + window.location.search);
      }
      if (socket) {
        socket.emit('conversation:join', conversation._id);
      }
      const res = await authClient.get(`/messages/${conversation._id}?limit=30`);
      setMessages(res.data.messages);
      setHasMore(res.data.hasMore);
    },
    [authClient, socket, isMobile]
  );

  /* ─── Mobile: browser back should return to chat list ─── */
  useEffect(() => {
    if (!isMobile) return;
    const onPopState = () => {
      setShowChat(false);
    };
    window.addEventListener('popstate', onPopState);
    return () => window.removeEventListener('popstate', onPopState);
  }, [isMobile]);

  /* ─── Load older messages (pagination) ─── */
  const loadOlderMessages = useCallback(
    async () => {
      if (!activeConversation || !hasMore || messages.length === 0) return;
      const oldestId = messages[0]._id;
      const res = await authClient.get(
        `/messages/${activeConversation._id}?before=${oldestId}&limit=30`
      );
      setMessages((prev) => [...res.data.messages, ...prev]);
      setHasMore(res.data.hasMore);
    },
    [activeConversation, hasMore, messages, authClient]
  );

  const ensureConversationWithUser = useCallback(
    async (otherUser) => {
      const existing = conversations.find((c) =>
        c.participants.some((p) => p._id === otherUser._id)
      );
      if (existing) {
        await openConversation(existing);
        return;
      }

      const res = await authClient.post('/conversations', {
        otherUserId: otherUser._id,
      });
      const convo = res.data;
      setConversations((prev) => {
        const has = prev.find((c) => c._id === convo._id);
        return has ? prev : [convo, ...prev];
      });
      await openConversation(convo);
    },
    [conversations, openConversation, authClient]
  );

  /* ─── Message handler ─── */
  const handleSendMessage = useCallback(
    async (text, file) => {
      if (!activeConversation || (!text && !file)) return;

      const formData = new FormData();
      if (text) formData.append('text', text);
      if (file) formData.append('media', file);

      await authClient.post(
        `/messages/${activeConversation._id}`,
        formData,
        { headers: { 'Content-Type': 'multipart/form-data' } }
      );
      // Rely on Socket.IO 'message:new' event for live update
    },
    [activeConversation, authClient]
  );

  /* ─── Mobile back handler: use history so browser back goes to chat list ─── */
  const handleBack = useCallback(() => {
    if (isMobile && window.history.state?.chatScreen) {
      window.history.back();
    } else {
      setShowChat(false);
    }
  }, [isMobile]);

  /* ─── Logout ─── */
  const handleLogout = useCallback(() => {
    setToken(null);
    setUser(null);
    setActiveConversation(null);
    setConversations([]);
    setMessages([]);
    setHasMore(false);
    setShowChat(false);
  }, []);

  /* ═══════════════════════════════════════════════
   *  RENDER
   * ═══════════════════════════════════════════════ */

  /* Auth screen */
  if (!token) {
    return <AuthScreen onAuth={handleAuth} apiBase={API_BASE} theme={theme} toggleTheme={toggleTheme} />;
  }

  /* ── Mobile layout: show sidebar OR chat ── */
  if (isMobile) {
    return (
      <div
        className="w-screen overflow-hidden flex flex-col"
        style={{
          backgroundColor: 'var(--dd-cream)',
          minHeight: '100dvh',
          height: '100%',
          paddingTop: 'max(env(safe-area-inset-top, 0px), 12px)',
        }}
      >
        {showChat && activeConversation ? (
          <div className="flex-1 w-full flex flex-col min-h-0 slide-in-right">
            <ChatPanel
              user={user}
              conversation={activeConversation}
              messages={messages}
              onSendMessage={handleSendMessage}
              onBack={handleBack}
              isMobile={true}
              hasMore={hasMore}
              loadOlderMessages={loadOlderMessages}
              otherUserOnline={otherUserOnline}
            />
          </div>
        ) : (
          <div className="flex-1 w-full min-h-0 slide-in-left">
            <Sidebar
              user={user}
              allUsers={allUsers}
              conversations={conversations}
              activeConversation={activeConversation}
              onSelectUser={ensureConversationWithUser}
              onOpenConversation={openConversation}
              onLogout={handleLogout}
              theme={theme}
              toggleTheme={toggleTheme}
            />
          </div>
        )}
      </div>
    );
  }

  /* ── Desktop layout: sidebar + chat side by side ── */
  return (
    <div
      className="flex h-screen w-screen overflow-hidden"
      style={{ backgroundColor: 'var(--dd-cream)' }}
    >
      {/* Sidebar */}
      <aside
        className="flex-shrink-0 h-full overflow-hidden"
        style={{
          width: '30%',
          minWidth: '300px',
          maxWidth: '420px',
          borderRight: '2px dashed var(--dd-border)',
        }}
      >
        <Sidebar
          user={user}
          allUsers={allUsers}
          conversations={conversations}
          activeConversation={activeConversation}
          onSelectUser={ensureConversationWithUser}
          onOpenConversation={openConversation}
          onLogout={handleLogout}
          theme={theme}
          toggleTheme={toggleTheme}
        />
      </aside>

      {/* Chat area */}
      <section className="flex flex-1 flex-col h-full overflow-hidden">
        <ChatPanel
          user={user}
          conversation={activeConversation}
          messages={messages}
          onSendMessage={handleSendMessage}
          onBack={handleBack}
          isMobile={false}
          hasMore={hasMore}
          loadOlderMessages={loadOlderMessages}
          otherUserOnline={otherUserOnline}
        />
      </section>
    </div>
  );
}

export default App;
