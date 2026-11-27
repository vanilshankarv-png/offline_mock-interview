import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import mongoose from 'mongoose';
import PhraseBank from '../models/PhraseBank.js';

const PHRASE_DIR = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../../content/phrasebank');
let cache = null;
let cacheLoadedAt = 0;
const CACHE_TTL_MS = 60_000;

async function loadPhraseBanks({ force = false } = {}) {
  if (!force && cache && Date.now() - cacheLoadedAt < CACHE_TTL_MS) return cache;
  const data = {};
  const documents = await PhraseBank.find({}).lean();
  for (const document of documents) data[document.category] = document.phrases;
  if (!documents.length && mongoose.connection.readyState !== 1) {
    for (const filename of ['openers.json', 'reactions.json', 'transitions.json', 'encouragement.json']) {
      try {
        const bank = JSON.parse(await readFile(path.join(PHRASE_DIR, filename), 'utf8'));
        data[bank.category] = bank.phrases;
      } catch (error) {
        if (error.code !== 'ENOENT') throw error;
      }
    }
  }
  cache = data;
  cacheLoadedAt = Date.now();
  return cache;
}

function getVariants(data, category, style) {
  const [bankName, group] = category.split('.');
  let variants = data[bankName];
  if (group) variants = variants?.[group];
  if (Array.isArray(variants)) return variants;
  return variants?.[style] || variants?.standard || Object.values(variants || {}).find(Array.isArray) || [];
}

export async function pick(category, style = 'standard', sessionState = {}) {
  const banks = await loadPhraseBanks();
  const variants = getVariants(banks, category, style);
  if (!variants.length) return '';
  const usedPhrases = sessionState.usedPhrases || (sessionState.usedPhrases = {});
  const used = usedPhrases[category] || [];
  const unused = variants.filter((phrase) => !used.includes(phrase));
  const pool = unused.length ? unused : variants;
  const phrase = pool[Math.floor(Math.random() * pool.length)];
  usedPhrases[category] = unused.length ? [...used, phrase] : [phrase];
  return phrase;
}

export async function seedPhraseBanks() {
  const filenames = ['openers.json', 'reactions.json', 'transitions.json', 'encouragement.json'];
  for (const filename of filenames) {
    const bank = JSON.parse(await readFile(path.join(PHRASE_DIR, filename), 'utf8'));
    await PhraseBank.updateOne({ category: bank.category }, { $set: { phrases: bank.phrases } }, { upsert: true });
  }
  cache = null;
}

export function clearPhraseCache() {
  cache = null;
  cacheLoadedAt = 0;
}
