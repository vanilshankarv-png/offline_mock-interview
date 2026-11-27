import mongoose from 'mongoose';
import { env } from './env.js';

/** Connects Mongoose to the configured MongoDB database. */
export async function connectDatabase() {
  mongoose.set('strictQuery', true);
  await mongoose.connect(env.MONGODB_URI);
}
