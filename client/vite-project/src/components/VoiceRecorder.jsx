import { useState, useRef, useCallback, useEffect } from 'react';

/**
 * VoiceRecorder — Record voice note with timer, waveform, and send/discard controls.
 *
 * Props:
 *   onRecordingComplete(blob, duration) — called with the audio blob + duration in seconds
 *   disabled — if true, prevent recording
 */
export default function VoiceRecorder({ onRecordingComplete, disabled }) {
    const [isRecording, setIsRecording] = useState(false);
    const [duration, setDuration] = useState(0);
    const [amplitudes, setAmplitudes] = useState([]);
    const [recordedBlob, setRecordedBlob] = useState(null);   // after stop: holds the blob
    const [recordedDuration, setRecordedDuration] = useState(0);
    const mediaRecorderRef = useRef(null);
    const chunksRef = useRef([]);
    const timerRef = useRef(null);
    const analyserRef = useRef(null);
    const animFrameRef = useRef(null);
    const streamRef = useRef(null);
    const audioCtxRef = useRef(null);
    const durationRef = useRef(0); // ref to track duration for closure

    const stopMediaTracks = useCallback(() => {
        if (streamRef.current) {
            streamRef.current.getTracks().forEach((t) => t.stop());
            streamRef.current = null;
        }
        if (audioCtxRef.current) {
            audioCtxRef.current.close().catch(() => { });
            audioCtxRef.current = null;
        }
    }, []);

    const stopRecording = useCallback(() => {
        if (mediaRecorderRef.current && mediaRecorderRef.current.state === 'recording') {
            mediaRecorderRef.current.stop();
        }
        if (timerRef.current) clearInterval(timerRef.current);
        if (animFrameRef.current) cancelAnimationFrame(animFrameRef.current);
        stopMediaTracks();
        setIsRecording(false);
    }, [stopMediaTracks]);

    const startRecording = useCallback(async () => {
        if (disabled) return;
        try {
            const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
            streamRef.current = stream;

            // Set up audio analyser for waveform
            const audioCtx = new AudioContext();
            audioCtxRef.current = audioCtx;
            const source = audioCtx.createMediaStreamSource(stream);
            const analyser = audioCtx.createAnalyser();
            analyser.fftSize = 64;
            source.connect(analyser);
            analyserRef.current = analyser;

            const mediaRecorder = new MediaRecorder(stream, {
                mimeType: MediaRecorder.isTypeSupported('audio/webm;codecs=opus')
                    ? 'audio/webm;codecs=opus'
                    : 'audio/webm',
            });
            mediaRecorderRef.current = mediaRecorder;
            chunksRef.current = [];
            durationRef.current = 0;

            mediaRecorder.ondataavailable = (e) => {
                if (e.data.size > 0) chunksRef.current.push(e.data);
            };

            mediaRecorder.onstop = () => {
                const blob = new Blob(chunksRef.current, { type: 'audio/webm;codecs=opus' });
                // Instead of auto-sending, save the blob for review
                setRecordedBlob(blob);
                setRecordedDuration(durationRef.current);
                setAmplitudes([]);
            };

            mediaRecorder.start(100);
            setIsRecording(true);
            setDuration(0);
            setRecordedBlob(null);

            timerRef.current = setInterval(() => {
                durationRef.current += 1;
                setDuration((d) => d + 1);
            }, 1000);

            // Waveform sampling
            const sampleWaveform = () => {
                if (!analyserRef.current) return;
                const data = new Uint8Array(analyserRef.current.frequencyBinCount);
                analyserRef.current.getByteFrequencyData(data);
                const avg = data.reduce((a, b) => a + b, 0) / data.length;
                setAmplitudes((prev) => [...prev.slice(-30), avg / 255]);
                animFrameRef.current = requestAnimationFrame(sampleWaveform);
            };
            sampleWaveform();
        } catch (err) {
            // eslint-disable-next-line no-console
            console.error('Microphone access denied:', err);
        }
    }, [disabled]);

    // Cleanup on unmount
    useEffect(() => {
        return () => {
            if (timerRef.current) clearInterval(timerRef.current);
            if (animFrameRef.current) cancelAnimationFrame(animFrameRef.current);
            stopMediaTracks();
        };
    }, [stopMediaTracks]);

    const formatDuration = (s) => {
        const m = Math.floor(s / 60);
        const sec = s % 60;
        return `${m}:${sec.toString().padStart(2, '0')}`;
    };

    const handleSend = useCallback(() => {
        if (recordedBlob && onRecordingComplete) {
            onRecordingComplete(recordedBlob, recordedDuration);
        }
        setRecordedBlob(null);
        setRecordedDuration(0);
        setDuration(0);
    }, [recordedBlob, recordedDuration, onRecordingComplete]);

    const handleDiscard = useCallback(() => {
        setRecordedBlob(null);
        setRecordedDuration(0);
        setDuration(0);
    }, []);

    /* ── State: Review recorded audio (send / discard) ── */
    if (recordedBlob) {
        const audioUrl = URL.createObjectURL(recordedBlob);
        return (
            <div
                className="flex items-center gap-2 px-3 py-1.5 rounded-full"
                style={{
                    background: 'var(--dd-lavender-soft)',
                    border: '2px dashed var(--dd-lavender)',
                }}
            >
                {/* Discard */}
                <button
                    type="button"
                    onClick={handleDiscard}
                    className="p-1.5 rounded-full cursor-pointer transition-transform hover:scale-110 flex-shrink-0"
                    style={{ background: 'var(--dd-coral-soft)', color: 'var(--dd-danger)' }}
                    title="Discard"
                >
                    <svg viewBox="0 0 24 24" width="16" height="16" fill="currentColor">
                        <path d="M19 6.41L17.59 5 12 10.59 6.41 5 5 6.41 10.59 12 5 17.59 6.41 19 12 13.41 17.59 19 19 17.59 13.41 12z" />
                    </svg>
                </button>

                {/* Duration label */}
                <span
                    className="text-[12px] font-bold flex-shrink-0"
                    style={{ fontFamily: 'var(--font-sketch)', color: 'var(--dd-primary)' }}
                >
                    🎤 {formatDuration(recordedDuration)}
                </span>

                {/* Mini playback */}
                <audio
                    src={audioUrl}
                    controls
                    className="flex-1"
                    style={{ height: 28, maxWidth: '140px' }}
                />

                {/* Send */}
                <button
                    type="button"
                    onClick={handleSend}
                    className="p-1.5 rounded-full cursor-pointer transition-transform hover:scale-110 flex-shrink-0"
                    style={{ background: 'var(--dd-primary)', color: '#fff' }}
                    title="Send voice note"
                >
                    <svg viewBox="0 0 24 24" width="16" height="16" fill="currentColor">
                        <path d="M2.01 21L23 12 2.01 3 2 10l15 2-15 2z" />
                    </svg>
                </button>
            </div>
        );
    }

    /* ── State: Actively recording ── */
    if (isRecording) {
        return (
            <div
                className="flex items-center gap-2 px-3 py-1.5 rounded-full"
                style={{
                    background: 'var(--dd-coral-soft)',
                    border: '2px dashed var(--dd-coral)',
                    animation: 'recording-pulse 1.5s ease-in-out infinite',
                }}
            >
                {/* Recording dot */}
                <div
                    className="w-2.5 h-2.5 rounded-full flex-shrink-0"
                    style={{ backgroundColor: 'var(--dd-danger)', animation: 'recording-dot 1s ease-in-out infinite' }}
                />
                {/* Timer */}
                <span
                    className="text-[13px] font-bold flex-shrink-0"
                    style={{ fontFamily: 'var(--font-sketch)', color: 'var(--dd-danger)' }}
                >
                    {formatDuration(duration)}
                </span>
                {/* Mini waveform */}
                <div className="flex items-center gap-[2px] h-[20px]">
                    {amplitudes.slice(-16).map((amp, i) => (
                        <div
                            key={i}
                            className="rounded-full"
                            style={{
                                width: 2.5,
                                height: Math.max(4, amp * 20),
                                backgroundColor: 'var(--dd-coral)',
                                transition: 'height 0.1s ease',
                            }}
                        />
                    ))}
                </div>
                {/* Stop button */}
                <button
                    type="button"
                    onClick={stopRecording}
                    className="p-1.5 rounded-full cursor-pointer transition-transform hover:scale-110 flex-shrink-0"
                    style={{ background: 'var(--dd-danger)', color: '#fff' }}
                    title="Stop recording"
                >
                    <svg viewBox="0 0 24 24" width="16" height="16" fill="currentColor">
                        <path d="M6 6h12v12H6z" />
                    </svg>
                </button>
            </div>
        );
    }

    /* ── State: Idle (mic button) ── */
    return (
        <button
            type="button"
            onClick={startRecording}
            disabled={disabled}
            className="p-2 rounded-full cursor-pointer transition-colors flex-shrink-0 wiggle"
            style={{
                color: 'var(--dd-text-secondary)',
                background: 'var(--dd-paper)',
            }}
            onMouseOver={(e) => {
                e.currentTarget.style.color = 'var(--dd-coral)';
                e.currentTarget.style.background = 'var(--dd-coral-soft)';
            }}
            onMouseOut={(e) => {
                e.currentTarget.style.color = 'var(--dd-text-secondary)';
                e.currentTarget.style.background = 'var(--dd-paper)';
            }}
            title="Record voice note"
        >
            <svg viewBox="0 0 24 24" width="20" height="20" fill="currentColor">
                <path d="M12 14c1.66 0 2.99-1.34 2.99-3L15 5c0-1.66-1.34-3-3-3S9 3.34 9 5v6c0 1.66 1.34 3 3 3zm5.3-3c0 3-2.54 5.1-5.3 5.1S6.7 14 6.7 11H5c0 3.41 2.72 6.23 6 6.72V21h2v-3.28c3.28-.48 6-3.3 6-6.72h-1.7z" />
            </svg>
        </button>
    );
}
