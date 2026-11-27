import { useEffect, useState } from 'react';

const SETTINGS_URL = '/api/v1/admin/settings/llm';

async function readResponse(response) {
  const body = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(body.error?.message || 'Could not load the LLM setting.');
  return body.data ?? body;
}

/** Admin-only control for the persisted Ollama setting and live reachability. */
export default function AdminLlmSettingsControl({ accessToken, onChange }) {
  const [status, setStatus] = useState(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  async function loadStatus() {
    setBusy(true);
    setError('');
    try {
      const response = await fetch(SETTINGS_URL, { headers: { Authorization: `Bearer ${accessToken}` } });
      const result = await readResponse(response);
      setStatus(result);
      onChange?.(result);
    } catch (problem) {
      setError(problem.message || 'Could not load the LLM setting.');
    } finally {
      setBusy(false);
    }
  }

  useEffect(() => { loadStatus(); }, [accessToken]);

  async function updateEnabled(event) {
    const enabled = event.target.checked;
    setBusy(true);
    setError('');
    try {
      const response = await fetch(SETTINGS_URL, {
        method: 'PATCH',
        headers: { Authorization: `Bearer ${accessToken}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ enabled }),
      });
      const result = await readResponse(response);
      setStatus(result);
      onChange?.(result);
    } catch (problem) {
      setError(problem.message || 'Could not update the LLM setting.');
    } finally {
      setBusy(false);
    }
  }

  return (
    <section aria-labelledby="llm-settings-title">
      <h2 id="llm-settings-title">Optional Ollama language model</h2>
      <p>Reachability: {status ? (status.reachable ? 'reachable' : 'unavailable') : 'checking…'}</p>
      {status?.model && <p>Configured model: {status.model}{status.modelAvailable ? ' (available)' : ' (not downloaded)'}</p>}
      <label>
        <input type="checkbox" checked={Boolean(status?.enabled)} disabled={!status || busy}
          onChange={updateEnabled} />
        {' '}Enable note-grounded follow-ups and text rewrites
      </label>
      {status && !status.applied && <p>The saved setting has not reached the NLP service yet.</p>}
      {error && <p role="alert">{error}</p>}
      <button type="button" disabled={busy} onClick={loadStatus}>Refresh status</button>
    </section>
  );
}
