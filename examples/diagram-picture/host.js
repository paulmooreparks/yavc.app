/* Copyright 2026 Paul Parks. SPDX-License-Identifier: Apache-2.0 */
/* The host's side of drawing a picture of a diagram with no applet window (docs/diagram-picture-contract.md). A driver script calls
   hostDraw, or hostStart and hostAbort for a drawing it may cancel, and reads the answer as plain data.

   Everything here is the host's. The pictures a canvas names are given only from the list the driver set in hostPictures, and a name
   that is not on it is answered with null, so nothing is read from anywhere the host did not choose. */
(function () {
    'use strict';
    window.hostPictures = {};
    var jobs = {};

    /* The picture function the request gets. path is as the canvas file has it. */
    function pictures(path) {
        return Promise.resolve(Object.prototype.hasOwnProperty.call(window.hostPictures, path) ? { url: new URL(window.hostPictures[path], location.href).href } : null);
    }
    function base64(blob) {
        return blob.arrayBuffer().then(function (buffer) {
            var bytes = new Uint8Array(buffer), text = '';
            for (var i = 0; i < bytes.length; i += 0x8000) { text += String.fromCharCode.apply(null, bytes.subarray(i, i + 0x8000)); }
            return btoa(text);
        });
    }
    /* The answer as data a driver can carry out of the page. A rejection is data too, with the error's name and words. */
    function settle(promise) {
        return promise.then(function (out) {
            var answer = { ok: true, format: out.format, width: out.width, height: out.height, problems: out.problems };
            if (out.format === 'svg') { answer.svg = out.svg; return answer; }
            return base64(out.blob).then(function (data) { answer.png = data; return answer; });
        }, function (error) { return { ok: false, name: error && error.name, message: error && error.message }; });
    }
    function request(spec, signal) {
        return { kind: spec.kind, text: spec.text, format: spec.format, scale: spec.scale, pictures: pictures, signal: signal };
    }
    window.hostDraw = function (spec) { return settle(window.yavcDiagramPicture.draw(request(spec))); };
    /* A drawing that may be cancelled: hostStart begins it, hostAbort ends it, hostResult waits for the answer. */
    window.hostStart = function (id, spec) {
        var control = new AbortController();
        jobs[id] = { control: control, done: settle(window.yavcDiagramPicture.draw(request(spec, control.signal))) };
    };
    window.hostAbort = function (id) { jobs[id].control.abort(); };
    window.hostResult = function (id) { return jobs[id].done; };
})();
