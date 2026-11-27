import AppSetting from '../models/AppSetting.js';
import { env } from '../config/env.js';
import nlpClient from './nlpClient.js';
import { writeAudit } from '../utils/audit.js';

const ENABLED_KEY = 'llm.enabled';
const STATUS_TIMEOUT_MS = 4_000;

async function desiredEnabled() {
  const setting = await AppSetting.findOne({ key: ENABLED_KEY }).lean();
  return setting ? Boolean(setting.value) : env.ENABLE_OLLAMA;
}

async function serviceStatus() {
  try {
    const response = await nlpClient.get('/nlp/llm/status', { timeout: STATUS_TIMEOUT_MS });
    return { serviceAvailable: true, reachable: Boolean(response.data.reachable), model: response.data.model || null,
      modelAvailable: Boolean(response.data.modelAvailable), serviceEnabled: Boolean(response.data.enabled) };
  } catch {
    return { serviceAvailable: false, reachable: false, model: null, modelAvailable: false, serviceEnabled: null };
  }
}

export async function getLlmStatus() {
  const [enabled, service] = await Promise.all([desiredEnabled(), serviceStatus()]);
  return { enabled, reachable: service.reachable, model: service.model,
    modelAvailable: service.modelAvailable, applied: service.serviceAvailable && service.serviceEnabled === enabled };
}

export async function setLlmEnabled(enabled, actorId) {
  const previous = await AppSetting.findOne({ key: ENABLED_KEY }).lean();
  const wasEnabled = previous ? Boolean(previous.value) : env.ENABLE_OLLAMA;
  await AppSetting.updateOne({ key: ENABLED_KEY }, { $set: { value: enabled } }, { upsert: true });
  if (wasEnabled !== enabled) {
    await writeAudit({ actorId, action: 'setting.updated', resourceType: 'setting', resourceId: ENABLED_KEY,
      changes: { enabledBefore: wasEnabled, enabledAfter: enabled } });
  }
  try {
    const response = await nlpClient.post('/nlp/llm/settings', { enabled }, { timeout: STATUS_TIMEOUT_MS });
    return { enabled, reachable: Boolean(response.data.reachable), model: response.data.model || null,
      modelAvailable: Boolean(response.data.modelAvailable), applied: response.data.enabled === enabled };
  } catch {
    return { enabled, reachable: false, model: null, modelAvailable: false, applied: false };
  }
}

export async function syncLlmSetting() {
  const enabled = await desiredEnabled();
  try {
    await nlpClient.post('/nlp/llm/settings', { enabled }, { timeout: STATUS_TIMEOUT_MS });
    return true;
  } catch {
    return false;
  }
}
