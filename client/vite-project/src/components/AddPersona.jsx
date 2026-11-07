// AddPersona — modal to create a persona and (optionally) upload a chat export.
// Ported from feature/Persona_chat add-persona screen into the doodle web style.
// Steps: form (name + relationship) → upload (.txt/.json) → poll status → done.
import { useState, useRef, useEffect, useCallback } from 'react';
import { personaApi } from '../lib/personaApi';

const RELATIONSHIP_PRESETS = ['Friend', 'Partner', 'Family', 'Colleague', 'Mentor'];

const STATUS_LABEL = {
    uploaded: 'Uploaded — queued for processing…',
    parsing: 'Parsing messages…',
    embedding: 'Generating AI embeddings…',
    ready: 'Done! Voice profile created ✓',
    failed: 'Ingestion failed — check your export file',
};
const STATUS_PERCENT = { uploaded: 10, parsing: 30, embedding: 65, ready: 100, failed: 100 };

export default function AddPersona({ authClient, onCreated, onClose }) {
    const [step, setStep] = useState('form'); // form | upload | polling | done
    const [name, setName] = useState('');
    const [relationship, setRelationship] = useState('');
    const [formError, setFormError] = useState('');
    const [creating, setCreating] = useState(false);
    const [persona, setPersona] = useState(null);

    const [pickedFile, setPickedFile] = useState(null);
    const [uploading, setUploading] = useState(false);
    const [uploadError, setUploadError] = useState('');

    const [exportStatus, setExportStatus] = useState('uploaded');
    const [pollingError, setPollingError] = useState('');
    const pollingRef = useRef(null);
    const fileRef = useRef(null);

    // Clear the poller on unmount
    useEffect(() => () => { if (pollingRef.current) clearInterval(pollingRef.current); }, []);

    const startPolling = useCallback(
        (personaId) => {
            if (pollingRef.current) clearInterval(pollingRef.current);
            pollingRef.current = setInterval(async () => {
                try {
                    const res = await personaApi.getExportStatus(authClient, personaId);
                    const status = res.data.status;
                    setExportStatus(status);
                    if (status === 'ready') {
                        clearInterval(pollingRef.current);
                        setStep('done');
                    } else if (status === 'failed') {
                        clearInterval(pollingRef.current);
                        setPollingError('Ingestion failed — the export may have a parse error.');
                    }
                } catch {
                    clearInterval(pollingRef.current);
                    setPollingError('Failed to poll status.');
                }
            }, 3000);
        },
        [authClient],
    );

    const handleCreate = async () => {
        setFormError('');
        if (!name.trim() || !relationship.trim()) {
            setFormError('Name and relationship are required');
            return;
        }
        setCreating(true);
        try {
            const res = await personaApi.create(authClient, {
                name: name.trim(),
                relationship: relationship.trim(),
            });
            setPersona(res.data);
            setStep('upload');
            onCreated?.(res.data);
        } catch (e) {
            setFormError(e?.response?.data?.message ?? 'Failed to create persona');
        } finally {
            setCreating(false);
        }
    };

    const handleUpload = async () => {
        if (!pickedFile || !persona) return;
        setUploading(true);
        setUploadError('');
        try {
            await personaApi.uploadExport(authClient, persona._id, pickedFile);
            setStep('polling');
            startPolling(persona._id);
        } catch (e) {
            setUploadError(e?.response?.data?.message ?? 'Upload failed');
        } finally {
            setUploading(false);
        }
    };

    const pct = STATUS_PERCENT[exportStatus];

    return (
        <div className="fixed inset-0 z-40 flex items-center justify-center" style={{ backgroundColor: 'rgba(0,0,0,0.4)' }}>
            <div
                className="w-full max-w-[420px] max-h-[88vh] overflow-y-auto p-5"
                style={{ backgroundColor: 'var(--dd-card)', border: '2px dashed var(--dd-border)', borderRadius: 22, boxShadow: 'var(--dd-shadow-lg)' }}
            >
                {/* Header */}
                <div className="flex items-center justify-between mb-4">
                    <h3 className="text-lg font-bold" style={{ fontFamily: 'var(--font-hand)', color: 'var(--dd-primary)' }}>
                        {step === 'form' ? 'New Persona' : step === 'upload' ? 'Upload Export' : step === 'polling' ? 'Processing…' : '🎉 Persona Ready'}
                    </h3>
                    <button onClick={onClose} className="p-1 rounded-full cursor-pointer" style={{ color: 'var(--dd-text-muted)' }}>
                        <svg viewBox="0 0 24 24" width="20" height="20" fill="currentColor">
                            <path d="M19 6.41L17.59 5 12 10.59 6.41 5 5 6.41 10.59 12 5 17.59 6.41 19 12 13.41 17.59 19 19 17.59 13.41 12z" />
                        </svg>
                    </button>
                </div>

                {/* ── Step 1: form ── */}
                {step === 'form' && (
                    <div>
                        <p className="text-[13px] mb-4 leading-relaxed" style={{ color: 'var(--dd-text-secondary)', fontFamily: 'var(--font-sketch)' }}>
                            Give your persona a name and relationship. You can upload a chat export next to build an AI voice profile.
                        </p>

                        <label className="block text-[11px] font-bold uppercase tracking-widest mb-1.5" style={{ color: 'var(--dd-text-secondary)' }}>
                            Name
                        </label>
                        <input
                            type="text"
                            className="w-full px-4 py-2.5 text-[14px] doodle-input mb-4"
                            style={{ color: 'var(--dd-text)' }}
                            placeholder="e.g. Alex"
                            value={name}
                            onChange={(e) => setName(e.target.value)}
                        />

                        <label className="block text-[11px] font-bold uppercase tracking-widest mb-1.5" style={{ color: 'var(--dd-text-secondary)' }}>
                            Relationship
                        </label>
                        <div className="flex flex-wrap gap-1.5 mb-3">
                            {RELATIONSHIP_PRESETS.map((r) => (
                                <button
                                    key={r}
                                    type="button"
                                    onClick={() => setRelationship(r)}
                                    className="px-3 py-1.5 rounded-full cursor-pointer text-[13px] transition-all"
                                    style={{
                                        background: relationship === r ? 'var(--dd-primary)' : 'var(--dd-paper)',
                                        color: relationship === r ? '#fff' : 'var(--dd-text-secondary)',
                                        border: `1.5px dashed ${relationship === r ? 'var(--dd-lavender)' : 'var(--dd-border)'}`,
                                    }}
                                >
                                    {r}
                                </button>
                            ))}
                        </div>
                        <input
                            type="text"
                            className="w-full px-4 py-2.5 text-[14px] doodle-input mb-5"
                            style={{ color: 'var(--dd-text)' }}
                            placeholder="or type your own…"
                            value={relationship}
                            onChange={(e) => setRelationship(e.target.value)}
                        />

                        {formError && <p className="text-[13px] mb-3 text-center" style={{ color: 'var(--dd-danger)' }}>{formError}</p>}

                        <button
                            onClick={handleCreate}
                            disabled={creating}
                            className="w-full py-3 rounded-2xl font-bold text-[15px] cursor-pointer transition-all"
                            style={{ background: 'var(--dd-primary)', color: '#fff', boxShadow: 'var(--dd-shadow-md)', opacity: creating ? 0.7 : 1 }}
                        >
                            {creating ? 'Creating…' : 'Create Persona →'}
                        </button>
                    </div>
                )}

                {/* ── Step 2: upload ── */}
                {step === 'upload' && persona && (
                    <div>
                        <div
                            className="flex items-center gap-3 p-3 mb-5"
                            style={{ backgroundColor: 'var(--dd-paper)', border: '1.5px dashed var(--dd-border)', borderRadius: 16 }}
                        >
                            <span className="text-3xl">✅</span>
                            <div>
                                <div className="font-bold" style={{ color: 'var(--dd-text)' }}>{persona.name}</div>
                                <div className="text-[13px]" style={{ color: 'var(--dd-text-secondary)' }}>{persona.relationship} · created</div>
                            </div>
                        </div>

                        <p className="text-[13px] mb-4 leading-relaxed" style={{ color: 'var(--dd-text-secondary)', fontFamily: 'var(--font-sketch)' }}>
                            Upload a WhatsApp <b>.txt</b> or Telegram <b>.json</b> export to build a voice profile. You can skip this.
                        </p>

                        <label
                            className="block cursor-pointer py-7 text-center transition-all"
                            style={{ border: '2px dashed var(--dd-border)', borderRadius: 16, backgroundColor: 'var(--dd-paper)' }}
                        >
                            <div className="text-4xl mb-2">{pickedFile ? '📄' : '📁'}</div>
                            <div className="font-semibold text-[15px]" style={{ color: 'var(--dd-text)' }}>
                                {pickedFile ? pickedFile.name : 'Choose Export File'}
                            </div>
                            <div className="text-[12px] mt-1" style={{ color: 'var(--dd-text-muted)' }}>
                                {pickedFile ? 'Tap to change' : 'WhatsApp .txt or Telegram .json'}
                            </div>
                            <input
                                ref={fileRef}
                                type="file"
                                accept=".txt,.json"
                                className="hidden"
                                onChange={(e) => setPickedFile(e.target.files?.[0] || null)}
                            />
                        </label>

                        {uploadError && <p className="text-[13px] my-3 text-center" style={{ color: 'var(--dd-danger)' }}>{uploadError}</p>}

                        {pickedFile && (
                            <button
                                onClick={handleUpload}
                                disabled={uploading}
                                className="w-full py-3 rounded-2xl font-bold text-[15px] cursor-pointer my-2 transition-all"
                                style={{ background: 'var(--dd-primary)', color: '#fff', boxShadow: 'var(--dd-shadow-md)', opacity: uploading ? 0.7 : 1 }}
                            >
                                {uploading ? 'Uploading…' : 'Upload & Process →'}
                            </button>
                        )}

                        <button
                            onClick={onClose}
                            className="w-full py-2.5 cursor-pointer text-[13px]"
                            style={{ color: 'var(--dd-text-muted)', fontFamily: 'var(--font-sketch)' }}
                        >
                            Skip for now
                        </button>
                    </div>
                )}

                {/* ── Step 3: polling / done ── */}
                {(step === 'polling' || step === 'done') && (
                    <div className="text-center pt-4">
                        <div className="text-6xl mb-5">
                            {exportStatus === 'ready' ? '🧠' : exportStatus === 'failed' ? '❌' : '⚙️'}
                        </div>
                        <div className="text-lg font-bold mb-1" style={{ color: 'var(--dd-text)' }}>
                            {exportStatus === 'ready' ? 'Voice profile ready!' : exportStatus === 'failed' ? 'Processing failed' : 'Processing export…'}
                        </div>
                        <p className="text-[13px] mb-5" style={{ color: 'var(--dd-text-secondary)', fontFamily: 'var(--font-sketch)' }}>
                            {STATUS_LABEL[exportStatus]}
                        </p>

                        <div className="w-full h-2 rounded-full overflow-hidden mb-1" style={{ backgroundColor: 'var(--dd-paper)', border: '1px dashed var(--dd-border)' }}>
                            <div
                                className="h-full rounded-full transition-all duration-400"
                                style={{ width: `${pct}%`, backgroundColor: exportStatus === 'failed' ? 'var(--dd-danger)' : 'var(--dd-primary)' }}
                            />
                        </div>
                        <div className="text-[12px] mb-5 text-right" style={{ color: 'var(--dd-text-muted)' }}>{pct}%</div>

                        {pollingError && <p className="text-[13px] mb-4" style={{ color: 'var(--dd-danger)' }}>{pollingError}</p>}

                        {step === 'done' ? (
                            <button
                                onClick={onClose}
                                className="w-full py-3 rounded-2xl font-bold text-[15px] cursor-pointer"
                                style={{ background: 'var(--dd-primary)', color: '#fff', boxShadow: 'var(--dd-shadow-md)' }}
                            >
                                Start Chatting →
                            </button>
                        ) : null}
                        {exportStatus === 'failed' && (
                            <button onClick={onClose} className="w-full py-2.5 cursor-pointer text-[13px]" style={{ color: 'var(--dd-text-muted)' }}>
                                Go back
                            </button>
                        )}
                    </div>
                )}
            </div>
        </div>
    );
}
