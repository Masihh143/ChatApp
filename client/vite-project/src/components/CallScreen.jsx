import { useState, useEffect, useRef } from 'react';

/**
 * CallScreen — Floating popup for voice/video calls (Instagram-style).
 * Appears as a compact card in the bottom-right corner, not full-screen.
 *
 * Props:
 *   callState: { active, incoming, callType, remoteName, remoteAvatar, targetUserId, conversationId }
 *   onAnswer() — accept incoming call
 *   onReject() — reject incoming call
 *   onEnd() — end active call
 *   onToggleMute() — mute/unmute mic
 *   onToggleSpeaker() — toggle speaker (stub for UI)
 *   isMuted, isSpeakerOn
 *   remoteStream — MediaStream object
 */
export default function CallScreen({
    callState,
    onAnswer,
    onReject,
    onEnd,
    onToggleMute,
    onToggleSpeaker,
    isMuted = false,
    isSpeakerOn = true,
    remoteStream,
}) {
    const [elapsed, setElapsed] = useState(0);
    const timerRef = useRef(null);
    const remoteAudioRef = useRef(null);

    // Timer for active calls
    useEffect(() => {
        if (callState?.active) {
            setElapsed(0);
            timerRef.current = setInterval(() => setElapsed((e) => e + 1), 1000);
        } else {
            setElapsed(0);
        }
        return () => {
            if (timerRef.current) clearInterval(timerRef.current);
        };
    }, [callState?.active]);

    // Attach remote stream to audio element
    useEffect(() => {
        if (remoteAudioRef.current && remoteStream) {
            remoteAudioRef.current.srcObject = remoteStream;
        }
    }, [remoteStream]);

    if (!callState?.active && !callState?.incoming) return null;

    const formatTime = (s) => {
        const m = Math.floor(s / 60);
        const sec = s % 60;
        return `${m}:${sec.toString().padStart(2, '0')}`;
    };

    const name = callState.remoteName || 'Friend';
    const initials = name.split(' ').map((w) => w[0]).join('').slice(0, 2).toUpperCase();

    const palettes = [
        { bg: 'var(--dd-lavender-soft)', border: 'var(--dd-lavender)', color: 'var(--dd-primary)' },
        { bg: 'var(--dd-coral-soft)', border: 'var(--dd-coral)', color: '#c0574a' },
        { bg: 'var(--dd-sage-soft)', border: 'var(--dd-sage)', color: '#5a8555' },
        { bg: 'var(--dd-sky-soft)', border: 'var(--dd-sky)', color: '#4a7fa0' },
    ];
    const p = palettes[name.charCodeAt(0) % palettes.length];

    const isRinging = callState.incoming && !callState.active;

    return (
        <>
            {/* Backdrop — subtle overlay */}
            <div
                className="fixed inset-0 z-40"
                style={{ backgroundColor: 'rgba(0,0,0,0.25)', backdropFilter: 'blur(2px)' }}
                onClick={(e) => e.stopPropagation()}
            />

            {/* Floating popup card */}
            <div
                className="fixed z-50 call-popup-slide"
                style={{
                    bottom: 24,
                    right: 24,
                    width: 300,
                    maxWidth: 'calc(100vw - 48px)',
                }}
            >
                <div
                    className="rounded-2xl overflow-hidden"
                    style={{
                        backgroundColor: 'var(--dd-card)',
                        border: '2.5px dashed var(--dd-border)',
                        boxShadow: '0 12px 40px rgba(0,0,0,0.15), var(--dd-shadow-lg)',
                    }}
                >
                    {/* ── Header ── */}
                    <div
                        className="px-4 pt-4 pb-3 flex items-center gap-3"
                        style={{
                            borderBottom: '1.5px dashed var(--dd-border)',
                            background: isRinging
                                ? 'linear-gradient(135deg, var(--dd-sage-soft), var(--dd-lavender-soft))'
                                : 'var(--dd-card)',
                        }}
                    >
                        {/* Avatar */}
                        <div
                            className="rounded-full flex items-center justify-center font-bold flex-shrink-0 doodle-avatar"
                            style={{
                                width: 46,
                                height: 46,
                                backgroundColor: p.bg,
                                borderColor: p.border,
                                color: p.color,
                                fontSize: 18,
                                fontFamily: 'var(--font-hand)',
                                animation: isRinging ? 'call-ring 1.5s ease-in-out infinite' : undefined,
                            }}
                        >
                            {initials}
                        </div>

                        <div className="flex-1 min-w-0">
                            <div
                                className="text-[16px] font-bold truncate"
                                style={{ fontFamily: 'var(--font-hand)', color: 'var(--dd-text)' }}
                            >
                                {name}
                            </div>
                            <div
                                className="text-[12px]"
                                style={{ fontFamily: 'var(--font-sketch)', color: 'var(--dd-text-secondary)' }}
                            >
                                {isRinging
                                    ? `Incoming ${callState.callType || 'voice'} call...`
                                    : callState.active
                                        ? formatTime(elapsed)
                                        : 'Calling...'}
                            </div>
                        </div>

                        {/* Call type badge */}
                        <div
                            className="text-xl flex-shrink-0"
                            style={{ filter: isRinging ? 'none' : 'grayscale(0.3)' }}
                        >
                            {callState.callType === 'video' ? '📹' : callState.callType === 'screen' ? '🖥️' : '📞'}
                        </div>
                    </div>

                    {/* Hidden audio element for remote stream */}
                    <audio ref={remoteAudioRef} autoPlay />

                    {/* ── Controls ── */}
                    <div className="px-4 py-4">
                        {/* Incoming: Accept / Reject */}
                        {isRinging && (
                            <div className="flex items-center justify-center gap-6">
                                <button
                                    onClick={onReject}
                                    className="w-12 h-12 rounded-full flex items-center justify-center cursor-pointer transition-transform hover:scale-110"
                                    style={{
                                        background: 'var(--dd-danger)',
                                        color: '#fff',
                                        border: '2px dashed rgba(255,255,255,0.3)',
                                        boxShadow: 'var(--dd-shadow-md)',
                                    }}
                                    title="Decline"
                                >
                                    <svg viewBox="0 0 24 24" width="22" height="22" fill="currentColor">
                                        <path d="M12 9c-1.6 0-3.15.25-4.6.72v3.1c0 .39-.23.74-.56.9-.98.49-1.87 1.12-2.66 1.85-.18.18-.43.28-.7.28-.28 0-.53-.11-.71-.29L.29 13.08c-.18-.17-.29-.42-.29-.7 0-.28.11-.53.29-.71C3.34 8.78 7.46 7 12 7s8.66 1.78 11.71 4.67c.18.18.29.43.29.71s-.11.53-.29.71l-2.48 2.48c-.18.18-.43.29-.71.29-.27 0-.52-.11-.7-.28-.79-.74-1.69-1.36-2.67-1.85-.33-.16-.56-.5-.56-.9v-3.1C15.15 9.25 13.6 9 12 9z" />
                                    </svg>
                                </button>
                                <button
                                    onClick={onAnswer}
                                    className="w-12 h-12 rounded-full flex items-center justify-center cursor-pointer transition-transform hover:scale-110"
                                    style={{
                                        background: 'var(--dd-sage)',
                                        color: '#fff',
                                        border: '2px dashed rgba(255,255,255,0.3)',
                                        boxShadow: 'var(--dd-shadow-md)',
                                        animation: 'call-ring 1.5s ease-in-out infinite',
                                    }}
                                    title="Accept"
                                >
                                    <svg viewBox="0 0 24 24" width="22" height="22" fill="currentColor">
                                        <path d="M20.01 15.38c-1.23 0-2.42-.2-3.53-.56-.35-.12-.74-.03-1.01.24l-1.57 1.97c-2.83-1.35-5.48-3.9-6.89-6.83l1.95-1.66c.27-.28.35-.67.24-1.02-.37-1.11-.56-2.3-.56-3.53 0-.54-.45-.99-.99-.99H4.19C3.65 3 3 3.24 3 3.99 3 13.28 10.73 21 20.01 21c.71 0 .99-.63.99-1.18v-3.45c0-.54-.45-.99-.99-.99z" />
                                    </svg>
                                </button>
                            </div>
                        )}

                        {/* Active call: Mic Mute / Speaker / End */}
                        {callState.active && (
                            <div className="flex items-center justify-center gap-4">
                                {/* Mute mic */}
                                <button
                                    onClick={onToggleMute}
                                    className="w-11 h-11 rounded-full flex items-center justify-center cursor-pointer transition-transform hover:scale-110"
                                    style={{
                                        background: isMuted ? 'var(--dd-coral-soft)' : 'var(--dd-paper)',
                                        color: isMuted ? 'var(--dd-danger)' : 'var(--dd-text-secondary)',
                                        border: `2px dashed ${isMuted ? 'var(--dd-coral)' : 'var(--dd-border)'}`,
                                    }}
                                    title={isMuted ? 'Unmute' : 'Mute'}
                                >
                                    <svg viewBox="0 0 24 24" width="18" height="18" fill="currentColor">
                                        {isMuted ? (
                                            <path d="M19 11h-1.7c0 .74-.16 1.43-.43 2.05l1.23 1.23c.56-.98.9-2.09.9-3.28zm-4.02.17c0-.06.02-.11.02-.17V5c0-1.66-1.34-3-3-3S9 3.34 9 5v.18l5.98 5.99zM4.27 3L3 4.27l6.01 6.01V11c0 1.66 1.33 3 2.99 3 .22 0 .44-.03.65-.08l1.66 1.66c-.71.33-1.5.52-2.31.52-2.76 0-5.3-2.1-5.3-5.1H5c0 3.41 2.72 6.23 6 6.72V21h2v-3.28c.91-.13 1.77-.45 2.54-.9L19.73 21 21 19.73 4.27 3z" />
                                        ) : (
                                            <path d="M12 14c1.66 0 2.99-1.34 2.99-3L15 5c0-1.66-1.34-3-3-3S9 3.34 9 5v6c0 1.66 1.34 3 3 3zm5.3-3c0 3-2.54 5.1-5.3 5.1S6.7 14 6.7 11H5c0 3.41 2.72 6.23 6 6.72V21h2v-3.28c3.28-.48 6-3.3 6-6.72h-1.7z" />
                                        )}
                                    </svg>
                                </button>

                                {/* Speaker toggle */}
                                <button
                                    onClick={onToggleSpeaker}
                                    className="w-11 h-11 rounded-full flex items-center justify-center cursor-pointer transition-transform hover:scale-110"
                                    style={{
                                        background: !isSpeakerOn ? 'var(--dd-coral-soft)' : 'var(--dd-paper)',
                                        color: !isSpeakerOn ? 'var(--dd-danger)' : 'var(--dd-text-secondary)',
                                        border: `2px dashed ${!isSpeakerOn ? 'var(--dd-coral)' : 'var(--dd-border)'}`,
                                    }}
                                    title={isSpeakerOn ? 'Mute speaker' : 'Unmute speaker'}
                                >
                                    <svg viewBox="0 0 24 24" width="18" height="18" fill="currentColor">
                                        {isSpeakerOn ? (
                                            <path d="M3 9v6h4l5 5V4L7 9H3zm13.5 3c0-1.77-1.02-3.29-2.5-4.03v8.05c1.48-.73 2.5-2.25 2.5-4.02zM14 3.23v2.06c2.89.86 5 3.54 5 6.71s-2.11 5.85-5 6.71v2.06c4.01-.91 7-4.49 7-8.77s-2.99-7.86-7-8.77z" />
                                        ) : (
                                            <path d="M16.5 12c0-1.77-1.02-3.29-2.5-4.03v2.21l2.45 2.45c.03-.2.05-.41.05-.63zm2.5 0c0 .94-.2 1.82-.54 2.64l1.51 1.51C20.63 14.91 21 13.5 21 12c0-4.28-2.99-7.86-7-8.77v2.06c2.89.86 5 3.54 5 6.71zM4.27 3L3 4.27 7.73 9H3v6h4l5 5v-6.73l4.25 4.25c-.67.52-1.42.93-2.25 1.18v2.06c1.38-.31 2.63-.95 3.69-1.81L19.73 21 21 19.73l-9-9L4.27 3zM12 4L9.91 6.09 12 8.18V4z" />
                                        )}
                                    </svg>
                                </button>

                                {/* End call */}
                                <button
                                    onClick={onEnd}
                                    className="w-12 h-12 rounded-full flex items-center justify-center cursor-pointer transition-transform hover:scale-110"
                                    style={{
                                        background: 'var(--dd-danger)',
                                        color: '#fff',
                                        border: '2px dashed rgba(255,255,255,0.3)',
                                        boxShadow: 'var(--dd-shadow-md)',
                                    }}
                                    title="End call"
                                >
                                    <svg viewBox="0 0 24 24" width="22" height="22" fill="currentColor">
                                        <path d="M12 9c-1.6 0-3.15.25-4.6.72v3.1c0 .39-.23.74-.56.9-.98.49-1.87 1.12-2.66 1.85-.18.18-.43.28-.7.28-.28 0-.53-.11-.71-.29L.29 13.08c-.18-.17-.29-.42-.29-.7 0-.28.11-.53.29-.71C3.34 8.78 7.46 7 12 7s8.66 1.78 11.71 4.67c.18.18.29.43.29.71s-.11.53-.29.71l-2.48 2.48c-.18.18-.43.29-.71.29-.27 0-.52-.11-.7-.28-.79-.74-1.69-1.36-2.67-1.85-.33-.16-.56-.5-.56-.9v-3.1C15.15 9.25 13.6 9 12 9z" />
                                    </svg>
                                </button>
                            </div>
                        )}

                        {/* Connecting state */}
                        {!isRinging && !callState.active && (
                            <div className="flex items-center justify-center gap-4">
                                <div
                                    className="text-[13px]"
                                    style={{ fontFamily: 'var(--font-sketch)', color: 'var(--dd-text-muted)' }}
                                >
                                    Ringing...
                                </div>
                                <button
                                    onClick={onEnd}
                                    className="w-11 h-11 rounded-full flex items-center justify-center cursor-pointer transition-transform hover:scale-110"
                                    style={{
                                        background: 'var(--dd-danger)',
                                        color: '#fff',
                                        border: '2px dashed rgba(255,255,255,0.3)',
                                    }}
                                    title="Cancel"
                                >
                                    <svg viewBox="0 0 24 24" width="18" height="18" fill="currentColor">
                                        <path d="M12 9c-1.6 0-3.15.25-4.6.72v3.1c0 .39-.23.74-.56.9-.98.49-1.87 1.12-2.66 1.85-.18.18-.43.28-.7.28-.28 0-.53-.11-.71-.29L.29 13.08c-.18-.17-.29-.42-.29-.7 0-.28.11-.53.29-.71C3.34 8.78 7.46 7 12 7s8.66 1.78 11.71 4.67c.18.18.29.43.29.71s-.11.53-.29.71l-2.48 2.48c-.18.18-.43.29-.71.29-.27 0-.52-.11-.7-.28-.79-.74-1.69-1.36-2.67-1.85-.33-.16-.56-.5-.56-.9v-3.1C15.15 9.25 13.6 9 12 9z" />
                                    </svg>
                                </button>
                            </div>
                        )}
                    </div>
                </div>
            </div>
        </>
    );
}
