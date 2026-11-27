import { createHash } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import Language from '../models/Language.js';
import Translation from '../models/Translation.js';
import { languages } from '../config/languages.js';

const englishSeedPath = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../seed/defaultTranslations.en.json');
const languageCodes = new Set(languages.map((language) => language.code));

export async function listLanguages() {
  const stored = await Language.find({}).lean();
  const storedByCode = new Map(stored.map((language) => [language.code, language]));
  return languages.map((language) => ({ ...language, ...(storedByCode.get(language.code) || {})
    // Keep the public shape stable and avoid leaking Mongoose metadata.
  })).map(({ code, name, nativeName, dir, speechLocale, enabled }) => ({ code, name, nativeName, dir, speechLocale, enabled }));
}

async function getEnglishDefaults() {
  const [seedStrings, rows] = await Promise.all([
    readFile(englishSeedPath, 'utf8').then(JSON.parse),
    Translation.find({ lang: 'en' }).select('key value').lean(),
  ]);
  return Object.assign({}, seedStrings, Object.fromEntries(rows.map((row) => [row.key, row.value])));
}

export async function getMergedTranslations(lang) {
  if (!languageCodes.has(lang)) {
    const error = new Error('Unsupported language.');
    error.statusCode = 404;
    error.code = 'LANGUAGE_NOT_FOUND';
    throw error;
  }
  const [english, localizedRows] = await Promise.all([
    getEnglishDefaults(),
    lang === 'en' ? Promise.resolve([]) : Translation.find({ lang }).select('key value').lean(),
  ]);
  return Object.assign(english, Object.fromEntries(localizedRows.map((row) => [row.key, row.value])));
}

export function translationEtag(translations) {
  const digest = createHash('sha256').update(JSON.stringify(translations)).digest('hex');
  return `"${digest}"`;
}

export async function seedLanguages() {
  await Language.bulkWrite(languages.map((language) => ({
    updateOne: { filter: { code: language.code }, update: { $setOnInsert: language }, upsert: true },
  })));
}

export async function seedEnglishTranslations(actorId = null) {
  const defaults = JSON.parse(await readFile(englishSeedPath, 'utf8'));
  await Translation.bulkWrite(Object.entries(defaults).map(([key, value]) => ({
    updateOne: { filter: { lang: 'en', key }, update: { $setOnInsert: { lang: 'en', key, value, reviewed: true, updatedBy: actorId } }, upsert: true },
  })));
}

export { languageCodes };
