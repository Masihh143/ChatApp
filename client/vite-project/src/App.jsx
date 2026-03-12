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

    socket.on('connect', () => { });

    socket.on('message:new', (msg) => {
      setMessages((prev) => [...prev, msg]);
    });

    return () => {
      socket.disconnect();
    };
  }, [socket]);

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
      if (isMobile) setShowChat(true);
      if (socket) {
        socket.emit('conversation:join', conversation._id);
      }
      const res = await authClient.get(`/messages/${conversation._id}?limit=30`);
      setMessages(res.data.messages);
      setHasMore(res.data.hasMore);
    },
    [authClient, socket, isMobile]
  );

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

  /* ─── Mobile back handler ─── */
  const handleBack = useCallback(() => {
    setShowChat(false);
  }, []);

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
      <div className="h-screen w-screen overflow-hidden" style={{ backgroundColor: 'var(--dd-cream)' }}>
        {showChat && activeConversation ? (
          <div className="h-full w-full flex flex-col slide-in-right">
            <ChatPanel
              user={user}
              conversation={activeConversation}
              messages={messages}
              onSendMessage={handleSendMessage}
              onBack={handleBack}
              isMobile={true}
              hasMore={hasMore}
              loadOlderMessages={loadOlderMessages}
            />
          </div>
        ) : (
          <div className="h-full w-full slide-in-left">
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
        />
      </section>
    </div>
  );
}

export default App;
