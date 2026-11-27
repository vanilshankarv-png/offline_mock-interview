import Chunk from '../models/Chunk.js';
import NoteSet from '../models/NoteSet.js';
import Question from '../models/Question.js';
import nlpClient from './nlpClient.js';

async function extractUpload(file) {
  if (file.mimetype === 'application/pdf') {
    const body = new FormData();
    body.append('file', new Blob([file.buffer], { type: file.mimetype }), file.originalname);
    const response = await nlpClient.post('/nlp/extract-pdf', body);
    return response.data.text;
  }
  return file.buffer.toString('utf8');
}

export async function importPrebuiltNote({ title, level, language = 'en', text, file, existingNote = null, isPublished }) {
  const rawText = file ? await extractUpload(file) : text;
  if (!rawText?.trim()) {
    const error = new Error('The note does not contain any readable text.');
    error.statusCode = 422;
    error.code = 'EMPTY_NOTE';
    throw error;
  }
  const ingestedResponse = await nlpClient.post('/nlp/ingest', { text: rawText, language });
  const chunks = ingestedResponse.data;
  if (!Array.isArray(chunks) || chunks.length === 0) {
    const error = new Error('The NLP service could not find usable note content.');
    error.statusCode = 422;
    error.code = 'EMPTY_NOTE';
    throw error;
  }

  const note = existingNote || await NoteSet.create({ ownerId: null, isPrebuilt: true, title, level, language, rawText,
    isPublished: Boolean(isPublished) });
  let newChunkIds = [];
  let newQuestionIds = [];
  try {
    const insertedChunks = await Chunk.insertMany(chunks.map((chunk) => ({ noteSetId: note._id,
      topic: chunk.topic || 'General', text: chunk.text, keywords: chunk.keywords || [],
      definitions: chunk.definitions || [], embedding: chunk.embedding || [] })));
    newChunkIds = insertedChunks.map((chunk) => chunk._id);
    const questionResponse = await nlpClient.post('/nlp/questions', { chunks: insertedChunks.map((chunk) => ({
      id: String(chunk._id), topic: chunk.topic, text: chunk.text, keywords: chunk.keywords, definitions: chunk.definitions,
    })) });
    const questions = questionResponse.data;
    if (!Array.isArray(questions)) throw new Error('The NLP service returned an invalid questions response.');
    const insertedQuestions = questions.length ? await Question.insertMany(questions.map((question) => ({
      noteSetId: note._id, chunkId: question.chunkId, topic: question.topic || 'General', type: question.type,
      text: question.text, expectedKeywords: question.expectedKeywords || [], difficulty: question.difficulty || 'medium',
    }))) : [];
    newQuestionIds = insertedQuestions.map((question) => question._id);
    const oldChunkIds = existingNote ? await Chunk.find({ noteSetId: note._id }).distinct('_id') : [];
    const oldQuestionIds = existingNote ? await Question.find({ noteSetId: note._id }).distinct('_id') : [];
    if (existingNote) {
      existingNote.title = title;
      existingNote.level = level;
      existingNote.language = language;
      existingNote.rawText = rawText;
      existingNote.isPrebuilt = true;
      if (isPublished !== undefined) existingNote.isPublished = isPublished;
      await existingNote.save();
      await Promise.all([Question.deleteMany({ _id: { $in: oldQuestionIds.filter((id) => !newQuestionIds.some((fresh) => String(fresh) === String(id))) } }),
        Chunk.deleteMany({ _id: { $in: oldChunkIds.filter((id) => !newChunkIds.some((fresh) => String(fresh) === String(id))) } })]);
    }
    return { note, chunkCount: insertedChunks.length, questionCount: insertedQuestions.length };
  } catch (error) {
    await Promise.all([Question.deleteMany({ _id: { $in: newQuestionIds } }), Chunk.deleteMany({ _id: { $in: newChunkIds } })]);
    if (!existingNote) await NoteSet.deleteOne({ _id: note._id });
    throw error;
  }
}

export async function deletePrebuiltNote(note) {
  await Promise.all([Chunk.deleteMany({ noteSetId: note._id }), Question.deleteMany({ noteSetId: note._id })]);
  await NoteSet.deleteOne({ _id: note._id });
}
