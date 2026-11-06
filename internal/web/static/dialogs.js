/* Copyright 2026 Paul Parks. SPDX-License-Identifier: Apache-2.0 */
/* The site's questions as PUDL dialogs, one implementation for every
   application (review of 2026-11-03: there were six). PUDL's own dialog
   script handles declarative dialogs opened by a command; these are the
   ones a script asks and waits on.

     yavcDialog.open({ title, body, buttons, className, check, onOpen })  -> { value, body }
         body is safe HTML (escape anything from data with yavcUtil.esc);
         buttons: [{ id, label, primary, danger, submit }], the primary
         one is the form's submit, so Enter presses it; a danger button
         submits unless submit is false. Escape gives value null.
         check(value, body) runs on submit and keeps the dialog open when
         it returns a problem; onOpen({ dialog, body, close(value) }) runs
         once the dialog shows, to wire what the body holds.
     yavcDialog.askText(title, label, value, opts)       -> string or null
         opts: { text, okLabel, help, placeholder, validate(v) -> error or null }
     yavcDialog.askChoice(title, text, buttons)          -> an id or null
         buttons: [[id, label, primary, danger], ...]
     yavcDialog.confirm(title, text, opts)               -> true or false
         opts: { okLabel, danger }
     yavcDialog.askSave(name, opts)                      -> 'save', 'discard' or null
         opts: { many }: the question for several documents at once

   Each dialog is made for its question and removed after it, labels its
   title and its field, puts focus on the field or on the safe button, and
   gives focus back to where it was when it closes. Cancel comes first and
   the action last, as PUDL's dialogs order them. */
