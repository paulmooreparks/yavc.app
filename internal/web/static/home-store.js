/* Copyright 2026 Paul Parks. SPDX-License-Identifier: Apache-2.0 */
/* The guest filesystem's existing JSON record, committed transactionally. */
(function () {
    'use strict';
    var DATABASE = 'yavc-home', STORE = 'state', KEY = 'home', LEGACY = 'pc-terminal-home';
    var MAX = 2 * 1024 * 1024, ready = null;
    function parse(raw) {
        var value = raw == null ? { files: {} } : JSON.parse(raw);
        if (!value || typeof value !== 'object' || Array.isArray(value) || !value.files || typeof value.files !== 'object' || Array.isArray(value.files)) throw new Error('The saved home record is invalid. Its original has been retained.');
        Object.keys(value.files).forEach(function (path) {
            if (path[0] !== '/' || path === '/' || path.split('/').slice(1).some(function (part) { return !part || part === '.' || part === '..' || /[\x00-\x1f\x7f]/.test(part); })) throw new Error('The saved home contains an invalid path.');
            var e = value.files[path];
            if (!e || typeof e !== 'object' || Array.isArray(e) || !['d','f','b'].includes(e.t)) throw new Error('The saved home contains an invalid entry.');
            if (e.t === 'f' && typeof e.c !== 'string') throw new Error('The saved home contains invalid text.');
            if (e.t === 'b' && (typeof e.id !== 'string' || !e.id || !Number.isSafeInteger(e.s) || e.s < 0)) throw new Error('The saved home contains an invalid picture.');
            var parts = path.split('/'); parts.pop();
            while (parts.length > 1) {
                var parent = value.files[parts.join('/')];
                if (parent && parent.t !== 'd') throw new Error('A saved file is used as a directory.');
                parts.pop();
            }
        });
        return value;
    }
    function payload(entry) {
        var copy = {};
        Object.keys(entry).sort().forEach(function (key) { if (key !== 'revision') copy[key] = entry[key]; });
        return JSON.stringify(copy);
    }
    function normalize(raw, prior) {
        var value = parse(raw), before = prior ? parse(prior).files : {};
        Object.keys(value.files).forEach(function (path) {
            var entry = value.files[path];
            if (!entry || typeof entry !== 'object' || Array.isArray(entry) || !['d','f','b'].includes(entry.t)) throw new Error('The saved home contains an invalid entry.');
            entry.revision = Object.hasOwn(before, path) && payload(before[path]) === payload(entry) ? before[path].revision : crypto.randomUUID();
        });
        var encoded = JSON.stringify(value), quota = parse(encoded);
        Object.values(quota.files).forEach(function (entry) { delete entry.revision; });
        if (JSON.stringify(quota).length > MAX) throw new Error('Your home directory is full (the limit is 2 MB).');
        return encoded;
    }
    function open() {
        if (!ready) {
            ready = new Promise(function (resolve, reject) {
                if (!window.indexedDB) { reject(new Error('This browser cannot open the guest file database.')); return; }
                var blocked = false, request = indexedDB.open(DATABASE, 1);
                request.onupgradeneeded = function () {
                    if (!request.result.objectStoreNames.contains('blobs')) request.result.createObjectStore('blobs');
                    request.result.createObjectStore(STORE);
                };
                request.onerror = function () { reject(request.error); };
                request.onblocked = function () { blocked = true; reject(new Error('Close older tabs blocking the guest file database, then reload.')); };
                request.onsuccess = function () { var db = request.result; if (blocked) { db.close(); return; } db.onversionchange = function () { db.close(); ready = null; }; resolve(db); };
            });
            ready.catch(function () { ready = null; });
        }
        return ready;
    }
    function transaction(mode, operation) {
        return open().then(function (db) {
            return new Promise(function (resolve, reject) {
                var tx = db.transaction([STORE, 'blobs'], mode), result, failure = null, request = tx.objectStore(STORE).get(KEY);
                request.onsuccess = function () {
                    try { result = operation(request.result, tx.objectStore(STORE), tx.objectStore('blobs')); }
                    catch (err) { failure = err; tx.abort(); }
                };
                tx.oncomplete = function () { resolve(result); };
                tx.onabort = tx.onerror = function () { reject(failure || tx.error || new Error('The guest file transaction failed.')); };
            });
        });
    }
    function validate(record) {
        if (!record || record.version !== 1 || !Number.isSafeInteger(record.generation) || record.generation < 1 || typeof record.raw !== 'string') throw new Error('The guest file database has an unsupported record.');
        return record;
    }
    async function initialize() {
        var existing = await transaction('readonly', function (record) { return record; });
        if (existing) return validate(existing);
        // Retain both legacy stores. Older builds can still read their copy.
        var legacy = localStorage.getItem(LEGACY), raw = normalize(legacy, null);
        var pictures = Object.values(parse(raw).files).filter(function (entry) { return entry.t === 'b'; });
        var copied = [];
        if (pictures.length) copied = await new Promise(function (resolve, reject) {
            var request = indexedDB.open('yavc-home-blobs', 1);
            request.onupgradeneeded = function () { request.transaction.abort(); };
            request.onerror = function () { reject(new Error('The original picture database is unavailable. The original home has been retained.')); };
            request.onsuccess = function () {
                var db = request.result, tx = db.transaction('blobs', 'readonly'), values = [], failure;
                db.onversionchange = function () { db.close(); };
                pictures.forEach(function (entry) {
                    var get = tx.objectStore('blobs').get(entry.id);
                    get.onsuccess = function () {
                        if (!(get.result instanceof ArrayBuffer) || get.result.byteLength !== entry.s) { failure = new Error('A saved picture is missing or incomplete. The original home has been retained.'); tx.abort(); return; }
                        values.push({ id: entry.id, bytes: get.result });
                    };
                });
                tx.oncomplete = function () { db.close(); resolve(values); };
                tx.onabort = tx.onerror = function () { db.close(); reject(failure || tx.error); };
            };
        });
        return transaction('readwrite', function (current, state, blobs) {
            if (current) return validate(current);
            var record = { version: 1, generation: 1, raw: raw, migrationSource: legacy };
            copied.forEach(function (picture) { blobs.put(picture.bytes, picture.id); });
            state.add(record, KEY);
            return record;
        });
    }
    function read() { return transaction('readonly', function (record) { return validate(record); }); }
    function update(change, addition) {
        if(addition){if(typeof addition.id!=='string'||!addition.id||addition.id.length>255||!(addition.bytes instanceof Uint8Array)||addition.bytes.byteLength>8*1024*1024)throw new Error('The atomic source bytes are invalid.');addition={id:addition.id,bytes:new Uint8Array(addition.bytes)};}
        return transaction('readwrite', function (record, store, blobs) {
            validate(record);
            var raw = change(record);
            if (typeof raw !== 'string') throw new Error('A guest file transaction must return serialized content.');
            raw = normalize(raw, record.raw);
            if(addition){if(!Object.values(parse(raw).files).some(function(entry){return entry.t==='b'&&entry.id===addition.id&&entry.s===addition.bytes.byteLength;}))throw new Error('Atomic source bytes require a matching file record.');blobs.add(addition.bytes.buffer,addition.id);}
            if (raw === record.raw) return record;
            if (record.generation === Number.MAX_SAFE_INTEGER) throw new Error('The guest file generation limit was reached.');
            var next = Object.assign({}, record, { raw: raw, generation: record.generation + 1 });
            store.put(next, KEY);
            return next;
        });
    }
    function commit(expected, raw, current) {
        return update(function (record) {
            if (current && !current()) throw new Error('The operation was cancelled before saving.');
            if (record.generation !== expected) throw new Error('Files changed in another tab. Your operation was not saved; retry against the current files.');
            return raw;
        });
    }
    function legacyStatus(record) {
        var current = localStorage.getItem(LEGACY);
        return { changed: current !== record.migrationSource, original: record.migrationSource, current: current };
    }
    function blob(mode, operation) {
        return open().then(function (db) { return new Promise(function (resolve, reject) {
            var tx = db.transaction(['blobs', STORE], mode), request = operation(tx.objectStore('blobs'), tx.objectStore(STORE));
            tx.oncomplete = function () { resolve(request && request.result); };
            tx.onabort = tx.onerror = function () { reject(tx.error || new Error('The picture transaction failed.')); };
        }); });
    }
    function deleteBlob(id) {
        return blob('readwrite', function (blobs, state) {
            var request = state.get(KEY);
            request.onsuccess = function () {
                var record = validate(request.result);
                var records = [parse(record.raw), parse(record.migrationSource)];
                var referenced = records.some(function (data) { return Object.values(data.files).some(function (entry) { return entry.t === 'b' && entry.id === id; }); });
                if (!referenced) blobs.delete(id);
            };
        });
    }
    window.yavcHomeStore = Object.freeze({ initialize: initialize, read: read, update: update, commit: commit, legacyStatus: legacyStatus, parse: parse, database: DATABASE,
        blobGet: function (id) { return blob('readonly', function (store) { return store.get(id); }); },
        blobPut: function (id, bytes) { return blob('readwrite', function (store) { return store.add(bytes, id); }); },
        blobDelete: deleteBlob });
})();
