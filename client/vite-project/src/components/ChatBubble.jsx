export default function ChatBubble({ message, isOwn, showTail }) {
    return (
        <div className={`flex ${isOwn ? 'justify-end' : 'justify-start'} mb-[2px]`}>
            <div
                className={`relative max-w-[65%] rounded-lg px-2.5 py-1.5 text-[14.2px] leading-[19px] shadow-sm
          ${showTail ? (isOwn ? 'bubble-tail-out mr-2' : 'bubble-tail-in ml-2') : ''}
          ${isOwn ? 'rounded-tr-none' : 'rounded-tl-none'}`}
                style={{
                    backgroundColor: isOwn ? 'var(--wa-outgoing)' : 'var(--wa-incoming)',
                    color: 'var(--wa-text-primary)',
                    boxShadow: '0 1px 0.5px var(--wa-bubble-shadow)',
                }}
            >
                {/* Media attachment */}
                {message.mediaUrl && (
                    <div className="mb-1">
                        {message.mediaType === 'video' ? (
                            <video
                                src={message.mediaUrl}
                                controls
                                className="max-w-full rounded"
                                style={{ maxWidth: '280px' }}
                            />
                        ) : (
                            <img
                                src={message.mediaUrl}
                                alt="attachment"
                                className="max-w-full rounded"
                                style={{ maxWidth: '280px' }}
                            />
                        )}
                    </div>
                )}

                {/* Text + Timestamp in one flow */}
                <div className="flex items-end gap-1">
                    {message.text && (
                        <span className="whitespace-pre-wrap break-words">{message.text}</span>
                    )}
                    <span
                        className="flex-shrink-0 flex items-center gap-0.5 ml-1.5 self-end"
                        style={{ marginBottom: '-1px' }}
                    >
                        <span className="text-[11px] leading-none"
                            style={{ color: isOwn ? 'rgba(255,255,255,0.6)' : 'var(--wa-text-muted)' }}>
                            {new Date(message.createdAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                        </span>
                        {/* Double-check marks for sent messages */}
                        {isOwn && (
                            <svg viewBox="0 0 16 11" width="16" height="11"
                                style={{ fill: 'rgba(255,255,255,0.5)' }}>
                                <path d="M11.071.653a.457.457 0 0 0-.304-.102.493.493 0 0 0-.381.178l-6.19 7.636-2.011-2.095a.463.463 0 0 0-.659-.003.454.454 0 0 0-.003.654l2.357 2.459a.467.467 0 0 0 .347.149h.014a.467.467 0 0 0 .341-.165l6.489-8.01a.452.452 0 0 0 0-.6z" />
                                <path d="M14.757.653a.457.457 0 0 0-.305-.102.493.493 0 0 0-.381.178l-6.19 7.636-1.2-1.25-.386.477 1.577 1.646a.467.467 0 0 0 .347.149h.014a.467.467 0 0 0 .341-.165l6.489-8.01a.452.452 0 0 0-.306-.559z" />
                            </svg>
                        )}
                    </span>
                </div>
            </div>
        </div>
    );
}
