/**
 * SkeletonLoader — Doodle-themed skeleton placeholders.
 */

/* ── Skeleton for conversation list items ── */
export function ChatListSkeleton({ count = 5 }) {
    return (
        <div className="px-1 py-1">
            {Array.from({ length: count }).map((_, i) => (
                <div
                    key={i}
                    className="flex items-center gap-3 px-3 py-3 mx-1.5 rounded-xl"
                    style={{ animation: `shimmer 1.5s ease-in-out ${i * 0.1}s infinite` }}
                >
                    {/* Avatar skeleton */}
                    <div
                        className="flex-shrink-0 rounded-full skeleton-pulse"
                        style={{
                            width: 44,
                            height: 44,
                            border: '2px dashed var(--dd-border)',
                            backgroundColor: 'var(--dd-hover)',
                        }}
                    />
                    {/* Text skeleton */}
                    <div className="flex-1 min-w-0">
                        <div
                            className="skeleton-pulse rounded-full mb-2"
                            style={{
                                height: 12,
                                width: `${60 + (i % 3) * 15}%`,
                                backgroundColor: 'var(--dd-hover)',
                            }}
                        />
                        <div
                            className="skeleton-pulse rounded-full"
                            style={{
                                height: 10,
                                width: `${40 + (i % 4) * 10}%`,
                                backgroundColor: 'var(--dd-hover)',
                            }}
                        />
                    </div>
                    {/* Time skeleton */}
                    <div
                        className="skeleton-pulse rounded-full flex-shrink-0"
                        style={{
                            height: 10,
                            width: 36,
                            backgroundColor: 'var(--dd-hover)',
                        }}
                    />
                </div>
            ))}
        </div>
    );
}

/* ── Skeleton for message bubbles ── */
export function MessageSkeleton({ count = 6 }) {
    return (
        <div className="px-[4%] md:px-[10%] py-3">
            {Array.from({ length: count }).map((_, i) => {
                const isOwn = i % 3 === 0;
                return (
                    <div
                        key={i}
                        className={`flex ${isOwn ? 'justify-end' : 'justify-start'} mb-3`}
                        style={{ animation: `shimmer 1.5s ease-in-out ${i * 0.12}s infinite` }}
                    >
                        <div
                            className="rounded-2xl skeleton-pulse"
                            style={{
                                width: `${35 + (i % 4) * 10}%`,
                                maxWidth: '70%',
                                height: 42 + (i % 3) * 12,
                                backgroundColor: isOwn ? 'var(--dd-lavender-soft)' : 'var(--dd-hover)',
                                border: `1.5px dashed ${isOwn ? 'var(--dd-lavender)' : 'var(--dd-border)'}`,
                                borderRadius: isOwn ? '18px 18px 6px 18px' : '18px 18px 18px 6px',
                                opacity: 0.6,
                            }}
                        />
                    </div>
                );
            })}
        </div>
    );
}
