import { useEffect, useRef, useState } from 'react';

const MAX_RECORDING_SECONDS = 60;

function getSpeechRecognition() {
  if (typeof window === 'undefined') return null;
  return window.SpeechRecognition || window.webkitSpeechRecognition || null;
}

function chooseRecordingMimeType() {
  if (typeof MediaRecorder === 'undefined') return '';
  return ['audio/webm;codecs=opus', 'audio/webm'].find((type) => MediaRecorder.isTypeSupported(type)) || '';
}

async function readApiData(response) {
  const body = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(body.error?.message || body.detail || 'Speech transcription is unavailable.');
  return body.data ?? body;
}

/**
 * Interview answer capture control. The host screen supplies the active IDs and
 * access token; a scored response is returned through onAnswerScored.
 */
export default function OfflineTranscriptionControl({
  sessionId,
  questionId,
  accessToken,
  language = 'en-US',
  onAnswerScored,
  speechEndpoint = '/api/v1/speech/transcribe',
  answerEndpoint = (id) => `/api/v1/sessions/${id}/answers`,
}) {
  const [offlineMode, setOfflineMode] = useState(false);
  const [recording, setRecording] = useState(false);
  const [working, setWorking] = useState(false);
  const [elapsed, setElapsed] = useState(0);
  const [message, setMessage] = useState('');
  const recorderRef = useRef(null);
  const streamRef = useRef(null);
  const recognitionRef = useRef(null);
  const browserEndedRef = useRef(null);
  const piecesRef = useRef([]);
  const wordsRef = useRef('');
  const startTimeRef = useRef(0);
  const recordingDurationRef = useRef(0);
  const stopTimerRef = useRef(null);
  const modeRef = useRef(false);
  const sentRef = useRef(false);
  const cancelCaptureRef = useRef(false);

  useEffect(() => {
    modeRef.current = offlineMode;
  }, [offlineMode]);

  useEffect(() => () => {
    window.clearTimeout(stopTimerRef.current);
    cancelCaptureRef.current = true;
    if (recorderRef.current?.state === 'recording') recorderRef.current.stop();
    recognitionRef.current?.abort?.();
    streamRef.current?.getTracks().forEach((track) => track.stop());
  }, []);

  async function submitAnswer(transcript, segments = []) {
    const cleanTranscript = transcript.trim();
    if (!cleanTranscript || sentRef.current) return;
    sentRef.current = true;
    setWorking(true);
    setMessage('Sending your answer for scoring…');
    try {
      const response = await fetch(answerEndpoint(sessionId), {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${accessToken}` },
        body: JSON.stringify({ questionId, transcript: cleanTranscript,
          durationSec: Math.max(0, Math.round(recordingDurationRef.current / 1000)),
          longPauseCount: 0, ...(segments.length ? { segments } : {}) }),
      });
      const result = await readApiData(response);
      setMessage('Answer scored.');
      onAnswerScored?.(result);
    } catch (error) {
      sentRef.current = false;
      setMessage(error.message || 'Could not submit the answer. Please try again.');
    } finally {
      setWorking(false);
    }
  }

  function startBrowserRecognition() {
    const Recognition = getSpeechRecognition();
    if (!Recognition) return false;
    const recognition = new Recognition();
    recognition.lang = language;
    recognition.continuous = true;
    recognition.interimResults = true;
    recognition.onresult = (event) => {
      wordsRef.current = Array.from(event.results).map((result) => result[0]?.transcript || '').join(' ').trim();
    };
    recognition.onerror = () => {
      if (!modeRef.current) setMessage('Browser speech input stopped. You can try recording again.');
    };
    recognition.onend = () => {
      recognitionRef.current = null;
      browserEndedRef.current?.(wordsRef.current);
      browserEndedRef.current = null;
      if (!modeRef.current && wordsRef.current) {
        recordingDurationRef.current ||= Date.now() - startTimeRef.current;
        submitAnswer(wordsRef.current);
      }
    };
    recognitionRef.current = recognition;
    try {
      recognition.start();
      return true;
    } catch {
      recognitionRef.current = null;
      return false;
    }
  }

  function stopRecording() {
    window.clearTimeout(stopTimerRef.current);
    if (!recordingDurationRef.current && startTimeRef.current) recordingDurationRef.current = Date.now() - startTimeRef.current;
    if (recorderRef.current?.state === 'recording') recorderRef.current.stop();
    try { recognitionRef.current?.stop?.(); } catch { /* It may already have ended. */ }
    setRecording(false);
  }

  function waitForBrowserFallback() {
    if (!recognitionRef.current) return Promise.resolve(wordsRef.current);
    return Promise.race([
      new Promise((resolve) => { browserEndedRef.current = resolve; }),
      new Promise((resolve) => window.setTimeout(() => resolve(wordsRef.current), 1_200)),
    ]);
  }

  async function uploadRecording(blob) {
    const extension = blob.type.includes('webm') ? 'webm' : 'wav';
    const form = new FormData();
    form.append('file', blob, `answer.${extension}`);
    const response = await fetch(speechEndpoint, {
      method: 'POST',
      headers: { Authorization: `Bearer ${accessToken}` },
      body: form,
    });
    return readApiData(response);
  }

  async function startRecording() {
    if (!sessionId || !questionId || !accessToken) {
      setMessage('The interview screen has not supplied the active session credentials.');
      return;
    }
    sentRef.current = false;
    cancelCaptureRef.current = false;
    wordsRef.current = '';
    piecesRef.current = [];
    setElapsed(0);
    setMessage('');
    recordingDurationRef.current = 0;
    startTimeRef.current = Date.now();

    if (offlineMode && typeof MediaRecorder !== 'undefined' && navigator.mediaDevices?.getUserMedia) {
      const mimeType = chooseRecordingMimeType();
      if (mimeType) {
        try {
          const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
          streamRef.current = stream;
          const recorder = new MediaRecorder(stream, { mimeType });
          recorderRef.current = recorder;
          recorder.ondataavailable = (event) => { if (event.data.size) piecesRef.current.push(event.data); };
          recorder.onstop = async () => {
            const blob = new Blob(piecesRef.current, { type: mimeType });
            stream.getTracks().forEach((track) => track.stop());
            streamRef.current = null;
            if (cancelCaptureRef.current) return;
            setWorking(true);
            setMessage('Processing on your configured offline Whisper service…');
            try {
              const result = await uploadRecording(blob);
              await submitAnswer(result.transcript, result.segments || []);
            } catch (error) {
              const browserTranscript = wordsRef.current || await waitForBrowserFallback();
              setMessage(`${error.message} ${browserTranscript ? 'Using browser speech recognition.' : 'Browser speech fallback is unavailable; try again or enter the answer another way.'}`);
              if (browserTranscript) await submitAnswer(browserTranscript);
            } finally {
              setWorking(false);
            }
          };
          recorder.start(250);
          setRecording(true);
          startBrowserRecognition(); // Kept ready as a fallback if the local service is disabled.
          stopTimerRef.current = window.setTimeout(stopRecording, MAX_RECORDING_SECONDS * 1000);
          return;
        } catch {
          streamRef.current?.getTracks().forEach((track) => track.stop());
          streamRef.current = null;
          setMessage('Microphone recording could not start. Falling back to browser speech input.');
        }
      } else {
        setMessage('This browser cannot record WebM audio. Falling back to browser speech input.');
      }
    }

    if (!startBrowserRecognition()) {
      setMessage('Speech input is unavailable in this browser. Check microphone permissions or use another input method.');
      return;
    }
    setRecording(true);
    setMessage('Listening with browser speech recognition…');
  }

  function handleStop() {
    setElapsed(Math.min(MAX_RECORDING_SECONDS, Math.round((Date.now() - startTimeRef.current) / 1000)));
    stopRecording();
  }

  useEffect(() => {
    if (!recording) return undefined;
    const timer = window.setInterval(() => {
      const seconds = Math.min(MAX_RECORDING_SECONDS, Math.floor((Date.now() - startTimeRef.current) / 1000));
      setElapsed(seconds);
      if (seconds >= MAX_RECORDING_SECONDS) stopRecording();
    }, 500);
    return () => window.clearInterval(timer);
  }, [recording]);

  return (
    <section aria-label="Answer transcription">
      <label>
        <input type="checkbox" checked={offlineMode} disabled={recording || working}
          onChange={(event) => setOfflineMode(event.target.checked)} />
        {' '}High-accuracy offline mode
      </label>
      <p>
        {offlineMode
          ? 'Your recording is sent to your configured backend and transcribed with CPU Whisper. Keep that backend on your device or local network for fully offline use. The audio file is temporary; transcription results are cached in memory by audio hash. Processing may take several seconds and can take longer than the recording, depending on your device. Tiny is fastest; base is balanced; small is slower and often more accurate.'
          : 'Uses your browser’s speech recognition. If local Whisper is unavailable, offline mode falls back to this when your browser supports it. Browser speech may use a browser-provided service.'}
      </p>
      <button type="button" onClick={recording ? handleStop : startRecording} disabled={working}>
        {recording ? `Stop recording (${elapsed}/${MAX_RECORDING_SECONDS}s)` : 'Record answer'}
      </button>
      <p role="status" aria-live="polite">{working ? 'Processing… ' : ''}{message}</p>
    </section>
  );
}
