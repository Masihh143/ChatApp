/**
 * WebRTC Signaling Service — handles call setup via Socket.IO.
 * Actual media streams flow peer-to-peer; the server only relays signaling messages.
 */

/**
 * Register RTC socket handlers.
 * @param {import('socket.io').Server} io
 * @param {import('socket.io').Socket} socket
 */
export function registerRTCHandlers(io, socket) {
    const userId = String(socket.userId);

    /**
     * Initiate a call.
     * Payload: { targetUserId, conversationId, offer (RTCSessionDescription), callType: 'voice'|'video'|'screen' }
     */
    socket.on('call:initiate', ({ targetUserId, conversationId, offer, callType }) => {
        io.to(String(targetUserId)).emit('call:incoming', {
            callerId: userId,
            conversationId,
            offer,
            callType: callType || 'voice',
        });
    });

    /**
     * Answer a call.
     * Payload: { targetUserId, answer (RTCSessionDescription) }
     */
    socket.on('call:answer', ({ targetUserId, answer }) => {
        io.to(String(targetUserId)).emit('call:answered', {
            answererId: userId,
            answer,
        });
    });

    /**
     * Reject a call.
     * Payload: { targetUserId, conversationId }
     */
    socket.on('call:reject', ({ targetUserId, conversationId }) => {
        io.to(String(targetUserId)).emit('call:rejected', {
            rejecterId: userId,
            conversationId,
        });
    });

    /**
     * ICE candidate exchange.
     * Payload: { targetUserId, candidate (RTCIceCandidate) }
     */
    socket.on('call:ice-candidate', ({ targetUserId, candidate }) => {
        io.to(String(targetUserId)).emit('call:ice-candidate', {
            senderId: userId,
            candidate,
        });
    });

    /**
     * End a call.
     * Payload: { targetUserId, conversationId }
     */
    socket.on('call:end', ({ targetUserId, conversationId }) => {
        io.to(String(targetUserId)).emit('call:ended', {
            enderId: userId,
            conversationId,
        });
    });
}
