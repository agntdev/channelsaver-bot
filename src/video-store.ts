import type { StorageAdapter } from "grammy";
import { resolveSessionStorage } from "./toolkit/index.js";
import { now } from "./time.js";

export type RequestStatus = "processing" | "delivered" | "failed" | "denied" | "rate_limited";

export interface VideoRequest {
  requester_id: number;
  chat_id: number;
  message_id: number;
  timestamp: string;
  status: RequestStatus;
}

export interface AdminSettings {
  admin_chat_id?: number;
  filename_format: "original" | "timestamped";
  retention_days: 7 | 30 | 90;
}

interface RequestIndexEntry {
  key: string;
  at: number;
}

interface RateRecord {
  timestamps: number[];
}

const DEFAULT_SETTINGS: AdminSettings = {
  filename_format: "original",
  retention_days: 30,
};

/**
 * Indexed durable records. The adapter resolves to Redis in production and is
 * intentionally addressed by exact keys: no keyspace scan is ever needed.
 */
class VideoStore {
  private storage: StorageAdapter<Record<string, unknown>> =
    resolveSessionStorage<Record<string, unknown>>(undefined);

  configure(storage?: StorageAdapter<Record<string, unknown>>): void {
    this.storage = storage ?? resolveSessionStorage<Record<string, unknown>>(undefined);
  }

  private async read<T>(key: string): Promise<T | undefined> {
    return (await this.storage.read(key)) as T | undefined;
  }

  private async write(key: string, value: unknown): Promise<void> {
    await this.storage.write(key, value as Record<string, unknown>);
  }

  async settings(chatId: number): Promise<AdminSettings> {
    return { ...DEFAULT_SETTINGS, ...(await this.read<AdminSettings>(`video:settings:${chatId}`)) };
  }

  async updateSettings(chatId: number, change: Partial<AdminSettings>): Promise<AdminSettings> {
    const settings = { ...(await this.settings(chatId)), ...change };
    await this.write(`video:settings:${chatId}`, settings);
    return settings;
  }

  async record(request: VideoRequest): Promise<void> {
    const settings = await this.settings(request.chat_id);
    const at = now().getTime();
    const key = `video:request:${request.chat_id}:${request.message_id}:${at}:${request.requester_id}`;
    const indexKey = `video:index:${request.chat_id}`;
    const index = (await this.read<RequestIndexEntry[]>(indexKey)) ?? [];
    const cutoff = at - settings.retention_days * 86_400_000;
    const retained = index.filter((item) => item.at >= cutoff);
    for (const expired of index) {
      if (expired.at < cutoff) await this.storage.delete(expired.key);
    }
    await this.write(key, request);
    retained.push({ key, at });
    await this.write(indexKey, retained);
  }

  async allowRequest(chatId: number, userId: number): Promise<boolean> {
    const key = `video:rate:${chatId}:${userId}`;
    const current = (await this.read<RateRecord>(key)) ?? { timestamps: [] };
    const at = now().getTime();
    const recent = current.timestamps.filter((timestamp) => timestamp > at - 60_000);
    if (recent.length >= 5) {
      await this.write(key, { timestamps: recent });
      return false;
    }
    recent.push(at);
    await this.write(key, { timestamps: recent });
    return true;
  }
}

export const videoStore = new VideoStore();

/** Called by buildBot so feature records share the configured durable adapter. */
export function configureVideoStore(storage?: StorageAdapter<Record<string, unknown>>): void {
  videoStore.configure(storage);
}
