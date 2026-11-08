import mongoose from 'mongoose';
import { afterAll, beforeAll, beforeEach, inject } from 'vitest';

/**
 * Conecta ao MongoDB de teste num banco exclusivo do arquivo, garante os índices
 * dos modelos e limpa os dados antes de cada teste.
 */
export function useTestDb(name: string, models: { init(): Promise<unknown> }[]) {
  beforeAll(async () => {
    const base = inject('mongoUri').replace(/\/?$/, '/');
    await mongoose.connect(`${base}${name}`);
    await Promise.all(models.map((m) => m.init())); // cria os índices
  });

  beforeEach(async () => {
    const collections = await mongoose.connection.db!.collections();
    await Promise.all(collections.map((c) => c.deleteMany({})));
  });

  afterAll(async () => {
    await mongoose.disconnect();
  });
}
