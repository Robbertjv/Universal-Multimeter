const DATABASE_VERSION = 1;
const STORE_NAME = "measurements";

export class MeasurementHistoryStore {
  constructor({
    indexedDB = globalThis.indexedDB,
    databaseName = "universal-multimeter",
  } = {}) {
    if (!indexedDB || typeof indexedDB.open !== "function") {
      throw new Error("IndexedDB is unavailable in this browser.");
    }
    this._indexedDB = indexedDB;
    this._databaseName = databaseName;
    this._databasePromise = null;
  }

  async _database() {
    if (!this._databasePromise) {
      this._databasePromise = new Promise((resolve, reject) => {
        const request = this._indexedDB.open(
          this._databaseName,
          DATABASE_VERSION,
        );
        request.onupgradeneeded = () => {
          const database = request.result;
          if (!database.objectStoreNames.contains(STORE_NAME)) {
            const store = database.createObjectStore(STORE_NAME, {
              keyPath: "measurementId",
            });
            store.createIndex("sessionId", "sessionId", { unique: false });
            store.createIndex("deviceId", "deviceId", { unique: false });
            store.createIndex("receivedAt", "receivedAt", { unique: false });
          }
        };
        request.onsuccess = () => resolve(request.result);
        request.onerror = () => reject(request.error);
        request.onblocked = () =>
          reject(new Error("IndexedDB upgrade is blocked by another tab."));
      }).catch((error) => {
        this._databasePromise = null;
        throw error;
      });
    }
    return this._databasePromise;
  }

  async append(records, { sessionId, device } = {}) {
    if (!Array.isArray(records)) {
      throw new TypeError("Measurement records must be an array.");
    }
    if (!sessionId || typeof sessionId !== "string") {
      throw new TypeError("A logging sessionId is required.");
    }
    const database = await this._database();
    return new Promise((resolve, reject) => {
      const transaction = database.transaction(STORE_NAME, "readwrite");
      const store = transaction.objectStore(STORE_NAME);
      for (const record of records) {
        store.put({
          ...structuredClone(record),
          sessionId,
          device: device ? structuredClone(device) : null,
        });
      }
      transaction.oncomplete = () => resolve(records.length);
      transaction.onerror = () => reject(transaction.error);
      transaction.onabort = () =>
        reject(transaction.error ?? new Error("IndexedDB write aborted."));
    });
  }

  async query({ sessionId, deviceId, from, to } = {}) {
    const database = await this._database();
    return new Promise((resolve, reject) => {
      const transaction = database.transaction(STORE_NAME, "readonly");
      const request = transaction.objectStore(STORE_NAME).getAll();
      request.onsuccess = () => {
        const fromTime = from == null ? -Infinity : new Date(from).valueOf();
        const toTime = to == null ? Infinity : new Date(to).valueOf();
        const records = request.result
          .filter((record) => !sessionId || record.sessionId === sessionId)
          .filter((record) => !deviceId || record.deviceId === deviceId)
          .filter((record) => {
            const timestamp = new Date(record.receivedAt).valueOf();
            return timestamp >= fromTime && timestamp <= toTime;
          })
          .sort(
            (left, right) =>
              new Date(left.receivedAt).valueOf() -
              new Date(right.receivedAt).valueOf(),
          );
        resolve(records);
      };
      request.onerror = () => reject(request.error);
      transaction.onabort = () =>
        reject(transaction.error ?? new Error("IndexedDB read aborted."));
    });
  }

  async listSessions({ deviceId } = {}) {
    const records = await this.query({ deviceId });
    const sessions = new Map();
    for (const record of records) {
      const session = sessions.get(record.sessionId) ?? {
        sessionId: record.sessionId,
        deviceId: record.deviceId,
        device: record.device,
        startedAt: record.receivedAt,
        lastMeasurementAt: record.receivedAt,
        measurementCount: 0,
      };
      session.startedAt =
        record.receivedAt < session.startedAt
          ? record.receivedAt
          : session.startedAt;
      session.lastMeasurementAt =
        record.receivedAt > session.lastMeasurementAt
          ? record.receivedAt
          : session.lastMeasurementAt;
      session.measurementCount += 1;
      sessions.set(record.sessionId, session);
    }
    return [...sessions.values()].sort(
      (left, right) =>
        new Date(right.lastMeasurementAt).valueOf() -
        new Date(left.lastMeasurementAt).valueOf(),
    );
  }

  async clear({ sessionId } = {}) {
    const database = await this._database();
    return new Promise((resolve, reject) => {
      const transaction = database.transaction(STORE_NAME, "readwrite");
      const store = transaction.objectStore(STORE_NAME);
      const request = store.getAll();
      let removed = 0;
      request.onsuccess = () => {
        for (const record of request.result) {
          if (!sessionId || record.sessionId === sessionId) {
            store.delete(record.measurementId);
            removed += 1;
          }
        }
      };
      request.onerror = () => reject(request.error);
      transaction.oncomplete = () => resolve(removed);
      transaction.onerror = () => reject(transaction.error);
      transaction.onabort = () =>
        reject(transaction.error ?? new Error("IndexedDB delete aborted."));
    });
  }

  async close() {
    if (!this._databasePromise) return;
    const database = await this._databasePromise;
    database.close();
    this._databasePromise = null;
  }
}
