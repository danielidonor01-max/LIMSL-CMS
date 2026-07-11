// src/lib/offline/db.ts
import Dexie, { type Table } from "dexie";

export interface PendingMutation {
  id?: string;
  url: string;
  method: string;
  body: string;
  timestamp: string;
  status: "PENDING" | "SYNCED" | "FAILED";
}

export class OfflineDatabase extends Dexie {
  mutations!: Table<PendingMutation>;

  constructor() {
    super("LimslCmsOfflineDB");
    this.version(1).stores({
      mutations: "++id, status, timestamp",
    });
  }
}

export const offlineDb = typeof window !== "undefined" ? new OfflineDatabase() : null;

// Offline Sync Manager
export async function queueMutation(url: string, method: string, body: any) {
  if (!offlineDb) return;
  const newMutation: PendingMutation = {
    url,
    method,
    body: JSON.stringify(body),
    timestamp: new Date().toISOString(),
    status: "PENDING",
  };
  await offlineDb.mutations.add(newMutation);
  console.log("📥 Mutation queued offline in IndexedDB:", url);
}

export async function syncPendingMutations() {
  if (!offlineDb || !navigator.onLine) return;

  const pending = await offlineDb.mutations
    .where("status")
    .equals("PENDING")
    .toArray();

  if (pending.length === 0) return;
  console.log(`🔄 Syncing ${pending.length} pending offline actions...`);

  for (const mut of pending) {
    try {
      const res = await fetch(mut.url, {
        method: mut.method,
        headers: { "Content-Type": "application/json" },
        body: mut.body,
      });

      if (res.ok) {
        if (mut.id) {
          await offlineDb.mutations.delete(parseInt(mut.id));
        }
      } else {
        if (mut.id) {
          await offlineDb.mutations.update(parseInt(mut.id), { status: "FAILED" });
        }
      }
    } catch (err) {
      console.error("Sync failed for mutation:", mut.url, err);
      break; // Stop execution on network error to preserve order
    }
  }
}

// Hook up window event listener
if (typeof window !== "undefined") {
  window.addEventListener("online", () => {
    console.log("🌐 Network online. Triggering synchronization...");
    syncPendingMutations();
  });
}
