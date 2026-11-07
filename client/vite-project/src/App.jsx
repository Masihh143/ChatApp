import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import axios from 'axios';
import { io } from 'socket.io-client';
import './App.css';

import AuthScreen from './components/AuthScreen';
import Sidebar from './components/Sidebar';
import ChatPanel from './components/ChatPanel';
import CallScreen from './components/CallScreen';
import PersonaChat from './components/PersonaChat';
import AddPersona from './components/AddPersona';
import { personaApi } from './lib/personaApi';

// In dev, you can set VITE_API_BASE (e.g. http://localhost:5000).
// In production (Render single service), use same-origin by default.
const API_BASE =
  import.meta.env.MODE === 'development'
    ? import.meta.env.VITE_API_BASE || 'http://localhost:5000'
    : '';

/* ── Responsive breakpoint ── */
const MOBILE_BREAKPOINT = 768;

/* ── ICE servers for WebRTC ── */
const ICE_SERVERS = [{ urls: 'stun:stun.l.google.com:19302' }];

function App() {
  /* ─── Auth state ─── */
  const [token, setToken] = useState(null);
  const [user, setUser] = useState(null);

  /* ─── Persona state ─── */
  const [personas, setPersonas] = useState([]);
  const [activePersona, setActivePersona] = useState(null);
  const [showAddPersona, setShowAddPersona] = useState(false);

  /* ─── Chat state ─── */
  const [conversations, setConversations] = useState([]);
  const [allUsers, setAllUsers] = useState([]);
  const [activeConversation, setActiveConversation] = useState(null);
  const [messages, setMessages] = useState([]);
  const [hasMore, setHasMore] = useState(false);
  const [otherUserOnline, setOtherUserOnline] = useState(false);
  const [otherUserLastSeen, setOtherUserLastSeen] = useState(null);
  const [loadingMessages, setLoadingMessages] = useState(false);
  const [loadingConversations, setLoadingConversations] = useState(false);

  /* ─── Presence state ─── */
  const [onlineUserIds, setOnlineUserIds] = useState([]);
  const [typingUsers, setTypingUsers] = useState({}); // { chatId: Set of userIds }
  const [unreadCounts, setUnreadCounts] = useState({}); // { chatId: count }

  /* ─── Call state ─── */
  const [callState, setCallState] = useState(null); // { active, incoming, callType, remoteName, targetUserId }
  const [isMuted, setIsMuted] = useState(false);
  const [isSpeakerOn, setIsSpeakerOn] = useState(true);
  const [isScreenSharing, setIsScreenSharing] = useState(false);
  const [callStartTime, setCallStartTime] = useState(null);
  const peerConnectionRef = useRef(null);
  const localStreamRef = useRef(null);
  const remoteStreamRef = useRef(null);
  const [remoteStream, setRemoteStream] = useState(null);

  /* ─── Responsive state ─── */
  const [isMobile, setIsMobile] = useState(window.innerWidth < MOBILE_BREAKPOINT);
  const [showChat, setShowChat] = useState(false);

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

  /* ─── Store active conversation ID in ref for socket handlers ─── */
  const activeConvoRef = useRef(null);
  useEffect(() => {
    activeConvoRef.current = activeConversation;
  }, [activeConversation]);

  useEffect(() => {
    if (!socket) return;

    socket.on('connect', () => { });

    /* ── New message ── */
    socket.on('message:new', (msg) => {
      setMessages((prev) => {
        // Dedup
        if (prev.some((m) => m._id === msg._id)) return prev;
        return [...prev, msg];
      });

      // Update conversation lastMessage in sidebar
      const chatId = msg.conversation?._id || msg.conversation;
      if (chatId) {
        setConversations((prev) =>
          prev.map((c) =>
            c._id === chatId
              ? {
                ...c,
                lastMessage: {
                  text: msg.text,
                  sender: msg.sender?._id || msg.sender,
                  messageType: msg.messageType || 'text',
                  createdAt: msg.createdAt,
                },
                lastMessageAt: msg.createdAt,
              }
              : c
          )
        );

        // If the message is in a different conversation than the active one, bump unread
        if (chatId !== activeConvoRef.current?._id && msg.sender?._id !== user?.id) {
          setUnreadCounts((prev) => ({
            ...prev,
            [chatId]: (prev[chatId] || 0) + 1,
          }));
        }
      }
    });

    /* ── Message status updates ── */
    socket.on('message:status', ({ messageIds, messageId, conversationId, status }) => {
      const ids = messageIds || (messageId ? [messageId] : []);
      if (ids.length === 0) return;
      setMessages((prev) =>
        prev.map((m) =>
          ids.includes(m._id)
            ? { ...m, status }
            : m
        )
      );
    });

    /* ── Typing indicators ── */
    socket.on('typing:update', ({ conversationId, userId, isTyping }) => {
      setTypingUsers((prev) => {
        const newMap = { ...prev };
        const current = new Set(prev[conversationId] || []);
        if (isTyping) {
          current.add(userId);
        } else {
          current.delete(userId);
        }
        if (current.size === 0) {
          delete newMap[conversationId];
        } else {
          newMap[conversationId] = current;
        }
        return newMap;
      });
    });

    /* ── Notifications ── */
    socket.on('notification:new', ({ type, conversationId, senderId }) => {
      // Could show browser notification here
      if (type === 'new_message' && Notification.permission === 'granted') {
        // eslint-disable-next-line no-new
        new Notification('New message', { body: 'You have a new message', icon: '/favicon.ico' });
      }
    });

    /* ── Incoming call ── */
    socket.on('call:incoming', async ({ callerId, conversationId, offer, callType }) => {
      // Find caller name from conversations
      let callerName = 'Unknown';
      setConversations((prev) => {
        for (const c of prev) {
          const p = c.participants.find((pp) => pp._id === callerId);
          if (p) { callerName = p.name; break; }
        }
        return prev;
      });

      setCallState({
        incoming: true,
        active: false,
        callType,
        remoteName: callerName,
        targetUserId: callerId,
        offer,
        conversationId,
      });
    });

    socket.on('call:answered', async ({ answererId, answer }) => {
      if (peerConnectionRef.current) {
        await peerConnectionRef.current.setRemoteDescription(answer);
        setCallState((prev) => prev ? { ...prev, active: true, incoming: false } : prev);
      }
    });

    socket.on('call:rejected', () => {
      cleanupCall();
    });

    socket.on('call:ice-candidate', async ({ candidate }) => {
      if (peerConnectionRef.current && candidate) {
        try {
          await peerConnectionRef.current.addIceCandidate(candidate);
        } catch (err) {
          // ignore
        }
      }
    });

    socket.on('call:ended', () => {
      cleanupCall();
    });

    /* ── Presence heartbeat ── */
    const heartbeat = setInterval(() => {
      socket.emit('presence:heartbeat');
    }, 60000);

    return () => {
      clearInterval(heartbeat);
      socket.disconnect();
    };
  }, [socket, user?.id]);

  /* ─── Presence: online/offline for the other user in active conversation ─── */
  useEffect(() => {
    if (!socket || !activeConversation || !user?.id) return;
    const otherId = activeConversation.participants.find((p) => p._id !== user.id)?._id;
    const otherIdStr = otherId != null ? String(otherId) : null;
    setOtherUserOnline(false);
    setOtherUserLastSeen(null);

    const onPresence = ({ conversationId, onlineUserIds: ids, lastSeenData }) => {
      if (activeConversation._id !== conversationId || !otherIdStr) return;
      setOtherUserOnline(ids.includes(otherIdStr));
      // Update global online list
      setOnlineUserIds((prev) => {
        const newSet = new Set(prev);
        ids.forEach((id) => newSet.add(id));
        return [...newSet];
      });
      if (lastSeenData?.[otherIdStr]) {
        setOtherUserLastSeen(lastSeenData[otherIdStr]);
      }
    };
    const onPresenceUpdate = ({ userId, online }) => {
      if (String(userId) === otherIdStr) {
        setOtherUserOnline(online);
        if (!online) setOtherUserLastSeen(new Date().toISOString());
      }
      // Update global online list
      setOnlineUserIds((prev) => {
        const newSet = new Set(prev);
        if (online) newSet.add(String(userId));
        else newSet.delete(String(userId));
        return [...newSet];
      });
    };

    socket.on('presence', onPresence);
    socket.on('presence:update', onPresenceUpdate);
    return () => {
      socket.off('presence', onPresence);
      socket.off('presence:update', onPresenceUpdate);
    };
  }, [socket, activeConversation?._id, user?.id]);

  /* ─── Typing: emit typing events on text change ─── */
  const typingTimeoutRef = useRef(null);
  const emitTyping = useCallback(
    (conversationId) => {
      if (!socket || !conversationId) return;
      socket.emit('typing:start', { conversationId });
      if (typingTimeoutRef.current) clearTimeout(typingTimeoutRef.current);
      typingTimeoutRef.current = setTimeout(() => {
        socket.emit('typing:stop', { conversationId });
      }, 2500);
    },
    [socket]
  );

  /* ─── Axios client ─── */
  const authClient = useMemo(() => {
    return axios.create({
      baseURL: `${API_BASE}/api`,
      headers: token ? { Authorization: `Bearer ${token}` } : {},
    });
  }, [token]);

  /* ─── Data loaders ─── */
  const loadConversations = useCallback(async () => {
    setLoadingConversations(true);
    try {
      const res = await authClient.get('/conversations');
      setConversations(res.data);
    } finally {
      setLoadingConversations(false);
    }
  }, [authClient]);

  const loadUsers = useCallback(async () => {
    const res = await authClient.get('/users');
    setAllUsers(res.data);
  }, [authClient]);

  const loadPersonas = useCallback(async () => {
    try {
      const res = await personaApi.list(authClient);
      setPersonas(res.data || []);
    } catch {
      // Persona backend may be unconfigured (no Gemini/Qdrant) — leave empty.
    }
  }, [authClient]);

  /* ── Open a persona chat (clears the normal active conversation) ── */
  const openPersona = useCallback((persona) => {
    setActiveConversation(null);
    setActivePersona(persona);
    setShowAddPersona(false);
    if (isMobile) {
      setShowChat(true);
      window.history.pushState({ personaScreen: true, personaId: persona._id }, '', window.location.pathname + window.location.search);
    }
  }, [isMobile]);

  /* ── Leave persona chat (mobile back) ── */
  const closePersona = useCallback(() => {
    setActivePersona(null);
    if (isMobile && window.history.state?.personaScreen) {
      window.history.back();
    } else {
      setShowChat(false);
    }
  }, [isMobile]);

  /* ── Delete a persona + everything under it (cascade) ── */
  const deletePersona = useCallback(async (persona) => {
    try {
      await personaApi.delete(authClient, persona._id);
    } catch {
      return; // surface errors inline if needed; never block the list refresh
    }
    // Drop it locally so the row vanishes without a full reload.
    setPersonas((prev) => prev.filter((p) => p._id !== persona._id));
    // If the deleted persona was the open one, close its chat too.
    setActivePersona((prev) => (prev?._id === persona._id ? null : prev));
  }, [authClient]);

  useEffect(() => {
    if (!token) return;
    loadConversations();
    loadUsers();
    loadPersonas();

    // Request notification permission
    if ('Notification' in window && Notification.permission === 'default') {
      Notification.requestPermission();
    }
  }, [token, loadConversations, loadUsers, loadPersonas]);

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
      setActivePersona(null);
      // Clear unread count for this conversation
      setUnreadCounts((prev) => {
        const next = { ...prev };
        delete next[conversation._id];
        return next;
      });
      if (isMobile) {
        setShowChat(true);
        window.history.pushState({ chatScreen: true, conversationId: conversation._id }, '', window.location.pathname + window.location.search);
      }
      if (socket) {
        socket.emit('conversation:join', conversation._id);
      }
      setLoadingMessages(true);
      try {
        const res = await authClient.get(`/messages/${conversation._id}?limit=30`);
        setMessages(res.data.messages);
        setHasMore(res.data.hasMore);

        // Mark all received messages as delivered
        const undelivered = res.data.messages
          .filter((m) => m.sender?._id !== user?.id && m.status === 'sent')
          .map((m) => m._id);
        if (undelivered.length > 0) {
          authClient.patch(`/messages/${conversation._id}/status`, {
            messageIds: undelivered,
            status: 'delivered',
          }).catch(() => { });
        }

        // Mark visible as read
        const unread = res.data.messages
          .filter((m) => m.sender?._id !== user?.id && (m.status === 'sent' || m.status === 'delivered'))
          .map((m) => m._id);
        if (unread.length > 0) {
          authClient.patch(`/messages/${conversation._id}/status`, {
            messageIds: unread,
            status: 'read',
          }).catch(() => { });
        }
      } finally {
        setLoadingMessages(false);
      }
    },
    [authClient, socket, isMobile, user?.id]
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
    async (text, file, replyToId, messageType) => {
      if (!activeConversation || (!text && !file)) return;

      // Stop typing
      if (socket) socket.emit('typing:stop', { conversationId: activeConversation._id });

      const formData = new FormData();
      if (text) formData.append('text', text);
      if (file) formData.append('media', file);
      if (replyToId) formData.append('replyTo', replyToId);
      if (messageType) formData.append('messageType', messageType);

      await authClient.post(
        `/messages/${activeConversation._id}`,
        formData,
        { headers: { 'Content-Type': 'multipart/form-data' } }
      );
      // Rely on Socket.IO 'message:new' event for live update
    },
    [activeConversation, authClient, socket]
  );

  /* ─── Forward message ─── */
  const handleForwardMessage = useCallback(
    async (messageId, targetConversationId) => {
      if (!activeConversation) return;
      try {
        await authClient.post(`/messages/${activeConversation._id}/forward`, {
          messageId,
          targetConversationId,
        });
      } catch (err) {
        // eslint-disable-next-line no-console
        console.error('Forward failed:', err);
      }
    },
    [activeConversation, authClient]
  );

  /* ─── WebRTC Call helpers ─── */
  const cleanupCall = useCallback(() => {
    if (peerConnectionRef.current) {
      peerConnectionRef.current.close();
      peerConnectionRef.current = null;
    }
    if (localStreamRef.current) {
      localStreamRef.current.getTracks().forEach((t) => t.stop());
      localStreamRef.current = null;
    }
    setCallState(null);
    setRemoteStream(null);
    setIsMuted(false);
    setIsSpeakerOn(true);
    setIsScreenSharing(false);
  }, []);

  const setupPeerConnection = useCallback((targetUserId) => {
    const pc = new RTCPeerConnection({ iceServers: ICE_SERVERS });
    peerConnectionRef.current = pc;

    pc.onicecandidate = (event) => {
      if (event.candidate && socket) {
        socket.emit('call:ice-candidate', {
          targetUserId,
          candidate: event.candidate,
        });
      }
    };

    pc.ontrack = (event) => {
      const stream = event.streams[0];
      remoteStreamRef.current = stream;
      setRemoteStream(stream);
    };

    pc.oniceconnectionstatechange = () => {
      if (pc.iceConnectionState === 'disconnected' || pc.iceConnectionState === 'failed') {
        cleanupCall();
      }
    };

    return pc;
  }, [socket, cleanupCall]);

  const handleCallStart = useCallback(async (callType) => {
    if (!activeConversation || !socket || !user) return;
    const otherUser = activeConversation.participants.find((p) => p._id !== user.id);
    if (!otherUser) return;

    try {
      let stream;
      if (callType === 'screen') {
        stream = await navigator.mediaDevices.getDisplayMedia({ video: true, audio: true });
      } else {
        stream = await navigator.mediaDevices.getUserMedia({ audio: true, video: callType === 'video' });
      }
      localStreamRef.current = stream;

      const pc = setupPeerConnection(otherUser._id);
      stream.getTracks().forEach((track) => pc.addTrack(track, stream));

      const offer = await pc.createOffer();
      await pc.setLocalDescription(offer);

      socket.emit('call:initiate', {
        targetUserId: otherUser._id,
        conversationId: activeConversation._id,
        offer,
        callType,
      });

      setCallStartTime(Date.now());
      setCallState({
        active: false,
        incoming: false,
        callType,
        remoteName: otherUser.name,
        targetUserId: otherUser._id,
        conversationId: activeConversation._id,
      });
    } catch (err) {
      // eslint-disable-next-line no-console
      console.error('Call setup failed:', err);
      cleanupCall();
    }
  }, [activeConversation, socket, user, setupPeerConnection, cleanupCall]);

  const handleCallAnswer = useCallback(async () => {
    if (!callState?.offer || !socket) return;
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        audio: true,
        video: callState.callType === 'video',
      });
      localStreamRef.current = stream;

      const pc = setupPeerConnection(callState.targetUserId);
      stream.getTracks().forEach((track) => pc.addTrack(track, stream));

      await pc.setRemoteDescription(callState.offer);
      const answer = await pc.createAnswer();
      await pc.setLocalDescription(answer);

      socket.emit('call:answer', {
        targetUserId: callState.targetUserId,
        answer,
      });

      setCallStartTime(Date.now());
      setCallState((prev) => prev ? { ...prev, active: true, incoming: false } : prev);
    } catch (err) {
      // eslint-disable-next-line no-console
      console.error('Answer failed:', err);
      cleanupCall();
    }
  }, [callState, socket, setupPeerConnection, cleanupCall]);

  const handleCallReject = useCallback(() => {
    if (socket && callState?.targetUserId) {
      socket.emit('call:reject', {
        targetUserId: callState.targetUserId,
        conversationId: callState.conversationId,
      });
    }
    cleanupCall();
  }, [socket, callState, cleanupCall]);

  const handleCallEnd = useCallback(() => {
    if (socket && callState?.targetUserId) {
      socket.emit('call:end', {
        targetUserId: callState.targetUserId,
        conversationId: callState.conversationId,
      });
    }

    // Send a call summary message to the chat (like Instagram)
    if (callState?.conversationId && callState?.active && callStartTime) {
      const elapsed = Math.floor((Date.now() - callStartTime) / 1000);
      const mins = Math.floor(elapsed / 60);
      const secs = elapsed % 60;
      const durationStr = mins > 0 ? `${mins}m ${secs}s` : `${secs}s`;
      const callIcon = callState.callType === 'video' ? '📹' : callState.callType === 'screen' ? '🖥️' : '📞';
      const callText = `${callIcon} ${callState.callType === 'screen' ? 'Screen share' : callState.callType === 'video' ? 'Video call' : 'Voice call'} • ${durationStr}`;
      handleSendMessage(callText, null, null, 'text').catch(() => { });
    }

    setCallStartTime(null);
    cleanupCall();
  }, [socket, callState, cleanupCall, callStartTime, handleSendMessage]);

  const handleToggleMute = useCallback(() => {
    if (localStreamRef.current) {
      const audioTrack = localStreamRef.current.getAudioTracks()[0];
      if (audioTrack) {
        audioTrack.enabled = !audioTrack.enabled;
        setIsMuted(!audioTrack.enabled);
      }
    }
  }, []);

  const handleToggleSpeaker = useCallback(() => {
    // Toggle remote audio playback
    setIsSpeakerOn((prev) => !prev);
    // Mute/unmute the remote audio element via the ref
    if (remoteStreamRef.current) {
      const audioEls = document.querySelectorAll('audio');
      audioEls.forEach((el) => {
        if (el.srcObject === remoteStreamRef.current) {
          el.muted = isSpeakerOn; // toggle: if speaker was on, mute it
        }
      });
    }
  }, [isSpeakerOn]);

  const handleToggleScreenShare = useCallback(async () => {
    if (!peerConnectionRef.current || !socket) return;
    try {
      if (isScreenSharing) {
        // Switch back to camera
        const stream = await navigator.mediaDevices.getUserMedia({ audio: true, video: false });
        const senders = peerConnectionRef.current.getSenders();
        for (const sender of senders) {
          const newTrack = stream.getTracks().find((t) => t.kind === sender.track?.kind);
          if (newTrack) await sender.replaceTrack(newTrack);
        }
        localStreamRef.current = stream;
        setIsScreenSharing(false);
      } else {
        const stream = await navigator.mediaDevices.getDisplayMedia({ video: true });
        const senders = peerConnectionRef.current.getSenders();
        const videoSender = senders.find((s) => s.track?.kind === 'video');
        if (videoSender) {
          await videoSender.replaceTrack(stream.getVideoTracks()[0]);
        }
        setIsScreenSharing(true);
        stream.getVideoTracks()[0].onended = () => {
          setIsScreenSharing(false);
        };
      }
    } catch (err) {
      // eslint-disable-next-line no-console
      console.error('Screen share toggle failed:', err);
    }
  }, [isScreenSharing, socket]);

  /* ─── Mobile back handler ─── */
  const handleBack = useCallback(() => {
    if (isMobile && (window.history.state?.chatScreen || window.history.state?.personaScreen)) {
      window.history.back();
    } else {
      setShowChat(false);
    }
  }, [isMobile]);

  /* ─── Logout ─── */
  const handleLogout = useCallback(() => {
    cleanupCall();
    setToken(null);
    setUser(null);
    setActiveConversation(null);
    setConversations([]);
    setMessages([]);
    setHasMore(false);
    setShowChat(false);
    setOnlineUserIds([]);
    setTypingUsers({});
    setUnreadCounts({});
    setActivePersona(null);
    setPersonas([]);
    setShowAddPersona(false);
  }, [cleanupCall]);

  /* ─── Is the other user typing in the active conversation? ─── */
  const isOtherTyping = useMemo(() => {
    if (!activeConversation || !user?.id) return false;
    const typingSet = typingUsers[activeConversation._id];
    if (!typingSet) return false;
    return [...typingSet].some((uid) => uid !== user.id);
  }, [typingUsers, activeConversation?._id, user?.id]);

  /* ═══════════════════════════════════════════════
   *  RENDER
   * ═══════════════════════════════════════════════ */

  /* Auth screen */
  if (!token) {
    return <AuthScreen onAuth={handleAuth} apiBase={API_BASE} theme={theme} toggleTheme={toggleTheme} />;
  }

  /* Call screen popup */
  const callOverlay = (
    <CallScreen
      callState={callState}
      onAnswer={handleCallAnswer}
      onReject={handleCallReject}
      onEnd={handleCallEnd}
      onToggleMute={handleToggleMute}
      onToggleSpeaker={handleToggleSpeaker}
      isMuted={isMuted}
      isSpeakerOn={isSpeakerOn}
      remoteStream={remoteStream}
    />
  );

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
        {callOverlay}
        {showAddPersona && (
          <AddPersona
            authClient={authClient}
            onCreated={() => loadPersonas()}
            onClose={() => setShowAddPersona(false)}
          />
        )}
        {showChat && activePersona ? (
          <div className="flex-1 w-full flex flex-col min-h-0 slide-in-right">
            <PersonaChat
              user={user}
              persona={activePersona}
              socket={socket}
              authClient={authClient}
              onBack={closePersona}
              isMobile={true}
            />
          </div>
        ) : showChat && activeConversation ? (
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
              otherUserLastSeen={otherUserLastSeen}
              isOtherTyping={isOtherTyping}
              onForwardMessage={handleForwardMessage}
              conversations={conversations}
              loading={loadingMessages}
              onCallStart={handleCallStart}
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
              onlineUserIds={onlineUserIds}
              unreadCounts={unreadCounts}
              loading={loadingConversations}
              /* persona props */
              personas={personas}
              activePersona={activePersona}
              onOpenPersona={openPersona}
              onAddPersona={() => setShowAddPersona(true)}
              onDeletePersona={deletePersona}
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
      {callOverlay}
      {showAddPersona && (
        <AddPersona
          authClient={authClient}
          onCreated={() => loadPersonas()}
          onClose={() => setShowAddPersona(false)}
        />
      )}
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
          onlineUserIds={onlineUserIds}
          unreadCounts={unreadCounts}
          loading={loadingConversations}
          /* persona props */
          personas={personas}
          activePersona={activePersona}
          onOpenPersona={openPersona}
          onAddPersona={() => setShowAddPersona(true)}
          onDeletePersona={deletePersona}
        />
      </aside>

      {/* Chat area */}
      <section className="flex flex-1 flex-col h-full overflow-hidden">
        {activePersona ? (
          <PersonaChat
            user={user}
            persona={activePersona}
            socket={socket}
            authClient={authClient}
            onBack={closePersona}
            isMobile={false}
          />
        ) : (
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
            otherUserLastSeen={otherUserLastSeen}
            isOtherTyping={isOtherTyping}
            onForwardMessage={handleForwardMessage}
            conversations={conversations}
            loading={loadingMessages}
            onCallStart={handleCallStart}
          />
        )}
      </section>
    </div>
  );
}

export default App;
