import ChatMessage from '../models/ChatMessage.js';
import ChatSession from '../models/ChatSession.js';
import Chunk from '../models/Chunk.js';
import NoteSet from '../models/NoteSet.js';
import nlpClient from './nlpClient.js';

export const CHAT_LOW_CONFIDENCE = 0.35;
const OUT_OF_SCOPE = 'I couldn\'t find that in your notes. Try rephrasing your question or upload notes that cover this topic.';

export async function loadAllowedChunks(userId, noteSetIds) {
  const criteria = { $or: [{ ownerId: userId }, { ownerId: null, isPublished: true }] };
  if (noteSetIds?.length) criteria._id = { $in: noteSetIds };
  const noteSets = await NoteSet.find(criteria).select('_id title language').lean();
  if (!noteSets.length) return [];
  const notesById = new Map(noteSets.map((note) => [String(note._id), note]));
  const chunks = await Chunk.find({ noteSetId: { $in: noteSets.map((note) => note._id) } }).select('noteSetId topic text embedding').lean();
  return chunks.map((chunk) => {
    const note = notesById.get(String(chunk.noteSetId));
    return { id: String(chunk._id), noteSetId: String(note._id), title: note.title, language: note.language || 'en',
      topic: chunk.topic, text: chunk.text, embedding: chunk.embedding || [] };
  });
}

function detectIntent(message) {
  const normalized = message.toLowerCase().trim();
  if (/^(hi|hello|hey|good morning|good afternoon|good evening|how are you)[!.?\s]*$/.test(normalized)) return 'greeting';
  if (/how (?:do|should) i answer .*tell me about yourself|tell me about yourself/.test(normalized)) return 'tell_me_about_yourself';
  if (/\bwhat is (?:the )?star method\b|\bexplain star method\b|\bhow (?:do|should) i use star\b/.test(normalized)) return 'star_method';
  return null;
}

function noAnswer() {
  return { answer: OUT_OF_SCOPE, sources: [], confidence: 0, flagged: true };
}

export async function sendChat({ user, message, noteSetIds, language, sessionId, client = nlpClient }) {
  const chunks = await loadAllowedChunks(user._id, noteSetIds);
  const intent = detectIntent(message);
  let contextChunks = chunks;
  let response;
  if (intent === 'greeting') {
    response = { answer: 'Hi! I\'m ready to help you study from your notes. What would you like to work on?', sources: [], confidence: 1 };
  } else {
    if (intent === 'tell_me_about_yourself' || intent === 'star_method') {
      contextChunks = chunks.filter((chunk) => /communication[\s-]*basics/i.test(chunk.title));
    }
    const nlpResponse = await client.post('/nlp/chat', {
      question: message, chunks: contextChunks, topK: 4, ...(language ? { language } : {}),
    });
    const allowedChunks = new Map(contextChunks.map((chunk) => [chunk.id, chunk]));
    const sources = (nlpResponse.data.sources || []).filter((source) => allowedChunks.has(String(source.chunkId ?? source.id)))
      .map((source) => {
        const chunk = allowedChunks.get(String(source.chunkId ?? source.id));
        return { noteSetId: chunk.noteSetId, chunkId: chunk.id, title: chunk.title,
          ...(Number.isFinite(source.score) ? { score: source.score } : {}) };
      });
    response = { answer: nlpResponse.data.answer || '', sources, confidence: Number(nlpResponse.data.confidence) || 0 };
  }

  if (response.confidence < CHAT_LOW_CONFIDENCE) response = { ...response, ...noAnswer(), sources: response.sources || [] };
  const session = sessionId
    ? await ChatSession.findOne({ _id: sessionId, userId: user._id })
    : await ChatSession.create({ userId: user._id, title: message.slice(0, 160), lastActivityAt: new Date() });
  if (!session) {
    const error = new Error('Chat session not found.');
    error.statusCode = 404;
    error.code = 'NOT_FOUND';
    throw error;
  }
  if (sessionId) {
    session.lastActivityAt = new Date();
    await session.save();
  }
  const userMessage = await ChatMessage.create({ sessionId: session._id, userId: user._id, role: 'user', content: message });
  const assistantMessage = await ChatMessage.create({ sessionId: session._id, userId: user._id, role: 'assistant',
    content: response.answer, sources: response.sources || [], confidence: response.confidence,
    flagged: Boolean(response.flagged), flagReason: response.flagged ? 'low_confidence' : null });
  return { sessionId: String(session._id), answer: assistantMessage.content, sources: response.sources || [],
    confidence: response.confidence, flagged: Boolean(response.flagged), userMessageId: String(userMessage._id),
    assistantMessageId: String(assistantMessage._id) };
}

export async function getChatHistory({ userId, sessionId, page = 1, limit = 20 }) {
  const session = await ChatSession.findOne({ _id: sessionId, userId }).select('_id');
  if (!session) {
    const error = new Error('Chat session not found.');
    error.statusCode = 404;
    error.code = 'NOT_FOUND';
    throw error;
  }
  const filter = { userId, sessionId: session._id };
  const [messages, total] = await Promise.all([
    ChatMessage.find(filter).sort({ createdAt: 1 }).skip((page - 1) * limit).limit(limit).lean(),
    ChatMessage.countDocuments(filter),
  ]);
  return { messages, page, limit, total, totalPages: Math.ceil(total / limit) };
}

export async function deleteChatSession({ userId, sessionId }) {
  const session = await ChatSession.findOneAndDelete({ _id: sessionId, userId });
  if (!session) {
    const error = new Error('Chat session not found.');
    error.statusCode = 404;
    error.code = 'NOT_FOUND';
    throw error;
  }
  await ChatMessage.deleteMany({ sessionId: session._id, userId });
  return { sessionId: String(session._id), deleted: true };
}

