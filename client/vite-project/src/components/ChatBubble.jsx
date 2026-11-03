import { memo, useRef, useState, useCallback, useEffect } from 'react';

/**
 * ChatBubble — swipe right to reply (mobile); hover dropdown with Reply + Forward (desktop).
 * Supports: message status indicators, replyTo reference, forwarded badge, voice note player.
 */
const ChatBubble = memo(function ChatBubble({ message, isOwn, onReply, onForward, isMobile, otherUserName }) {
    const bubbleColors = isOwn
        ? { bg: 'var(--dd-lavender-soft)', border: 'var(--dd-lavender)', text: 'var(--dd-text)', timeColor: 'var(--dd-primary-light)' }
        : { bg: 'var(--dd-card)', border: 'var(--dd-border-sketch)', text: 'var(--dd-text)', timeColor: 'var(--dd-text-muted)' };

    const touchStartX = useRef(0);
    const touchStartY = useRef(0);
    const [swipeOffset, setSwipeOffset] = useState(0);
    const [showReplyHint, setShowReplyHint] = useState(false);
    const [hover, setHover] = useState(false);
    const [dropdownOpen, setDropdownOpen] = useState(false);
    const dropdownRef = useRef(null);

    /* Close dropdown on outside click (desktop) */
    useEffect(() => {
        if (!dropdownOpen) return;
        const fn = (e) => {
            if (dropdownRef.current && !dropdownRef.current.contains(e.target)) setDropdownOpen(false);
        };
        document.addEventListener('click', fn);
        return () => document.removeEventListener('click', fn);
    }, [dropdownOpen]);

    const handleTouchStart = useCallback((e) => {
        touchStartX.current = e.touches[0].clientX;
        touchStartY.current = e.touches[0].clientY;
        setShowReplyHint(true);
    }, []);

    const handleTouchMove = useCallback((e) => {
        const x = e.touches[0].clientX;
        const y = e.touches[0].clientY;
        const deltaX = x - touchStartX.current;
        const deltaY = y - touchStartY.current;
        if (Math.abs(deltaX) > Math.abs(deltaY) && deltaX > 0) {
            setSwipeOffset(Math.min(deltaX, 80));
        } else {
            setSwipeOffset(0);
        }
    }, []);

    const handleTouchEnd = useCallback(() => {
        setShowReplyHint(false);
        if (swipeOffset >= 50 && onReply) {
            onReply(message);
        }
        setSwipeOffset(0);
    }, [swipeOffset, onReply, message]);

    /* ── Status indicator ── */
    const renderStatus = () => {
        if (!isOwn) return null;
        const status = message.status || 'sent';
        switch (status) {
            case 'read':
                return <span className="text-[11px]" style={{ color: 'var(--dd-primary)' }}>✓✓</span>;
            case 'delivered':
                return <span className="text-[11px]" style={{ color: 'var(--dd-text-muted)' }}>✓✓</span>;
            case 'sent':
            default:
                return <span className="text-[11px]" style={{ color: 'var(--dd-text-muted)' }}>✓</span>;
        }
    };

    /* ── Quoted reply block ── */
    const renderReplyBlock = () => {
        // New style: use populated replyTo object
        if (message.replyTo && typeof message.replyTo === 'object') {
            const rt = message.replyTo;
            const replyName = rt.senderInfo?.name || (rt.sender === message.sender?._id ? 'You' : (otherUserName || 'Friend'));
            const snippet = rt.text || (rt.mediaUrl ? `📎 ${rt.messageType || 'Media'}` : '📎 Media');
            return (
                <div
                    className="rounded-lg px-2 py-1.5 mb-1.5 border-l-2"
                    style={{
                        backgroundColor: 'var(--dd-reply-bar)',
                        borderLeftColor: 'var(--dd-lavender)',
                        fontFamily: 'var(--font-sketch)',
                        fontSize: '12px',
                        color: 'var(--dd-text-secondary)',
                    }}
                >
                    <div className="font-bold text-[11px]" style={{ color: 'var(--dd-primary)' }}>{replyName}</div>
                    <span className="whitespace-pre-wrap break-words">{snippet.slice(0, 80)}{snippet.length > 80 ? '…' : ''}</span>
                </div>
            );
        }

        // Legacy: parse from text (backward compat)
        if (message.text?.startsWith('↩') && message.text?.includes('\n\n')) {
            const [replyLine, ...rest] = message.text.split('\n\n');
            return (
                <>
                    <div
                        className="rounded-lg px-2 py-1.5 mb-1.5 border-l-2"
                        style={{
                            backgroundColor: 'var(--dd-reply-bar)',
                            borderLeftColor: 'var(--dd-lavender)',
                            fontFamily: 'var(--font-sketch)',
                            fontSize: '12px',
                            color: 'var(--dd-text-secondary)',
                        }}
                    >
                        <span className="whitespace-pre-wrap break-words">{replyLine}</span>
                    </div>
                    {rest.join('\n\n') ? <span className="whitespace-pre-wrap break-words">{rest.join('\n\n')}</span> : null}
                </>
            );
        }
        return null;
    };

    /* ── Get main text (strip legacy reply prefix) ── */
    const getMainText = () => {
        if (message.replyTo && typeof message.replyTo === 'object') {
            return message.text; // text is clean when using replyTo reference
        }
        if (message.text?.startsWith('↩') && message.text?.includes('\n\n')) {
            const parts = message.text.split('\n\n');
            return parts.slice(1).join('\n\n');
        }
        return message.text;
    };

    const mainText = getMainText();

    return (
        <div
            className={`flex ${isOwn ? 'justify-end' : 'justify-start'} mb-2 group/bubble`}
            onTouchStart={handleTouchStart}
            onTouchMove={handleTouchMove}
            onTouchEnd={handleTouchEnd}
            onTouchCancel={handleTouchEnd}
            onMouseEnter={() => !isMobile && setHover(true)}
            onMouseLeave={() => { setHover(false); setDropdownOpen(false); }}
            style={{ touchAction: 'pan-y' }}
        >
            <div
                ref={dropdownRef}
                className="relative max-w-[70%] rounded-2xl px-3.5 py-2 text-[14px] leading-[20px] bubble-pop"
                style={{
                    backgroundColor: bubbleColors.bg,
                    border: `1.5px dashed ${bubbleColors.border}`,
                    color: bubbleColors.text,
                    fontFamily: 'var(--font-body)',
                    boxShadow: 'var(--dd-shadow-sm)',
                    borderRadius: isOwn ? '18px 18px 6px 18px' : '18px 18px 18px 6px',
                    transform: swipeOffset ? `translateX(${swipeOffset}px)` : undefined,
                    transition: swipeOffset ? 'none' : 'transform 0.2s ease',
                }}
            >
                {/* Swipe reply hint (mobile) */}
                {showReplyHint && (
                    <div
                        className="absolute left-0 top-0 bottom-0 flex items-center gap-1 px-2 -translate-x-full pointer-events-none"
                        style={{ color: 'var(--dd-primary)', fontFamily: 'var(--font-sketch)', fontSize: '12px' }}
                    >
                        <span>↩</span>
                        <span>Reply</span>
                    </div>
                )}

                {/* Forwarded badge */}
                {message.forwardedFrom && (
                    <div
                        className="flex items-center gap-1 mb-1 text-[11px]"
                        style={{ color: 'var(--dd-text-muted)', fontFamily: 'var(--font-sketch)' }}
                    >
                        <span>↗</span>
                        <span>Forwarded</span>
                    </div>
                )}

                {/* Reply block */}
                {renderReplyBlock()}

                {/* Voice note player */}
                {(message.messageType === 'voice_note' || message.messageType === 'audio') && message.mediaUrl && (
                    <div className="mb-1.5">
                        <div
                            className="flex items-center gap-2 px-2 py-1.5 rounded-xl"
                            style={{
                                backgroundColor: isOwn ? 'rgba(124,107,171,0.15)' : 'var(--dd-hover)',
                                border: `1px dashed ${isOwn ? 'var(--dd-lavender)' : 'var(--dd-border)'}`,
                            }}
                        >
                            <span className="text-lg">🎤</span>
                            <audio
                                src={message.mediaUrl}
                                controls
                                className="flex-1"
                                style={{ height: 32, maxWidth: '220px' }}
                            />
                        </div>
                    </div>
                )}

                {/* Media (image/video — not voice) */}
                {message.mediaUrl && message.messageType !== 'voice_note' && message.messageType !== 'audio' && (
                    <div className="mb-1.5">
                        {message.mediaType === 'video' ? (
                            <video
                                src={message.mediaUrl}
                                controls
                                className="max-w-full rounded-xl"
                                style={{ maxWidth: '260px' }}
                            />
                        ) : (
                            <img
                                src={message.mediaUrl}
                                alt="attachment"
                                className="max-w-full rounded-xl"
                                style={{ maxWidth: '260px' }}
                            />
                        )}
                    </div>
                )}

                {/* Text + time + status */}
                <div className="flex items-end gap-2">
                    {mainText && !message.text?.startsWith('↩') && (
                        <div className="flex-1 min-w-0">
                            <span className="whitespace-pre-wrap break-words">{mainText}</span>
                        </div>
                    )}
                    {/* Legacy text with parsed reply */}
                    {!mainText && !message.text?.startsWith('↩') && !message.mediaUrl && (
                        <div className="flex-1 min-w-0" />
                    )}
                    {message.text?.startsWith('↩') && message.text?.includes('\n\n') && !(message.replyTo && typeof message.replyTo === 'object') && (
                        <div className="flex-1 min-w-0" />
                    )}
                    {/* Clean text when using replyTo */}
                    {mainText && message.replyTo && typeof message.replyTo === 'object' && (
                        <div className="flex-1 min-w-0">
                            <span className="whitespace-pre-wrap break-words">{mainText}</span>
                        </div>
                    )}

                    <span className="flex-shrink-0 flex items-center gap-1 ml-auto self-end">
                        {!isMobile && (onReply || onForward) && (
                            <button
                                type="button"
                                onClick={(e) => { e.stopPropagation(); setDropdownOpen((o) => !o); }}
                                className="cursor-pointer transition-opacity p-0.5 leading-none"
                                style={{
                                    opacity: hover ? 1 : 0.6,
                                    color: bubbleColors.timeColor,
                                    fontSize: '14px',
                                    lineHeight: 1,
                                }}
                                aria-label="Message options"
                            >
                                ⌄
                            </button>
                        )}
                        <span className="text-[10px]" style={{ color: bubbleColors.timeColor, fontFamily: 'var(--font-sketch)' }}>
                            {new Date(message.createdAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                        </span>
                        {renderStatus()}
                    </span>
                </div>

                {/* Desktop: dropdown menu */}
                {!isMobile && (onReply || onForward) && dropdownOpen && (
                    <div
                        className="absolute z-20 py-1 rounded-lg min-w-[120px]"
                        style={{
                            top: '100%',
                            marginTop: 2,
                            right: 0,
                            left: 'auto',
                            background: 'var(--dd-card)',
                            border: '2px dashed var(--dd-border)',
                            boxShadow: 'var(--dd-shadow-md)',
                        }}
                    >
                        {onReply && (
                            <button
                                type="button"
                                className="w-full px-3 py-2 text-left text-[13px] flex items-center gap-2 cursor-pointer transition-colors rounded-md"
                                style={{ fontFamily: 'var(--font-sketch)', color: 'var(--dd-primary)' }}
                                onClick={() => { onReply(message); setDropdownOpen(false); }}
                                onMouseOver={(e) => e.currentTarget.style.background = 'var(--dd-hover)'}
                                onMouseOut={(e) => e.currentTarget.style.background = 'transparent'}
                            >
                                <span>↩</span>
                                <span>Reply</span>
                            </button>
                        )}
                        {onForward && (
                            <button
                                type="button"
                                className="w-full px-3 py-2 text-left text-[13px] flex items-center gap-2 cursor-pointer transition-colors rounded-md"
                                style={{ fontFamily: 'var(--font-sketch)', color: 'var(--dd-sky)' }}
                                onClick={() => { onForward(message); setDropdownOpen(false); }}
                                onMouseOver={(e) => e.currentTarget.style.background = 'var(--dd-hover)'}
                                onMouseOut={(e) => e.currentTarget.style.background = 'transparent'}
                            >
                                <span>↗</span>
                                <span>Forward</span>
                            </button>
                        )}
                    </div>
                )}
            </div>
        </div>
    );
});

export default ChatBubble;
