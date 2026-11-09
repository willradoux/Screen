import type {
  RecordingFiles,
  RecordingRecord,
  RecordingRepo,
} from '../../src/modules/recordings/recordings.js';

export class MemoryRecordings implements RecordingRepo {
  rows = new Map<string, RecordingRecord>();
  async create(r: RecordingRecord) {
    this.rows.set(r.id, structuredClone(r));
  }
  async findById(id: string) {
    return structuredClone(this.rows.get(id) ?? null);
  }
  async findByEgress(egressId: string) {
    return structuredClone([...this.rows.values()].find((r) => r.egressId === egressId) ?? null);
  }
  async update(id: string, patch: Partial<RecordingRecord>) {
    const r = this.rows.get(id);
    if (!r) return null;
    Object.assign(r, patch);
    return structuredClone(r);
  }
  async list() {
    return structuredClone([...this.rows.values()]);
  }
  async active(roomId: string) {
    return structuredClone(
      [...this.rows.values()].filter(
        (r) => r.roomId === roomId && ['STARTING', 'RECORDING', 'PROCESSING'].includes(r.status),
      ),
    );
  }
  async due(now: Date) {
    return structuredClone(
      [...this.rows.values()].filter(
        (r) =>
          (r.status === 'READY' && r.expiresAt && r.expiresAt <= now) ||
          (r.status === 'PROCESSING' &&
            r.endedAt &&
            r.endedAt.getTime() <= now.getTime() - 600_000) ||
          (r.status === 'STARTING' && r.startedAt.getTime() <= now.getTime() - 300_000),
      ),
    );
  }
}

export class FakeFiles implements RecordingFiles {
  sizes = new Map<string, number>();
  removed: string[] = [];
  async size(path: string) {
    return this.sizes.get(path) ?? null;
  }
  async remove(path: string) {
    this.removed.push(path);
    this.sizes.delete(path);
  }
}