(function () {
    'use strict';
    if (window.yavcDialog) { return; }

    var count = 0;
    var esc = window.yavcUtil.esc;

    function open(o) {
        var n = ++count, dlg = document.createElement('dialog'), opener = document.activeElement;
        dlg.className = 'dialog yavc-dialog' + (o.className ? ' ' + o.className : '');
        dlg.setAttribute('aria-labelledby', 'yavc-dlg-' + n + '-title');
        var buttons = (o.buttons || []).map(function (b) {
            var cls = 'btn' + (b.danger ? ' btn-danger' : b.primary ? ' btn-primary' : '');
            var glyph = b.danger ? '<span class="glyph" style="--glyph: var(--glyph-yavc-bin)" aria-hidden="true"></span>' : '';
            return b.primary || b.submit === true || (b.danger && b.submit !== false)
                ? '<button class="' + cls + '" type="submit" value="' + esc(b.id) + '">' + glyph + esc(b.label) + '</button>'
                : '<button class="' + cls + '" type="button" data-choice="' + esc(b.id) + '">' + glyph + esc(b.label) + '</button>';
        }).join('');
        /* A destructive question is PUDL's danger confirmation: the warning
           glyph in the danger colour beside its title. */
        var warn = o.warn ? '<span class="glyph yavc-dlg-warn" style="--glyph: var(--glyph-warning)" aria-hidden="true"></span>' : '';
        dlg.innerHTML = '<form method="dialog"><h3 class="dialog-title" id="yavc-dlg-' + n + '-title">' + warn + esc(o.title) + '</h3>' +
            '<div class="dialog-body">' + (o.body || '') + '</div><div class="dialog-actions">' + buttons + '</div></form>';
        document.body.appendChild(dlg);
        if (window.pudlFields && window.pudlFields.enhance) { window.pudlFields.enhance(dlg); }
        if (window.pudlDate && window.pudlDate.enhance) { window.pudlDate.enhance(dlg); }
        var body = dlg.querySelector('.dialog-body'), form = dlg.querySelector('form');
        return new Promise(function (resolve) {
            var done = false;
            function finish(value) {
                if (done) { return; }
                done = true;
                if (dlg.open) { dlg.close(); }
                resolve({ value: value, body: body });
                setTimeout(function () { dlg.remove(); if (opener && opener.isConnected && opener.focus && !document.querySelector('dialog[open]')) { try { opener.focus({ preventScroll: true }); } catch (err) { } } }, 0);
            }
            dlg.addEventListener('click', function (e) { var b = e.target.closest('button[data-choice]'); if (b && dlg.contains(b)) { finish(b.getAttribute('data-choice')); } });
            dlg.addEventListener('keydown', function (e) {
                if (e.key !== 'Tab' || e.defaultPrevented || e.altKey || e.ctrlKey || e.metaKey) { return; }
                var stops = Array.from(dlg.querySelectorAll('button,input,select,textarea,a[href],[tabindex],[contenteditable="true"]')).filter(function (node) {
                    return node.tabIndex >= 0 && !node.disabled && !node.closest('[inert]') && node.getClientRects().length && getComputedStyle(node).visibility !== 'hidden';
                });
                if (!stops.length) { e.preventDefault(); dlg.focus(); return; }
                var first = stops[0], last = stops[stops.length - 1], active = document.activeElement;
                if (e.shiftKey && active === first) { e.preventDefault(); last.focus(); }
                else if (!e.shiftKey && active === last) { e.preventDefault(); first.focus(); }
            });
            form.addEventListener('submit', function (e) {
                e.preventDefault();
                var v = e.submitter ? e.submitter.value : (form.querySelector('[type="submit"]') || {}).value;
                if (o.check) { var problem = o.check(v, body); if (problem) { return; } }
                finish(v || null);
            });
            /* A dialog closed with a value (dlg.close('swatch:red')) answers it;
               Escape closes with none. */
            dlg.addEventListener('close', function () { finish(dlg.returnValue || null); });
            dlg.returnValue = '';
            dlg.showModal();
            if (o.onOpen) { o.onOpen({ dialog: dlg, body: body, close: finish }); }
            var field = body.querySelector('input:not([type="hidden"]):not([readonly]), select, textarea');
            if (field) { field.focus(); if (field.select && field.type !== 'number') { field.select(); } }
            else {
                var safe = dlg.querySelector('[data-choice="cancel"], [data-choice="no"]') || form.querySelector('[type="submit"]');
                if (safe) { safe.focus(); }
            }
        });
    }

    function askText(title, label, value, opts) {
        opts = opts || {};
        var id = 'yavc-dlg-field-' + (count + 1);
        var body = (opts.text ? '<p>' + esc(opts.text) + '</p>' : '') +
            '<div class="form-group"><label class="form-label" for="' + id + '">' + esc(label) + '</label>' +
            '<input class="form-input" id="' + id + '" value="' + esc(value || '') + '" autocomplete="off" spellcheck="false"' + (opts.placeholder ? ' placeholder="' + esc(opts.placeholder) + '"' : '') + (opts.help ? ' aria-describedby="' + id + '-help"' : '') + '>' +
            (opts.help ? '<p class="form-help" id="' + id + '-help">' + esc(opts.help) + '</p>' : '') +
            '<p class="form-error" data-role="error" hidden></p></div>';
        return open({
            title: title, body: body, className: opts.className,
            buttons: [{ id: 'cancel', label: 'Cancel' }, { id: 'ok', label: opts.okLabel || 'OK', primary: true }],
            check: function (v, b) {
                if (v !== 'ok' || !opts.validate) { return null; }
                var input = b.querySelector('input'), err = b.querySelector('[data-role="error"]'), problem = opts.validate(input.value.trim());
                if (problem) { err.textContent = problem; err.hidden = false; input.setAttribute('aria-invalid', 'true'); input.focus(); }
                return problem;
            }
        }).then(function (r) { return r.value === 'ok' ? r.body.querySelector('input').value.trim() : null; });
    }

    function askChoice(title, text, buttons) {
        return open({
            title: title, body: text ? '<p>' + esc(text) + '</p>' : '',
            buttons: buttons.map(function (b) { return { id: b[0], label: b[1], primary: !!b[2], danger: !!b[3] }; })
        }).then(function (r) { return r.value || null; });
    }

    function confirm(title, text, opts) {
        opts = opts || {};
        return open({
            title: title, body: text ? '<p>' + esc(text) + '</p>' : '', warn: !!opts.danger,
            buttons: [{ id: 'cancel', label: 'Cancel' }, { id: 'ok', label: opts.okLabel || 'OK', primary: !opts.danger, danger: !!opts.danger }]
        }).then(function (r) { return r.value === 'ok'; });
    }

    /* The one "save your changes?" question: Don't Save is drawn as a
       destructive button, since it throws the changes away. */
    function askSave(name, opts) {
        opts = opts || {};
        return open({
            title: opts.many ? 'Save changes before closing?' : 'Save changes to ' + name + '?',
            body: '<p>' + esc(opts.many ? 'Some documents have changes that are not saved. They will be lost if you don\'t save them.' : 'Your changes will be lost if you don\'t save them.') + '</p>',
            buttons: [{ id: 'cancel', label: 'Cancel' }, { id: 'discard', label: 'Don\'t Save', danger: true, submit: false }, { id: 'save', label: opts.many ? 'Save All' : 'Save', primary: true }]
        }).then(function (r) { return r.value === 'save' || r.value === 'discard' ? r.value : null; });
    }

    window.yavcDialog = Object.freeze({ open: open, askText: askText, askChoice: askChoice, confirm: confirm, askSave: askSave });
})();
