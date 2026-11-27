# Interview transcription control

This workspace currently has no React app or interview screen to mount into.
`src/components/OfflineTranscriptionControl.jsx` is the reusable recording and
scoring control for the React interview screen. Pass the current `sessionId`,
`questionId`, and access token. Handle the scored answer in `onAnswerScored`:

```jsx
<OfflineTranscriptionControl
  sessionId={session.id}
  questionId={question.id}
  accessToken={accessToken}
  language={speechLocale}
  onAnswerScored={(result) => setAnswerResult(result)}
/>
```

When enabled, it records up to 60 seconds, sends the recording to the authenticated
Express proxy, and submits the transcript plus word timestamps to the session
answer route. The backend counts pauses between consecutive word timestamps.
When Whisper is disabled or unavailable, the control uses browser speech
recognition when supported. It does not persist or preview raw audio.

`src/components/AdminLlmSettingsControl.jsx` is an admin-only control for the
persisted Ollama toggle and live reachability state. It calls
`GET/PATCH /api/v1/admin/settings/llm` and expects an admin access token. This
workspace does not contain an admin React page to mount it into yet.
