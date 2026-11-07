// Expo Push delivery for proactive messages (port of feature/Persona_chat
// /server/lib/push.ts). Best-effort: a push hiccup never drops a message — it's
// already persisted to Mongo and shows up in history on next open.
const EXPO_ACCESS_TOKEN = process.env.EXPO_ACCESS_TOKEN ?? '';
const EXPO_ENDPOINT = 'https://api.expo.dev/v2/push/json';

/**
 * @returns {Promise<'sent'|'skipped:<reason>'>}
 */
export async function sendPush(token, { user, text, deepLink }) {
    if (!EXPO_ACCESS_TOKEN) return 'skipped:EXPO_ACCESS_TOKEN not set';
    if (!token) return 'skipped:no push token';

    const body = text.length > 80 ? text.slice(0, 80) + '…' : text;
    try {
        const res = await fetch(EXPO_ENDPOINT, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Expo-AccessToken': EXPO_ACCESS_TOKEN,
            },
            body: JSON.stringify({
                to: token,
                sound: 'default',
                body,
                title: user ?? 'New message',
                ...(deepLink ? { data: { deepLink } } : {}),
            }),
        });
        if (!res.ok) {
            const msg = await res.text();
            return `skipped:expo ${res.status} ${msg}`;
        }
        return 'sent';
    } catch (err) {
        return `skipped:${err?.message ?? String(err)}`;
    }
}
