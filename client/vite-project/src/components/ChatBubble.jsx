import { memo } from 'react';

/**
 * ChatBubble — wrapped in React.memo so it only re-renders when
 * its own message or isOwn prop changes (prevents full-list repaints).
 */
const ChatBubble = memo(function ChatBubble({ message, isOwn }) {
    const bubbleColors = isOwn
        ? { bg: 'var(--dd-lavender-soft)', border: 'var(--dd-lavender)', text: 'var(--dd-text)', timeColor: 'var(--dd-primary-light)' }
        : { bg: 'var(--dd-card)', border: 'var(--dd-border-sketch)', text: 'var(--dd-text)', timeColor: 'var(--dd-text-muted)' };

    return (
        <div className={`flex ${isOwn ? 'justify-end' : 'justify-start'} mb-2`}>
            <div
                className="relative max-w-[70%] rounded-2xl px-3.5 py-2 text-[14px] leading-[20px] bubble-pop"
                style={{
                    backgroundColor: bubbleColors.bg,
                    border: `1.5px dashed ${bubbleColors.border}`,
                    color: bubbleColors.text,
                    fontFamily: 'var(--font-body)',
                    boxShadow: 'var(--dd-shadow-sm)',
                    borderRadius: isOwn ? '18px 18px 6px 18px' : '18px 18px 18px 6px',
                }}
            >
                {/* Media */}
                {message.mediaUrl && (
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

                {/* Text + time */}
                <div className="flex items-end gap-2">
                    {message.text && (
                        <span className="whitespace-pre-wrap break-words">{message.text}</span>
                    )}
                    <span className="flex-shrink-0 flex items-center gap-1 ml-auto self-end">
                        <span className="text-[10px]" style={{ color: bubbleColors.timeColor, fontFamily: 'var(--font-sketch)' }}>
                            {new Date(message.createdAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                        </span>
                        {isOwn && (
                            <span className="text-[11px]" style={{ color: 'var(--dd-sage)' }}>✓✓</span>
                        )}
                    </span>
                </div>
            </div>
        </div>
    );
});

export default ChatBubble;
