// WhatsApp .txt / Telegram .json export parser (port of feature/Persona_chat
// /server/lib/export-parser.ts). Returns [{ speaker, text, timestamp: Date }].
const WA_ANDROID_RE = /^(\d{1,2}\/\d{1,2}\/\d{2,4}),\s+(\d{1,2}:\d{2}(?::\d{2})?\s*[AP]M)\s+-\s+(.+?):\s+([\s\S]+)$/i;
const WA_IOS_RE = /^\[(\d{1,2}\/\d{1,2}\/\d{2,4}),\s+(\d{1,2}:\d{2}(?::\d{2})?(?:\s*[AP]M)?)\]\s+(.+?):\s+([\s\S]+)$/i;

function parseWhatsAppDate(datePart, timePart) {
    const dParts = datePart.split('/');
    if (dParts.length === 3) {
        const [d, m, y] = dParts;
        return new Date(`${m}/${d}/${y.length === 2 ? '20' + y : y} ${timePart}`);
    }
    return new Date(`${datePart} ${timePart}`);
}

export function parseWhatsApp(text) {
    const lines = text.split('\n');
    const results = [];
    let current = null;

    for (const line of lines) {
        const stripped = line.replace(/\u200e/g, '').trim(); // strip LTR marks
        const m = stripped.match(WA_ANDROID_RE) ?? stripped.match(WA_IOS_RE);

        if (m) {
            const [, datePart, timePart, speaker, msgText] = m;
            if (current) results.push(current);
            if (msgText.trim() === '<Media omitted>' || msgText.trim() === 'null') {
                current = null;
                continue;
            }
            current = {
                speaker: speaker.trim(),
                text: msgText.trim(),
                timestamp: parseWhatsAppDate(datePart.trim(), timePart.trim()),
            };
        } else if (current && stripped) {
            current.text += '\n' + stripped;
        }
    }
    if (current) results.push(current);

    return results.filter((r) => !isNaN(r.timestamp.getTime()) && r.text.length > 0);
}

function flattenTelegramText(t) {
    if (typeof t === 'string') return t;
    if (!t) return '';
    return t.map((e) => (typeof e === 'string' ? e : e.text ?? '')).join('');
}

export function parseTelegram(jsonStr) {
    let data;
    try {
        data = JSON.parse(jsonStr);
    } catch {
        throw new Error('Invalid Telegram export: could not parse JSON');
    }
    if (!Array.isArray(data.messages)) {
        throw new Error('Invalid Telegram export: missing "messages" array');
    }
    return data.messages
        .filter((m) => m.type === 'message' && m.from)
        .map((m) => ({
            speaker: m.from.trim(),
            text: flattenTelegramText(m.text).trim(),
            timestamp: new Date(m.date),
        }))
        .filter((r) => r.text.length > 0 && !isNaN(r.timestamp.getTime()));
}

/** Detect format from the filename and parse accordingly. */
export function parseExport(filename, content) {
    const lower = filename.toLowerCase();
    if (lower.endsWith('.json')) {
        return parseTelegram(content);
    }
    const msgs = parseWhatsApp(content);
    if (msgs.length === 0) {
        throw new Error(
            `Could not parse "${filename}" as a WhatsApp export. ` +
            'Ensure it is a WhatsApp .txt export (Android or iOS format).',
        );
    }
    return msgs;
}
