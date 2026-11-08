import mongoose from 'mongoose';
import type { Logger } from '../shared/logger.js';

/** Conecta ao MongoDB. Falha rápido se o banco não estiver acessível. */
export async function connectDb(uri: string, logger: Logger): Promise<typeof mongoose> {
  mongoose.set('strictQuery', true);
  mongoose.connection.on('disconnected', () => logger.warn('MongoDB desconectado'));
  mongoose.connection.on('reconnected', () => logger.info('MongoDB reconectado'));
  await mongoose.connect(uri, { serverSelectionTimeoutMS: 5000 });
  logger.info('MongoDB conectado');
  return mongoose;
}

export async function disconnectDb(): Promise<void> {
  await mongoose.disconnect();
}

/** Verificação de prontidão: faz um ping real no banco. */
export async function pingDb(): Promise<void> {
  const db = mongoose.connection.db;
  if (mongoose.connection.readyState !== 1 || !db) throw new Error('MongoDB não conectado');
  await db.admin().ping();
}
