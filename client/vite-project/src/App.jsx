import { useEffect, useMemo, useState } from 'react';
import axios from 'axios';
import { io } from 'socket.io-client';
import './App.css';

const API_BASE = import.meta.env.VITE_API_BASE || 'http://localhost:5000';

function App() {
  const [token, setToken] = useState(null);
  const [user, setUser] = useState(null);
  const [isRegister, setIsRegister] = useState(false);
  const [authForm, setAuthForm] = useState({
    name: '',
    email: '',
    password: ''
  });

  const [conversations, setConversations] = useState([]);
  const [allUsers, setAllUsers] = useState([]);
  const [activeConversation, setActiveConversation] = useState(null);
  const [messages, setMessages] = useState([]);
  const [messageText, setMessageText] = useState('');
  const [file, setFile] = useState(null);

  const socket = useMemo(() => {
    if (!token) return null;
    return io(API_BASE, {
      auth: { token },
      transports: ['websocket']
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

  const authClient = useMemo(() => {
    const instance = axios.create({
      baseURL: `${API_BASE}/api`,
      headers: token ? { Authorization: `Bearer ${token}` } : {}
    });
    return instance;
  }, [token]);

  const handleAuthChange = (field, value) => {
    setAuthForm((prev) => ({ ...prev, [field]: value }));
  };

  const handleAuthSubmit = async (e) => {
    e.preventDefault();
    const path = isRegister ? '/auth/register' : '/auth/login';
    const payload = isRegister
      ? authForm
      : { email: authForm.email, password: authForm.password };

    const res = await axios.post(`${API_BASE}/api${path}`, payload);
    setToken(res.data.token);
    setUser(res.data.user);
  };

  const loadConversations = async () => {
    const res = await authClient.get('/conversations');
    setConversations(res.data);
  };

  const loadUsers = async () => {
    const res = await authClient.get('/users');
    setAllUsers(res.data);
  };

  useEffect(() => {
    if (!token) return;
    loadConversations();
    loadUsers();
  }, [token]);

  const ensureConversationWithUser = async (otherUser) => {
    // Check if conversation already exists locally
    const existing = conversations.find((c) =>
      c.participants.some((p) => p._id === otherUser._id)
    );
    if (existing) {
      await openConversation(existing);
      return;
    }

    // Create or fetch from backend
    const res = await authClient.post('/conversations', {
      otherUserId: otherUser._id
    });
    const convo = res.data;
    setConversations((prev) => {
      const has = prev.find((c) => c._id === convo._id);
      return has ? prev : [convo, ...prev];
    });
    await openConversation(convo);
  };

  const openConversation = async (conversation) => {
    setActiveConversation(conversation);
    if (socket) {
      socket.emit('conversation:join', conversation._id);
    }
    const res = await authClient.get(`/messages/${conversation._id}`);
    setMessages(res.data);
  };

  const handleSendMessage = async (e) => {
    e.preventDefault();
    if (!activeConversation || (!messageText && !file)) return;

    const formData = new FormData();
    if (messageText) formData.append('text', messageText);
    if (file) formData.append('media', file);

    const res = await authClient.post(
      `/messages/${activeConversation._id}`,
      formData,
      {
        headers: { 'Content-Type': 'multipart/form-data' }
      }
    );

    setMessages((prev) => [...prev, res.data]);
    setMessageText('');
    setFile(null);
  };

  if (!token) {
    return (
      <div className="flex h-screen w-screen bg-slate-900 text-slate-100">
        <div className="flex flex-1 items-center justify-center">
          <div className="w-full max-w-md rounded-xl bg-slate-900/70 p-8 shadow-lg ring-1 ring-slate-700">
            <div className="mb-6 text-center text-2xl font-semibold">
              {isRegister ? 'Create account' : 'Sign in'}
            </div>
            <form onSubmit={handleAuthSubmit}>
              {isRegister && (
                <div className="mb-4 flex flex-col gap-1 text-sm">
                  <label
                    htmlFor="name"
                    className="text-xs font-medium text-slate-300"
                  >
                    Name
                  </label>
                  <input
                    id="name"
                    className="rounded-md border border-slate-700 bg-slate-900 px-3 py-2 text-sm outline-none ring-0 focus:border-emerald-500 focus:ring-1 focus:ring-emerald-500"
                    value={authForm.name}
                    onChange={(e) => handleAuthChange('name', e.target.value)}
                    required
                  />
                </div>
              )}
              <div className="mb-4 flex flex-col gap-1 text-sm">
                <label
                  htmlFor="email"
                  className="text-xs font-medium text-slate-300"
                >
                  Email
                </label>
                <input
                  id="email"
                  type="email"
                  className="rounded-md border border-slate-700 bg-slate-900 px-3 py-2 text-sm outline-none ring-0 focus:border-emerald-500 focus:ring-1 focus:ring-emerald-500"
                  value={authForm.email}
                  onChange={(e) => handleAuthChange('email', e.target.value)}
                  required
                />
              </div>
              <div className="mb-6 flex flex-col gap-1 text-sm">
                <label
                  htmlFor="password"
                  className="text-xs font-medium text-slate-300"
                >
                  Password
                </label>
                <input
                  id="password"
                  type="password"
                  className="rounded-md border border-slate-700 bg-slate-900 px-3 py-2 text-sm outline-none ring-0 focus:border-emerald-500 focus:ring-1 focus:ring-emerald-500"
                  value={authForm.password}
                  onChange={(e) => handleAuthChange('password', e.target.value)}
                  required
                />
              </div>
              <div className="mt-2">
                <button
                  type="submit"
                  className="inline-flex w-full items-center justify-center rounded-full bg-emerald-500 px-4 py-2 text-sm font-semibold text-slate-900 shadow hover:bg-emerald-400"
                >
                  {isRegister ? 'Sign up' : 'Sign in'}
                </button>
              </div>
            </form>
            <div
              className="mt-4 cursor-pointer text-center text-xs text-slate-400 hover:text-emerald-400"
              onClick={() => setIsRegister((v) => !v)}
            >
              {isRegister
                ? 'Already have an account? Sign in'
                : "Don't have an account? Create one"}
            </div>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="flex h-screen w-screen bg-slate-900 text-slate-100">
      <aside className="hidden h-full max-w-xs flex-col border-r border-slate-800 bg-slate-900/80 md:flex md:w-1/3 lg:w-1/4">
        <div className="flex items-center justify-between border-b border-slate-800 px-4 py-3">
          <div className="text-sm font-semibold">{user?.name}</div>
          <button
            className="text-sm text-slate-400 hover:text-red-400"
            onClick={() => {
              setToken(null);
              setUser(null);
            }}
          >
            ⏏
          </button>
        </div>
        <div className="flex-1 overflow-y-auto">
          {allUsers.length > 0 && (
            <div className="border-b border-slate-800 px-4 pb-2 pt-3 text-xs font-semibold uppercase tracking-wide text-slate-400">
              Users
            </div>
          )}
          {allUsers.map((u) => (
            <div
              key={u._id}
              className="cursor-pointer border-b border-slate-800 px-4 py-2 text-sm hover:bg-slate-800/70"
              onClick={() => ensureConversationWithUser(u)}
            >
              <div className="font-medium">{u.name}</div>
              <div className="text-xs text-slate-400">{u.email}</div>
            </div>
          ))}

          {conversations.length > 0 && (
            <div className="border-b border-slate-800 px-4 pb-2 pt-3 text-xs font-semibold uppercase tracking-wide text-slate-400">
              Chats
            </div>
          )}
          {conversations.map((c) => {
            const other =
              c.participants.find((p) => p._id !== user.id) || c.participants[0];
            return (
              <div
                key={c._id}
                className={
                  'cursor-pointer border-b border-slate-800 px-4 py-3 text-sm transition-colors hover:bg-slate-800/70 ' +
                  (activeConversation?._id === c._id ? 'bg-slate-800' : '')
                }
                onClick={() => openConversation(c)}
              >
                <div className="mb-1 font-medium">{other?.name}</div>
                <div className="text-xs text-slate-400">
                  {new Date(c.updatedAt).toLocaleString()}
                </div>
              </div>
            );
          })}
          {conversations.length === 0 && (
            <div className="px-4 py-3 text-xs text-slate-400">
              No conversations yet. You can seed users and conversations via the
              backend.
            </div>
          )}
        </div>
      </aside>

      <section className="flex flex-1 flex-col bg-slate-950/90">
        {activeConversation ? (
          <>
            <header className="flex items-center justify-between border-b border-slate-800 px-4 py-3">
              <div className="text-sm font-semibold">
                {(
                  activeConversation.participants.find(
                    (p) => p._id !== user.id
                  ) || activeConversation.participants[0]
                )?.name || 'Conversation'}
              </div>
            </header>
            <div className="flex flex-1 flex-col gap-1 overflow-y-auto bg-slate-950/80 px-3 py-3">
              {messages.map((m) => {
                const own = m.sender._id === user.id;
                return (
                  <div
                    key={m._id}
                    className={
                      'flex text-xs ' + (own ? 'justify-end' : 'justify-start')
                    }
                  >
                    <div
                      className={
                        'flex max-w-[70%] flex-col gap-1 rounded-md px-2 py-1 ' +
                        (own
                          ? 'bg-emerald-600 text-slate-50'
                          : 'bg-slate-800 text-slate-100')
                      }
                    >
                      {m.mediaUrl && (
                        <>
                          {m.mediaType === 'video' ? (
                            <video
                              src={m.mediaUrl}
                              controls
                              className="max-w-[220px] rounded"
                            />
                          ) : (
                            <img
                              src={m.mediaUrl}
                              alt="attachment"
                              className="max-w-[220px] rounded"
                            />
                          )}
                        </>
                      )}
                      {m.text && <div className="whitespace-pre-wrap">{m.text}</div>}
                      <div className="self-end text-[10px] text-slate-300/80">
                        {new Date(m.createdAt).toLocaleTimeString()}
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
            <form
              className="flex items-center gap-2 border-t border-slate-800 bg-slate-900/90 px-3 py-2"
              onSubmit={handleSendMessage}
            >
              <label
                className="cursor-pointer text-lg text-slate-400 hover:text-emerald-400"
                htmlFor="file-input"
              >
                📎
              </label>
              <input
                id="file-input"
                type="file"
                accept="image/*,video/*"
                onChange={(e) => setFile(e.target.files?.[0] || null)}
                className="hidden"
              />
              <input
                type="text"
                placeholder="Type a message"
                className="flex-1 rounded-full border border-slate-700 bg-slate-900 px-3 py-2 text-sm text-slate-100 outline-none ring-0 focus:border-emerald-500 focus:ring-1 focus:ring-emerald-500"
                value={messageText}
                onChange={(e) => setMessageText(e.target.value)}
              />
              <button
                type="submit"
                className="inline-flex items-center justify-center rounded-full bg-emerald-500 px-4 py-2 text-xs font-semibold text-slate-900 hover:bg-emerald-400"
              >
                Send
              </button>
            </form>
          </>
        ) : (
          <div className="flex flex-1 items-center justify-center text-sm text-slate-400">
            Select a conversation from the left to start chatting.
          </div>
        )}
      </section>
    </div>
  );
}

export default App;
