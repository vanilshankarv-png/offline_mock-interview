import bcrypt from 'bcryptjs';
import { randomBytes } from 'node:crypto';
import { readdir, readFile } from 'node:fs/promises';
import mongoose from 'mongoose';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { connectDatabase } from '../config/database.js';
import { env } from '../config/env.js';
import User from '../models/User.js';
import NoteSet from '../models/NoteSet.js';
import { importPrebuiltNote } from '../services/adminNotes.service.js';
import { seedPhraseBanks } from '../services/phrase.service.js';
import { seedEnglishTranslations, seedLanguages } from '../services/translation.service.js';

const notesDirectory = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../../content/notes');
const passwordCheck = /^(?=.*[A-Za-z])(?=.*\d).{8,128}$/;

async function ensureAccount({ email, password, name, role }) {
  const normalizedEmail = email.toLowerCase();
  const found = await User.findOne({ email: normalizedEmail });
  if (found) {
    console.log(`${role === 'admin' ? 'Admin' : 'Demo'} account ${normalizedEmail} already exists.`);
    return;
  }
  if (!passwordCheck.test(password)) throw new Error(`${role === 'admin' ? 'ADMIN_PASSWORD' : 'DEMO_PASSWORD'} must be 8 to 128 characters and contain letters and numbers.`);
  const passwordHash = await bcrypt.hash(password, 12);
  await User.create({ name, email: normalizedEmail, passwordHash, role });
  console.log(`Created ${role} account ${normalizedEmail}.`);
}

async function seedPrebuiltNotes() {
  const filenames = (await readdir(notesDirectory)).filter((filename) => filename.toLowerCase().endsWith('.md') && filename.toLowerCase() !== 'readme.md').sort();
  for (const filename of filenames) {
    const markdown = await readFile(path.join(notesDirectory, filename), 'utf8');
    const match = markdown.match(/^---\s*\r?\n([\s\S]*?)\r?\n---\s*(?:\r?\n|$)/);
    const metadata = Object.fromEntries((match?.[1] || '').split(/\r?\n/).map((line) => {
      const field = line.match(/^\s*(title|level|language)\s*:\s*["']?(.+?)["']?\s*$/i);
      return field ? [field[1].toLowerCase(), field[2]] : [];
    }));
    const title = metadata.title || filename.replace(/\.md$/i, '').replace(/[-_]/g, ' ').replace(/\b\w/g, (char) => char.toUpperCase());
    const existingNote = await NoteSet.findOne({ ownerId: null, title });
    const text = match ? markdown.slice(match[0].length) : markdown;
    await importPrebuiltNote({ title, level: metadata.level || 'beginner', language: metadata.language || 'en', text,
      isPublished: true, existingNote });
    console.log(`Imported prebuilt note ${title}.`);
  }
}

async function seed() {
  await connectDatabase();
  await seedLanguages();
  await seedEnglishTranslations();
  await seedPhraseBanks();
  if (!env.ADMIN_EMAIL || !env.ADMIN_PASSWORD) {
    throw new Error('Languages, English translations, and phrase banks were seeded. Set ADMIN_EMAIL and ADMIN_PASSWORD to create the first admin account.');
  }
  await ensureAccount({ email: env.ADMIN_EMAIL, password: env.ADMIN_PASSWORD, name: 'Admin', role: 'admin' });
  const demoPassword = env.DEMO_PASSWORD || `Demo-${randomBytes(18).toString('hex')}x9`;
  const demoExists = await User.exists({ email: 'demo@example.com' });
  await ensureAccount({ email: 'demo@example.com', password: demoPassword, name: 'Demo User', role: 'user' });
  if (!demoExists && !env.DEMO_PASSWORD) console.log(`Temporary demo password (save it now): ${demoPassword}`);
  await seedPrebuiltNotes();
}

seed().catch((error) => {
  console.error('Seed failed:', error.message);
  process.exitCode = 1;
}).finally(async () => {
  await mongoose.disconnect();
});
