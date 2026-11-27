import axios from 'axios';
import { env } from '../config/env.js';

const nlpClient = axios.create({
  baseURL: env.NLP_SERVICE_URL,
  timeout: 30_000,
  headers: { 'X-Internal-Key': env.INTERNAL_KEY },
});

nlpClient.interceptors.response.use((response) => response, (error) => {
  if (error.response) return Promise.reject(error);
  const unavailable = new Error('The coaching service is unavailable right now. Please try again shortly.');
  unavailable.statusCode = 503;
  unavailable.code = 'NLP_SERVICE_UNAVAILABLE';
  return Promise.reject(unavailable);
});

export default nlpClient;
