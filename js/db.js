/*
  db.js — the app's "filing cabinet".

  Browsers have a built-in database called IndexedDB. Data saved there stays
  on THIS computer, in THIS browser. Nothing is sent over the internet.

  The database is split into "stores" (think: drawers in a cabinet):
    sources   – books, articles, chapters, theses
    notes     – her notes; each one points to a source with `sourceId`
    questions – research questions
    matrix    – literature-review table cells, one record per source
    settings  – small bits of info, e.g. the list of themes
    files     – her own copies of sources (PDFs, e-books, scans), added in version 2

  IndexedDB's own commands are clumsy, so this file wraps them in a few
  simple helpers that the rest of the app uses, for example:
      DB.getAll('sources')            → every source
      DB.put('notes', noteObject)     → save (add or update) a note
      DB.remove('notes', id)          → delete a note
*/

const DB = (function () {
  const DB_NAME = 'research-shelf';
  // If we ever change the drawers, we bump this number.
  // Version 2 added the "files" drawer. Existing data is kept.
  const DB_VERSION = 2;
  const STORES = ['sources', 'notes', 'questions', 'matrix', 'settings', 'files'];

  let dbPromise = null; // we open the database once and reuse it

  // Open (or create, the very first time) the database.
  function open() {
    if (dbPromise) return dbPromise;
    dbPromise = new Promise(function (resolve, reject) {
      const request = indexedDB.open(DB_NAME, DB_VERSION);

      // Runs only when the database is brand new (or the version went up):
      // this is where the "drawers" are created.
      request.onupgradeneeded = function () {
        const db = request.result;
        if (!db.objectStoreNames.contains('sources')) {
          db.createObjectStore('sources', { keyPath: 'id' });
        }
        if (!db.objectStoreNames.contains('notes')) {
          const notes = db.createObjectStore('notes', { keyPath: 'id' });
          // An "index" lets us quickly find all notes for one source.
          notes.createIndex('sourceId', 'sourceId');
        }
        if (!db.objectStoreNames.contains('questions')) {
          db.createObjectStore('questions', { keyPath: 'id' });
        }
        if (!db.objectStoreNames.contains('matrix')) {
          db.createObjectStore('matrix', { keyPath: 'sourceId' });
        }
        if (!db.objectStoreNames.contains('settings')) {
          db.createObjectStore('settings', { keyPath: 'key' });
        }
        if (!db.objectStoreNames.contains('files')) {
          const files = db.createObjectStore('files', { keyPath: 'id' });
          files.createIndex('sourceId', 'sourceId');
        }
      };

      request.onsuccess = function () {
        const db = request.result;
        // If a newer version of the app opens in another tab, step aside so it can upgrade
        db.onversionchange = function () { db.close(); };
        resolve(db);
      };
      request.onerror = function () { reject(request.error); };
      // An older copy of the app is open in another tab and is blocking the upgrade
      request.onblocked = function () {
        alert('Research Shelf is open in another tab. Please close the other tab, then reload this page.');
      };
    });
    return dbPromise;
  }

  // A shared helper: open a "transaction" (a safe unit of work) on one
  // store, do something, and hand back the result when it's finished.
  function run(storeName, mode, action) {
    return open().then(function (db) {
      return new Promise(function (resolve, reject) {
        const tx = db.transaction(storeName, mode);
        const request = action(tx.objectStore(storeName));
        tx.oncomplete = function () { resolve(request ? request.result : undefined); };
        tx.onerror = function () { reject(tx.error); };
        tx.onabort = function () { reject(tx.error); };
      });
    });
  }

  return {
    STORES: STORES,
    open: open,

    getAll: function (store) {
      return run(store, 'readonly', function (s) { return s.getAll(); });
    },
    get: function (store, key) {
      return run(store, 'readonly', function (s) { return s.get(key); });
    },
    // "put" = add a new record, or replace the old one with the same id
    put: function (store, record) {
      return run(store, 'readwrite', function (s) { return s.put(record); });
    },
    remove: function (store, key) {
      return run(store, 'readwrite', function (s) { return s.delete(key); });
    },

    // All notes that belong to one source
    notesForSource: function (sourceId) {
      return run('notes', 'readonly', function (s) {
        return s.index('sourceId').getAll(sourceId);
      });
    },

    // All attached files for one source
    filesForSource: function (sourceId) {
      return run('files', 'readonly', function (s) {
        return s.index('sourceId').getAll(sourceId);
      });
    },

    // How many files each source has, e.g. { 'seed-1': 2 }, WITHOUT loading
    // the (possibly large) files themselves
    fileCounts: function () {
      return open().then(function (db) {
        return new Promise(function (resolve, reject) {
          const counts = {};
          const request = db.transaction('files', 'readonly').objectStore('files').index('sourceId').openKeyCursor();
          request.onsuccess = function () {
            const cursor = request.result;
            if (!cursor) { resolve(counts); return; }
            counts[cursor.key] = (counts[cursor.key] || 0) + 1;
            cursor.continue();
          };
          request.onerror = function () { reject(request.error); };
        });
      });
    },

    // Settings are stored as { key: 'themes', value: [...] }
    getSetting: function (key, fallback) {
      return this.get('settings', key).then(function (row) {
        return row ? row.value : fallback;
      });
    },
    setSetting: function (key, value) {
      return this.put('settings', { key: key, value: value });
    },

    // Used by "Import data": wipe each drawer that the backup contains and
    // refill it, all in ONE transaction. If anything goes wrong, nothing is
    // changed at all. Drawers missing from `data` are left untouched (e.g. a
    // backup made without files doesn't delete her files).
    replaceAll: function (data) {
      return open().then(function (db) {
        return new Promise(function (resolve, reject) {
          const tx = db.transaction(STORES, 'readwrite');
          STORES.forEach(function (name) {
            if (!Array.isArray(data[name])) return;
            const store = tx.objectStore(name);
            store.clear();
            (data[name] || []).forEach(function (record) { store.put(record); });
          });
          tx.oncomplete = function () { resolve(); };
          tx.onerror = function () { reject(tx.error); };
          tx.onabort = function () { reject(tx.error); };
        });
      });
    }
  };
})();
