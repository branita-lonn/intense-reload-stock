// lib/offline-queue.ts
// IndexedDB client-only helper to queue and manage offline sales.

"use client";

import type { LogSaleInput } from "@/lib/validations/sale";

export interface PendingOfflineSale {
  localId: string;
  branchId: string;
  items: LogSaleInput["items"];
  createdAt: number;
  retryCount: number;
}

/**
 * Helper to wrap IndexedDB request callbacks in standard Promises.
 * This is necessary because IndexedDB was designed prior to Promises and uses a callback-based
 * event model (onsuccess/onerror) rather than resolving natively. A lightweight wrapper is
 * preferred over importing a heavy third-party library to minimize client-side bundle size.
 */
function idbRequest<T>(request: IDBRequest<T>): Promise<T> {
  return new Promise((resolve, reject) => {
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

/**
 * Initializes and opens the IndexedDB database for offline sales.
 */
function getDB(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    if (typeof window === "undefined") {
      reject(new Error("IndexedDB is only available in browser environments"));
      return;
    }

    const request = indexedDB.open("ir-offline-queue", 1);

    request.onupgradeneeded = () => {
      const db = request.result;
      if (!db.objectStoreNames.contains("pending-sales")) {
        db.createObjectStore("pending-sales", { keyPath: "localId" });
      }
    };

    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

/**
 * Queues a new offline sale with a generated UUID.
 */
export async function enqueueSale(
  branchId: string,
  items: PendingOfflineSale["items"]
): Promise<string> {
  const db = await getDB();
  const localId = crypto.randomUUID();
  const sale: PendingOfflineSale = {
    localId,
    branchId,
    items,
    createdAt: Date.now(),
    retryCount: 0,
  };

  const tx = db.transaction("pending-sales", "readwrite");
  const store = tx.objectStore("pending-sales");
  await idbRequest(store.add(sale));
  return localId;
}

/**
 * Returns all pending sales in the offline queue, sorted by creation time.
 */
export async function getPendingQueue(): Promise<PendingOfflineSale[]> {
  const db = await getDB();
  const tx = db.transaction("pending-sales", "readonly");
  const store = tx.objectStore("pending-sales");
  const sales = await idbRequest(store.getAll());
  return sales.sort((a, b) => a.createdAt - b.createdAt);
}

/**
 * Updates a pending sale (e.g. updating retry counts).
 */
export async function updateSale(sale: PendingOfflineSale): Promise<void> {
  const db = await getDB();
  const tx = db.transaction("pending-sales", "readwrite");
  const store = tx.objectStore("pending-sales");
  await idbRequest(store.put(sale));
}

/**
 * Removes a specific sale from the queue by its localId.
 */
export async function removeSale(localId: string): Promise<void> {
  const db = await getDB();
  const tx = db.transaction("pending-sales", "readwrite");
  const store = tx.objectStore("pending-sales");
  await idbRequest(store.delete(localId));
}

/**
 * Clears the entire offline queue (called on logout/session expiry for shared-device security).
 */
export async function clearOfflineQueue(): Promise<void> {
  const db = await getDB();
  const tx = db.transaction("pending-sales", "readwrite");
  const store = tx.objectStore("pending-sales");
  await idbRequest(store.clear());
}

/**
 * Returns the count of pending sales in the queue.
 */
export async function getPendingCount(): Promise<number> {
  try {
    const db = await getDB();
    const tx = db.transaction("pending-sales", "readonly");
    const store = tx.objectStore("pending-sales");
    return await idbRequest(store.count());
  } catch {
    return 0;
  }
}
