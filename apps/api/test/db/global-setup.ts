import { MongoMemoryServer } from 'mongodb-memory-server';
import type { TestProject } from 'vitest/node';

let mongod: MongoMemoryServer | undefined;

/**
 * Sobe um MongoDB de verdade (em memória) uma vez por execução. Na primeira vez,
 * o binário é baixado e fica em cache. Os testes de `test/db` o usam via `inject`.
 */
export async function setup(project: TestProject) {
  mongod = await MongoMemoryServer.create();
  project.provide('mongoUri', mongod.getUri());
}

export async function teardown() {
  await mongod?.stop();
}

declare module 'vitest' {
  export interface ProvidedContext {
    mongoUri: string;
  }
}
