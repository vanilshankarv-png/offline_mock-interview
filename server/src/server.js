import app from './app.js';
import { connectDatabase } from './config/database.js';
import { env } from './config/env.js';
import { syncLlmSetting } from './services/llmSettings.service.js';

/** Starts the API after establishing its MongoDB connection. */
async function startServer() {
  await connectDatabase();
  if (!(await syncLlmSetting())) console.warn('NLP service is unavailable; optional LLM setting will be synchronized when changed by an admin.');
  const server = app.listen(env.PORT, () => {
    console.log(`TalkReady API listening on port ${env.PORT} (${env.NODE_ENV})`);
  });

  const shutdown = (signal) => {
    console.log(`${signal} received; closing the HTTP server.`);
    server.close(() => process.exit(0));
  };

  process.once('SIGINT', () => shutdown('SIGINT'));
  process.once('SIGTERM', () => shutdown('SIGTERM'));
}

startServer().catch((error) => {
  console.error('TalkReady API failed to start:', error.message);
  process.exit(1);
});
