/* The barcode engine: encoders for the linear symbologies found in retail,
   a canvas and SVG renderer, check-digit algorithms, the GS1 Application
   Identifier table and the layout model. It has no user interface and no
   dependency beyond a canvas context, so the barcode tool and the flash
   cards can both load it. Architecture/barcode-tool-design.md describes
   the design and the layout format.

   An encoder returns { ok, error, symbol }. A symbol is a list of bar and
   space runs measured in modules, plus a map from every input character
   to the run range that carries it; the map is what highlighting uses. */
(function (global) {
    'use strict';

    /* === Check-digit algorithms ========================================= */

    /* Weighted products for the GS1 price check digits, indexed by digit
       (General Specifications, figures 7.9.2-1 to 7.9.2-4). */
    var WEIGHT = {
        '2-': [0, 2, 4, 6, 8, 9, 1, 3, 5, 7],
        '3':  [0, 3, 6, 9, 2, 5, 8, 1, 4, 7],
        '5+': [0, 5, 1, 6, 2, 7, 3, 8, 4, 9],
        '5-': [0, 5, 9, 4, 8, 3, 7, 2, 6, 1]
    };

    var CHECKS = {
        'gs1-mod10': {
            name: 'GS1 modulo 10',
            compute: function (s) {
                var sum = 0, w = 3;
                for (var i = s.length - 1; i >= 0; i--) { sum += (+s[i]) * w; w = w === 3 ? 1 : 3; }
                return String((10 - sum % 10) % 10);
            }
        },
        'luhn': {
            name: 'Luhn (modulo 10, weights 2 and 1)',
            compute: function (s) {
                var sum = 0, dbl = true;
                for (var i = s.length - 1; i >= 0; i--) {
                    var d = +s[i];
                    if (dbl) { d *= 2; if (d > 9) { d -= 9; } }
                    sum += d; dbl = !dbl;
                }
                return String((10 - sum % 10) % 10);
            }
        },
        'mod11': {
            name: 'Modulo 11 (weights 2 to 7; 10 becomes 0)',
            compute: function (s) {
                var sum = 0, w = 2;
                for (var i = s.length - 1; i >= 0; i--) { sum += (+s[i]) * w; w = w === 7 ? 2 : w + 1; }
                var c = (11 - sum % 11) % 11;
                return String(c === 10 ? 0 : c);
            }
        },
        '7dr': {
            name: '7DR (remainder of division by 7)',
            compute: function (s) {
                var r = 0;
                for (var i = 0; i < s.length; i++) { r = (r * 10 + (+s[i])) % 7; }
                return String(r);
            }
        },
        /* 7 less the remainder. The public definitions stop at "subtract
           the remainder from the modulus", so a remainder of 0 gives 7. */
        '7dsr': {
            name: '7DSR (7 less the remainder of division by 7)',
            compute: function (s) {
                var r = 0;
                for (var i = 0; i < s.length; i++) { r = (r * 10 + (+s[i])) % 7; }
                return String(7 - r);
            }
        },
        /* The price check digits of the GS1 General Specifications, 7.9.2
           to 7.9.4, for a price inside a variable-measure code. Each covers
           a price of exactly its length. */
        'gs1-price4': {
            name: 'GS1 four-digit price check',
            length: 4,
            compute: function (s) {
                if (s.length !== 4) { return null; }
                var w = [WEIGHT['2-'], WEIGHT['2-'], WEIGHT['3'], WEIGHT['5-']], sum = 0;
                for (var i = 0; i < 4; i++) { sum += w[i][+s[i]]; }
                return String(sum * 3 % 10);
            }
        },
        'gs1-price5': {
            name: 'GS1 five-digit price check',
            length: 5,
            compute: function (s) {
                if (s.length !== 5) { return null; }
                var w = [WEIGHT['5+'], WEIGHT['2-'], WEIGHT['5-'], WEIGHT['5+'], WEIGHT['2-']], sum = 0;
                for (var i = 0; i < 5; i++) { sum += w[i][+s[i]]; }
                return String(WEIGHT['5-'].indexOf((10 - sum % 10) % 10));
            }
        }
    };

    function gs1Check(digits) { return CHECKS['gs1-mod10'].compute(digits); }

    /* Normalizes digits that may or may not carry a trailing check digit.
       With dataLen digits the check is computed; with one more it is
       verified, and a wrong one is reported with the right one. */
    function withCheck(input, dataLen, label) {
        if (!/^[0-9]*$/.test(input)) {
            return { ok: false, error: label + ' takes digits only.' };
        }
        if (input.length === dataLen) {
            return { ok: true, value: input + gs1Check(input), computed: true };
        }
        if (input.length === dataLen + 1) {
            var want = gs1Check(input.slice(0, dataLen));
            if (want !== input[dataLen]) {
                return { ok: false, error: 'The check digit is ' + input[dataLen] + ', but it should be ' + want + '.', fix: input.slice(0, dataLen) + want };
            }
            return { ok: true, value: input, computed: false };
        }
        return { ok: false, error: label + ' needs ' + dataLen + ' digits, or ' + (dataLen + 1) + ' with the check digit. This has ' + input.length + '.' };
    }

    /* === Symbol building ================================================= */

    function Builder() { this.runs = []; this.x = 0; }
    Builder.prototype.push = function (bar, w) {
        var last = this.runs[this.runs.length - 1];
        if (last && last.bar === bar) { last.w += w; } else { this.runs.push({ bar: bar, w: w }); }
        this.x += w;
    };
    Builder.prototype.bits = function (bits) {
        for (var i = 0; i < bits.length; i++) { this.push(bits[i] === '1', 1); }
    };
    /* A width pattern alternates bar and space, starting with a bar. */
    Builder.prototype.widths = function (pattern, firstIsBar) {
        var bar = firstIsBar !== false;
        for (var i = 0; i < pattern.length; i++) { this.push(bar, pattern[i]); bar = !bar; }
    };

    function symbol(fields) {
        return {
            symbology: fields.symbology,
            runs: fields.b.runs,
            width: fields.b.x,
            qz: fields.qz,
            chars: fields.chars,
            specials: fields.specials || [],
            guards: fields.guards || [],
            textMode: fields.textMode || 'center',
            hri: fields.hri,
            hriMap: fields.hriMap || null,
            data: fields.data,
            bearer: !!fields.bearer,
            barHeight: fields.barHeight || null
        };
    }

    /* === EAN and UPC ===================================================== */

    var EAN_L = ['0001101', '0011001', '0010011', '0111101', '0100011', '0110001', '0101111', '0111011', '0110111', '0001011'];
    var EAN_G = ['0100111', '0110011', '0011011', '0100001', '0011101', '0111001', '0000101', '0010001', '0001001', '0010111'];
    var EAN_R = ['1110010', '1100110', '1101100', '1000010', '1011100', '1001110', '1010000', '1000100', '1001000', '1110100'];
    var EAN13_PARITY = ['LLLLLL', 'LLGLGG', 'LLGGLG', 'LLGGGL', 'LGLLGG', 'LGGLLG', 'LGGGLL', 'LGLGLG', 'LGLGGL', 'LGGLGL'];
    /* UPC-E parity by check digit, for number system 0; system 1 inverts. */
    var UPCE_PARITY = ['GGGLLL', 'GGLGLL', 'GGLLGL', 'GGLLLG', 'GLGGLL', 'GLLGGL', 'GLLLGG', 'GLGLGL', 'GLGLLG', 'GLLGLG'];

    function guard(b, bits, specials, guards) {
        var x0 = b.x;
        b.bits(bits);
        specials.push({ kind: 'guard', x0: x0, x1: b.x });
        guards.push([x0, b.x]);
    }

    function ean13Symbol(d, opts) {
        opts = opts || {};
        var b = new Builder(), chars = [], specials = [], guards = [];
        guard(b, '101', specials, guards);
        var parity = EAN13_PARITY[+d[0]];
        chars[0] = { ch: d[0], x0: null, x1: null, implicit: true };
        for (var i = 1; i <= 6; i++) {
            var x0 = b.x;
            b.bits(parity[i - 1] === 'L' ? EAN_L[+d[i]] : EAN_G[+d[i]]);
            chars[i] = { ch: d[i], x0: x0, x1: b.x };
        }
        guard(b, '01010', specials, guards);
        for (var j = 7; j <= 12; j++) {
            var y0 = b.x;
            b.bits(EAN_R[+d[j]]);
            chars[j] = { ch: d[j], x0: y0, x1: b.x };
        }
        guard(b, '101', specials, guards);
        chars[12].role = 'check';
        return { b: b, chars: chars, specials: specials, guards: guards };
    }

    var SYMBOLOGIES = {};

    SYMBOLOGIES.ean13 = {
        name: 'EAN-13',
        family: 'retail',
        help: '12 digits, or 13 with the check digit.',
        charset: /^[0-9]*$/,
        encode: function (input) {
            var v = withCheck(input, 12, 'EAN-13');
            if (!v.ok) { return v; }
            var d = v.value, s = ean13Symbol(d);
            s.chars[0].tx = -5.5;
            for (var i = 1; i <= 12; i++) { s.chars[i].tx = (s.chars[i].x0 + s.chars[i].x1) / 2; }
            return {
                ok: true, computed: v.computed, check: d[12],
                symbol: symbol({ symbology: 'ean13', b: s.b, qz: [11, 7], chars: s.chars, specials: s.specials, guards: s.guards, textMode: 'ean', hri: d, data: d })
            };
        }
    };

    SYMBOLOGIES.upca = {
        name: 'UPC-A',
        family: 'retail',
        help: '11 digits, or 12 with the check digit.',
        charset: /^[0-9]*$/,
        encode: function (input) {
            var v = withCheck(input, 11, 'UPC-A');
            if (!v.ok) { return v; }
            var d = v.value, s = ean13Symbol('0' + d);
            /* UPC-A is EAN-13 with a leading zero: drop the implicit one, and
               extend the bars of the first and last digits like guards. */
            var chars = s.chars.slice(1);
            chars[0].tx = -5; chars[0].small = true;
            chars[11].tx = s.b.x + 5; chars[11].small = true; chars[11].role = 'check';
            for (var i = 1; i <= 10; i++) { chars[i].tx = (chars[i].x0 + chars[i].x1) / 2; }
            s.guards.push([chars[0].x0, chars[0].x1], [chars[11].x0, chars[11].x1]);
            return {
                ok: true, computed: v.computed, check: d[11],
                symbol: symbol({ symbology: 'upca', b: s.b, qz: [9, 9], chars: chars, specials: s.specials, guards: s.guards, textMode: 'ean', hri: d, data: d })
            };
        }
    };

    SYMBOLOGIES.ean8 = {
        name: 'EAN-8',
        family: 'retail',
        help: '7 digits, or 8 with the check digit.',
        charset: /^[0-9]*$/,
        encode: function (input) {
            var v = withCheck(input, 7, 'EAN-8');
            if (!v.ok) { return v; }
            var d = v.value, b = new Builder(), chars = [], specials = [], guards = [];
            guard(b, '101', specials, guards);
            for (var i = 0; i < 4; i++) { var x0 = b.x; b.bits(EAN_L[+d[i]]); chars[i] = { ch: d[i], x0: x0, x1: b.x }; }
            guard(b, '01010', specials, guards);
            for (var j = 4; j < 8; j++) { var y0 = b.x; b.bits(EAN_R[+d[j]]); chars[j] = { ch: d[j], x0: y0, x1: b.x }; }
            guard(b, '101', specials, guards);
            chars[7].role = 'check';
            chars.forEach(function (c) { c.tx = (c.x0 + c.x1) / 2; });
            return {
                ok: true, computed: v.computed, check: d[7],
                symbol: symbol({ symbology: 'ean8', b: b, qz: [7, 7], chars: chars, specials: specials, guards: guards, textMode: 'ean', hri: d, data: d })
            };
        }
    };

    /* UPC-E: six digits compressed from a UPC-A with zeros in it. */
    function upceExpand(ns, body) {
        var d = body, last = d[5];
        var mid;
        if (last === '0' || last === '1' || last === '2') { mid = d[0] + d[1] + last + '0000' + d[2] + d[3] + d[4]; }
        else if (last === '3') { mid = d[0] + d[1] + d[2] + '00000' + d[3] + d[4]; }
        else if (last === '4') { mid = d[0] + d[1] + d[2] + d[3] + '00000' + d[4]; }
        else { mid = d[0] + d[1] + d[2] + d[3] + d[4] + '0000' + last; }
        return ns + mid;
    }

    SYMBOLOGIES.upce = {
        name: 'UPC-E',
        family: 'retail',
        help: '6 digits (number system 0), or 7 with the number system, or 8 with the check digit.',
        charset: /^[0-9]*$/,
        encode: function (input) {
            if (!/^[0-9]*$/.test(input)) { return { ok: false, error: 'UPC-E takes digits only.' }; }
            var ns, body, supplied = null;
            if (input.length === 6) { ns = '0'; body = input; }
            else if (input.length === 7) { ns = input[0]; body = input.slice(1); }
            else if (input.length === 8) { ns = input[0]; body = input.slice(1, 7); supplied = input[7]; }
            else { return { ok: false, error: 'UPC-E needs 6, 7 or 8 digits. This has ' + input.length + '.' }; }
            if (ns !== '0' && ns !== '1') { return { ok: false, error: 'The number system of a UPC-E is 0 or 1, not ' + ns + '.' }; }
            var check = gs1Check(upceExpand(ns, body));
            if (supplied !== null && supplied !== check) {
                return { ok: false, error: 'The check digit is ' + supplied + ', but it should be ' + check + '.', fix: ns + body + check };
            }
            var parity = UPCE_PARITY[+check];
            var b = new Builder(), chars = [], specials = [], guards = [];
            guard(b, '101', specials, guards);
            chars.push({ ch: ns, x0: null, x1: null, implicit: true, small: true, tx: -5 });
            for (var i = 0; i < 6; i++) {
                var p = parity[i];
                if (ns === '1') { p = p === 'L' ? 'G' : 'L'; }
                var x0 = b.x;
                b.bits(p === 'L' ? EAN_L[+body[i]] : EAN_G[+body[i]]);
                chars.push({ ch: body[i], x0: x0, x1: b.x, tx: (x0 + b.x) / 2 });
            }
            guard(b, '010101', specials, guards);
            chars.push({ ch: check, x0: null, x1: null, implicit: true, small: true, tx: b.x + 5, role: 'check' });
            var d = ns + body + check;
            return {
                ok: true, computed: supplied === null, check: check, expanded: upceExpand(ns, body) + check,
                symbol: symbol({ symbology: 'upce', b: b, qz: [9, 7], chars: chars, specials: specials, guards: guards, textMode: 'ean', hri: d, data: d })
            };
        }
    };

    /* === Interleaved 2 of 5 ============================================= */

    var ITF = ['nnwwn', 'wnnnw', 'nwnnw', 'wwnnn', 'nnwnw', 'wnwnn', 'nwwnn', 'nnnww', 'wnnwn', 'nwnwn'];
    var WIDE = 3;

    function itfSymbol(d, label, opts) {
        var b = new Builder(), chars = [], specials = [];
        var x0 = b.x;
        b.widths([1, 1, 1, 1]);
        specials.push({ kind: 'start', x0: x0, x1: b.x });
        for (var i = 0; i < d.length; i += 2) {
            var p0 = b.x, a = ITF[+d[i]], c = ITF[+d[i + 1]];
            for (var k = 0; k < 5; k++) {
                b.push(true, a[k] === 'w' ? WIDE : 1);
                b.push(false, c[k] === 'w' ? WIDE : 1);
            }
            chars[i] = { ch: d[i], x0: p0, x1: b.x };
            chars[i + 1] = { ch: d[i + 1], x0: p0, x1: b.x };
        }
        var s0 = b.x;
        b.widths([WIDE, 1, 1]);
        specials.push({ kind: 'stop', x0: s0, x1: b.x });
        return { b: b, chars: chars, specials: specials };
    }

    SYMBOLOGIES.itf = {
        name: 'Interleaved 2 of 5',
        family: 'logistics',
        help: 'An even number of digits (an odd number with the check digit option).',
        charset: /^[0-9]*$/,
        options: ['check'],
        encode: function (input, opts) {
            opts = opts || {};
            if (!/^[0-9]*$/.test(input)) { return { ok: false, error: 'Interleaved 2 of 5 takes digits only.' }; }
            if (!input.length) { return { ok: false, error: 'Enter some digits.' }; }
            var d = input, check = null;
            if (opts.check) { check = gs1Check(d); d += check; }
            if (d.length % 2) {
                return { ok: false, error: opts.check
                    ? 'With its check digit this has an odd number of digits; Interleaved 2 of 5 needs an even number. Add a leading zero.'
                    : 'Interleaved 2 of 5 needs an even number of digits. This has ' + d.length + '; add a leading zero.' };
            }
            var s = itfSymbol(d);
            if (check !== null) { s.chars[d.length - 1].role = 'check'; }
            return { ok: true, check: check, symbol: symbol({ symbology: 'itf', b: s.b, qz: [10, 10], chars: s.chars, specials: s.specials, hri: d, data: d }) };
        }
    };

    SYMBOLOGIES.itf14 = {
        name: 'ITF-14',
        family: 'logistics',
        help: '13 digits, or 14 with the check digit.',
        charset: /^[0-9]*$/,
        options: ['bearer'],
        encode: function (input, opts) {
            opts = opts || {};
            var v = withCheck(input, 13, 'ITF-14');
            if (!v.ok) { return v; }
            var s = itfSymbol(v.value);
            s.chars[13].role = 'check';
            return {
                ok: true, computed: v.computed, check: v.value[13],
                symbol: symbol({ symbology: 'itf14', b: s.b, qz: [12, 12], chars: s.chars, specials: s.specials, hri: v.value, data: v.value, bearer: opts.bearer !== false })
            };
        }
    };

    /* === Code 39 ========================================================= */

    var C39_ALPHABET = '0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZ-. $/+%';
    var C39_CODES = [
        0x034, 0x121, 0x061, 0x160, 0x031, 0x130, 0x070, 0x025, 0x124, 0x064,
        0x109, 0x049, 0x148, 0x019, 0x118, 0x058, 0x00D, 0x10C, 0x04C, 0x01C,
        0x103, 0x043, 0x142, 0x013, 0x112, 0x052, 0x007, 0x106, 0x046, 0x016,
        0x181, 0x0C1, 0x1C0, 0x091, 0x190, 0x0D0, 0x085, 0x184, 0x0C4, 0x0A8,
        0x0A2, 0x08A, 0x02A
    ];
    var C39_STAR = 0x094;

    function c39Char(b, code) {
        for (var k = 8; k >= 0; k--) { b.push((8 - k) % 2 === 0, (code >> k) & 1 ? WIDE : 1); }
    }

    SYMBOLOGIES.code39 = {
        name: 'Code 39',
        family: 'general',
        help: 'Capital letters, digits, and the symbols - . space $ / + %.',
        charset: /^[0-9A-Z\-. $/+%]*$/,
        options: ['check'],
        normalize: function (s) { return s.toUpperCase(); },
        encode: function (input, opts) {
            opts = opts || {};
            var d = input.toUpperCase();
            if (!d.length) { return { ok: false, error: 'Enter some characters.' }; }
            for (var i = 0; i < d.length; i++) {
                if (C39_ALPHABET.indexOf(d[i]) < 0) { return { ok: false, error: 'Code 39 cannot encode "' + d[i] + '".' }; }
            }
            var check = null;
            if (opts.check) {
                var sum = 0;
                for (var j = 0; j < d.length; j++) { sum += C39_ALPHABET.indexOf(d[j]); }
                check = C39_ALPHABET[sum % 43];
            }
            var all = check === null ? d : d + check;
            var b = new Builder(), chars = [], specials = [];
            var s0 = b.x; c39Char(b, C39_STAR); specials.push({ kind: 'start', x0: s0, x1: b.x }); b.push(false, 1);
            for (var c = 0; c < all.length; c++) {
                var x0 = b.x;
                c39Char(b, C39_CODES[C39_ALPHABET.indexOf(all[c])]);
                chars.push({ ch: all[c], x0: x0, x1: b.x, role: (check !== null && c === all.length - 1) ? 'check' : undefined });
                b.push(false, 1);
            }
            var e0 = b.x; c39Char(b, C39_STAR); specials.push({ kind: 'stop', x0: e0, x1: b.x });
            return { ok: true, check: check, symbol: symbol({ symbology: 'code39', b: b, qz: [10, 10], chars: chars, specials: specials, hri: all, data: all }) };
        }
    };

    /* === Codabar (NW-7) ================================================== */

    var CB_ALPHABET = '0123456789-$:/.+ABCD';
    var CB_CODES = [
        0x003, 0x006, 0x009, 0x060, 0x012, 0x042, 0x021, 0x024, 0x030, 0x048,
        0x00C, 0x018, 0x045, 0x051, 0x054, 0x015, 0x01A, 0x029, 0x00B, 0x00E
    ];

    function cbChar(b, ch) {
        var code = CB_CODES[CB_ALPHABET.indexOf(ch)];
        for (var k = 6; k >= 0; k--) { b.push((6 - k) % 2 === 0, (code >> k) & 1 ? WIDE : 1); }
    }

    SYMBOLOGIES.codabar = {
        name: 'Codabar (NW-7)',
        family: 'general',
        help: 'Digits and - $ : / . +, between start and stop characters A to D.',
        charset: /^[0-9\-$:/.+A-Da-d]*$/,
        options: ['start', 'stop', 'check'],
        encode: function (input, opts) {
            opts = opts || {};
            var d = input.toUpperCase(), start = (opts.start || 'A').toUpperCase(), stop = (opts.stop || 'A').toUpperCase();
            if (/^[A-D]/.test(d) && d.length > 1 && /[A-D]$/.test(d)) { start = d[0]; stop = d[d.length - 1]; d = d.slice(1, -1); }
            if (!d.length) { return { ok: false, error: 'Enter some characters.' }; }
            for (var i = 0; i < d.length; i++) {
                if ('0123456789-$:/.+'.indexOf(d[i]) < 0) { return { ok: false, error: 'Codabar cannot encode "' + d[i] + '" inside the data.' }; }
            }
            var check = null;
            if (opts.check) {
                var sum = CB_ALPHABET.indexOf(start) + CB_ALPHABET.indexOf(stop);
                for (var j = 0; j < d.length; j++) { sum += CB_ALPHABET.indexOf(d[j]); }
                check = CB_ALPHABET[(16 - sum % 16) % 16];
            }
            var all = check === null ? d : d + check;
            var b = new Builder(), chars = [], specials = [];
            var s0 = b.x; cbChar(b, start); specials.push({ kind: 'start', x0: s0, x1: b.x, label: start }); b.push(false, 1);
            for (var c = 0; c < all.length; c++) {
                var x0 = b.x;
                cbChar(b, all[c]);
                chars.push({ ch: all[c], x0: x0, x1: b.x, role: (check !== null && c === all.length - 1) ? 'check' : undefined });
                b.push(false, 1);
            }
            var e0 = b.x; cbChar(b, stop); specials.push({ kind: 'stop', x0: e0, x1: b.x, label: stop });
            return { ok: true, check: check, start: start, stop: stop, symbol: symbol({ symbology: 'codabar', b: b, qz: [10, 10], chars: chars, specials: specials, hri: all, data: all }) };
        }
    };

    /* === Code 128 and GS1-128 =========================================== */

    var C128 = [
        '212222', '222122', '222221', '121223', '121322', '131222', '122213', '122312', '132212', '221213',
        '221312', '231212', '112232', '122132', '122231', '113222', '123122', '123221', '223211', '221132',
        '221231', '213212', '223112', '312131', '311222', '321122', '321221', '312212', '322112', '322211',
        '212123', '212321', '232121', '111323', '131123', '131321', '112313', '132113', '132311', '211313',
        '231113', '231311', '112133', '112331', '132131', '113123', '113321', '133121', '313121', '211331',
        '231131', '213113', '213311', '213131', '311123', '311321', '331121', '312113', '312311', '332111',
        '314111', '221411', '431111', '111224', '111422', '121124', '121421', '141122', '141221', '112214',
        '112412', '122114', '122411', '142112', '142211', '241211', '221114', '413111', '241112', '134111',
        '111242', '121142', '121241', '114212', '124112', '124211', '411212', '421112', '421211', '212141',
        '214121', '412121', '111143', '111341', '131141', '114113', '114311', '411113', '411311', '113141',
        '114131', '311141', '411131', '211412', '211214', '211232', '2331112'
    ];
    var C128_START_B = 104, C128_START_C = 105, C128_CODE_B = 100, C128_CODE_C = 99, C128_FNC1 = 102, C128_STOP = 106;

    /* Chooses code sets B and C: C for runs of four or more digits (or an
       even run that ends the data), B for everything else. Tokens are
       { ch, index } for a data character or { fnc1: true }. */
    function c128Symbols(tokens) {
        var n = tokens.length, out = [];
        function isDigit(i) { return i < n && tokens[i].ch !== undefined && tokens[i].ch >= '0' && tokens[i].ch <= '9'; }
        function run(i) { var c = 0; while (isDigit(i + c)) { c++; } return c; }
        function remaining(i) { var c = 0; for (var k = i; k < n; k++) { if (!tokens[k].fnc1) { c++; } } return c; }
        var first = 0;
        while (first < n && tokens[first].fnc1) { first++; }
        var r0 = run(first), set;
        if (r0 >= 4 || (r0 >= 2 && r0 === remaining(first) && r0 % 2 === 0)) { set = 'C'; out.push({ v: C128_START_C, kind: 'start' }); }
        else { set = 'B'; out.push({ v: C128_START_B, kind: 'start' }); }
        var i = 0;
        while (i < n) {
            var t = tokens[i];
            if (t.fnc1) { out.push({ v: C128_FNC1, kind: 'fnc1' }); i++; continue; }
            if (set === 'C') {
                if (run(i) >= 2) {
                    out.push({ v: +(tokens[i].ch + tokens[i + 1].ch), owners: [tokens[i].index, tokens[i + 1].index] });
                    i += 2;
                } else {
                    out.push({ v: C128_CODE_B, kind: 'shift' }); set = 'B';
                }
                continue;
            }
            var r = run(i);
            if (r >= 4 || (r >= 2 && i + r === n && r % 2 === 0)) {
                if (r % 2 === 1) { out.push({ v: t.ch.charCodeAt(0) - 32, owners: [t.index] }); i++; }
                out.push({ v: C128_CODE_C, kind: 'shift' }); set = 'C';
                continue;
            }
            out.push({ v: t.ch.charCodeAt(0) - 32, owners: [t.index] });
            i++;
        }
        var sum = out[0].v;
        for (var k = 1; k < out.length; k++) { sum += k * out[k].v; }
        out.push({ v: sum % 103, kind: 'check' });
        out.push({ v: C128_STOP, kind: 'stop' });
        return out;
    }

    function c128Build(tokens, dataLen) {
        var syms = c128Symbols(tokens), b = new Builder(), chars = new Array(dataLen), specials = [];
        syms.forEach(function (s) {
            var x0 = b.x;
            b.widths(C128[s.v].split('').map(Number));
            if (s.owners) { s.owners.forEach(function (idx) { chars[idx] = { x0: x0, x1: b.x }; }); }
            else { specials.push({ kind: s.kind, x0: x0, x1: b.x }); }
        });
        return { b: b, chars: chars, specials: specials, count: syms.length };
    }

    SYMBOLOGIES.code128 = {
        name: 'Code 128',
        family: 'general',
        help: 'Any printable ASCII character. Digit runs are packed two to a symbol.',
        charset: /^[\x20-\x7e]*$/,
        encode: function (input) {
            if (!input.length) { return { ok: false, error: 'Enter some characters.' }; }
            for (var i = 0; i < input.length; i++) {
                var c = input.charCodeAt(i);
                if (c < 32 || c > 126) { return { ok: false, error: 'Code 128 here takes printable ASCII only; "' + input[i] + '" is not.' }; }
            }
            var tokens = input.split('').map(function (ch, idx) { return { ch: ch, index: idx }; });
            var s = c128Build(tokens, input.length);
            input.split('').forEach(function (ch, idx) { s.chars[idx].ch = ch; });
            return { ok: true, symbol: symbol({ symbology: 'code128', b: s.b, qz: [10, 10], chars: s.chars, specials: s.specials, hri: input, data: input }) };
        }
    };

    /* === GS1 Application Identifiers ==================================== */

    /* fmt: n or an; len: fixed length, or max for variable; dec: the last
       AI digit gives the decimal places; date: YYMMDD. */
    var AIS = {
        '00': { name: 'SSCC', fmt: 'n', len: 18, fixed: true, check: true },
        '01': { name: 'GTIN', fmt: 'n', len: 14, fixed: true, check: true },
        '02': { name: 'Contained GTIN', fmt: 'n', len: 14, fixed: true, check: true },
        '10': { name: 'Batch or lot', fmt: 'an', len: 20 },
        '11': { name: 'Production date', fmt: 'n', len: 6, fixed: true, date: true },
        '12': { name: 'Due date', fmt: 'n', len: 6, fixed: true, date: true },
        '13': { name: 'Packaging date', fmt: 'n', len: 6, fixed: true, date: true },
        '15': { name: 'Best before', fmt: 'n', len: 6, fixed: true, date: true },
        '16': { name: 'Sell by', fmt: 'n', len: 6, fixed: true, date: true },
        '17': { name: 'Expiry', fmt: 'n', len: 6, fixed: true, date: true },
        '20': { name: 'Variant', fmt: 'n', len: 2, fixed: true },
        '21': { name: 'Serial number', fmt: 'an', len: 20 },
        '22': { name: 'Consumer product variant', fmt: 'an', len: 20 },
        '30': { name: 'Variable count', fmt: 'n', len: 8 },
        '37': { name: 'Count of trade items', fmt: 'n', len: 8 },
        '400': { name: 'Customer order number', fmt: 'an', len: 30 },
        '410': { name: 'Ship to (GLN)', fmt: 'n', len: 13, fixed: true, check: true },
        '414': { name: 'Location (GLN)', fmt: 'n', len: 13, fixed: true, check: true },
        '8005': { name: 'Price per unit', fmt: 'n', len: 6, fixed: true },
        '8020': { name: 'Payment slip reference', fmt: 'an', len: 25 },
        '90': { name: 'Mutually agreed', fmt: 'an', len: 30 }
    };
    var AI_DECIMAL = {
        '310': { name: 'Net weight', unit: 'kg' }, '311': { name: 'Length', unit: 'm' },
        '320': { name: 'Net weight', unit: 'lb' }, '330': { name: 'Gross weight', unit: 'kg' },
        '390': { name: 'Amount payable', unit: '', variable: true, len: 15 },
        '392': { name: 'Amount payable (single currency)', unit: '', variable: true, len: 15 }
    };
    /* AIs starting with these digits are predefined as fixed length, so no
       separator follows them even mid-string. */
    var PREDEFINED_FIXED = ['00', '01', '02', '03', '04', '11', '12', '13', '14', '15', '16', '17', '18', '19', '20', '31', '32', '33', '34', '35', '36', '41'];

    function aiInfo(ai) {
        if (AIS[ai]) { return AIS[ai]; }
        if (/^3[0-9]{3}$/.test(ai) && AI_DECIMAL[ai.slice(0, 3)]) {
            var dd = AI_DECIMAL[ai.slice(0, 3)];
            return { name: dd.name + (dd.unit ? ' (' + dd.unit + ')' : ''), fmt: 'n', len: dd.len || 6, fixed: !dd.variable, decimals: +ai[3], unit: dd.unit };
        }
        if (/^9[1-9]$/.test(ai)) { return { name: 'Company internal', fmt: 'an', len: 90, internal: true }; }
        return null;
    }

    function aiNeedsSeparator(ai) { return PREDEFINED_FIXED.indexOf(ai.slice(0, 2)) < 0; }

    function validDate6(s) {
        if (!/^[0-9]{6}$/.test(s)) { return false; }
        var m = +s.slice(2, 4), d = +s.slice(4, 6);
        if (m < 1 || m > 12) { return false; }
        if (d === 0) { return true; }
        var y = 2000 + (+s.slice(0, 2));
        return d <= new Date(y, m, 0).getDate();
    }

    var AN_CHARS = /^[!"%&'()*+,\-./0-9:;<=>?A-Z_a-z]*$/;

    /* Parses "(01)09501101530003(17)250101(10)AB12" into elements, checking
       each against the AI table. */
    function gs1Parse(input) {
        var s = input.trim();
        if (!s.length) { return { ok: false, error: 'Enter element strings like (01)09501101530003(17)250101.' }; }
        if (s[0] !== '(') { return { ok: false, error: 'Start with an AI in parentheses, like (01).' }; }
        var re = /\(([0-9]{2,4})\)([^()]*)/g, m, els = [], consumed = 0;
        while ((m = re.exec(s))) {
            if (m.index !== consumed) { return { ok: false, error: 'Unexpected text before (' + m[1] + ').' }; }
            consumed = re.lastIndex;
            els.push({ ai: m[1], value: m[2] });
        }
        if (consumed !== s.length) { return { ok: false, error: 'Unexpected text after the last element.' }; }
        for (var i = 0; i < els.length; i++) {
            var e = els[i], info = aiInfo(e.ai);
            if (!info) { return { ok: false, error: 'AI (' + e.ai + ') is not one this tool knows.' }; }
            e.info = info;
            if (info.fmt === 'n' && !/^[0-9]*$/.test(e.value)) { return { ok: false, error: '(' + e.ai + ') ' + info.name + ' takes digits only.' }; }
            if (info.fmt === 'an' && !AN_CHARS.test(e.value)) { return { ok: false, error: '(' + e.ai + ') ' + info.name + ' has a character GS1 does not allow.' }; }
            if (!e.value.length) { return { ok: false, error: '(' + e.ai + ') ' + info.name + ' is empty.' }; }
            if (info.fixed && e.value.length !== info.len) { return { ok: false, error: '(' + e.ai + ') ' + info.name + ' needs ' + info.len + ' digits; this has ' + e.value.length + '.' }; }
            if (!info.fixed && e.value.length > info.len) { return { ok: false, error: '(' + e.ai + ') ' + info.name + ' takes at most ' + info.len + ' characters.' }; }
            if (info.date && !validDate6(e.value)) { return { ok: false, error: '(' + e.ai + ') ' + info.name + ' is not a valid YYMMDD date.' }; }
            if (info.check) {
                var want = gs1Check(e.value.slice(0, -1));
                if (want !== e.value.slice(-1)) {
                    var fixed = s.replace('(' + e.ai + ')' + e.value, '(' + e.ai + ')' + e.value.slice(0, -1) + want);
                    return { ok: false, error: '(' + e.ai + ') ' + info.name + ' ends in check digit ' + e.value.slice(-1) + ', but it should be ' + want + '.', fix: fixed };
                }
            }
        }
        return { ok: true, elements: els };
    }

    SYMBOLOGIES['gs1-128'] = {
        name: 'GS1-128',
        family: 'logistics',
        help: 'Element strings with AIs in parentheses, like (01)09501101530003(17)261231(10)AB12.',
        charset: /^[\x20-\x7e]*$/,
        encode: function (input) {
            var p = gs1Parse(input);
            if (!p.ok) { return p; }
            /* The data string is the element strings without parentheses;
               FNC1 separates a variable-length element from the next. */
            var data = '', tokens = [{ fnc1: true }], roles = [], display = '', hriMap = [];
            p.elements.forEach(function (e, n) {
                display += '(';
                hriMap.push(-1);
                for (var a = 0; a < e.ai.length; a++) {
                    tokens.push({ ch: e.ai[a], index: data.length });
                    roles[data.length] = 'ai';
                    hriMap.push(data.length);
                    display += e.ai[a];
                    data += e.ai[a];
                }
                display += ')';
                hriMap.push(-1);
                for (var v = 0; v < e.value.length; v++) {
                    tokens.push({ ch: e.value[v], index: data.length });
                    if (e.info.check && v === e.value.length - 1) { roles[data.length] = 'check'; }
                    hriMap.push(data.length);
                    display += e.value[v];
                    data += e.value[v];
                }
                if (n < p.elements.length - 1 && aiNeedsSeparator(e.ai)) { tokens.push({ fnc1: true }); }
            });
            var s = c128Build(tokens, data.length);
            for (var i = 0; i < data.length; i++) { s.chars[i].ch = data[i]; if (roles[i]) { s.chars[i].role = roles[i]; } }
            return { ok: true, elements: p.elements, symbol: symbol({ symbology: 'gs1-128', b: s.b, qz: [10, 10], chars: s.chars, specials: s.specials, hri: display, hriMap: hriMap, data: data }) };
        }
    };

    /* === QR Code ========================================================= */

    /* The module matrix comes from Project Nayuki's QR Code generator
       (MIT), vendored at js/vendor/qrcodegen-1.8.0.js and loaded beside
       this engine by whoever loads it. The engine only wraps its matrix
       in a symbol; Reed-Solomon and masking stay in the vetted library. */
    SYMBOLOGIES.qr = {
        name: 'QR Code',
        family: 'matrix',
        help: 'Any text. Digits alone, or upper-case letters and digits, pack the most into a symbol.',
        charset: /^[\s\S]*$/,
        options: ['ecc'],
        encode: function (input, opts) {
            var Q = global.qrcodegen;
            if (!Q) { return { ok: false, error: 'QR Code support did not load.' }; }
            if (!input) { return { ok: false, error: 'Enter the text to encode.' }; }
            var level = String(opts.ecc || 'M').toUpperCase();
            var ecl = { L: Q.QrCode.Ecc.LOW, M: Q.QrCode.Ecc.MEDIUM, Q: Q.QrCode.Ecc.QUARTILE, H: Q.QrCode.Ecc.HIGH }[level];
            if (!ecl) { level = 'M'; ecl = Q.QrCode.Ecc.MEDIUM; }
            var qr;
            try { qr = Q.QrCode.encodeSegments(Q.QrSegment.makeSegments(input), ecl, 1, 40, -1, false); }
            catch (err) { return { ok: false, error: 'Too much data for a QR Code at error-correction level ' + level + '.' }; }
            var n = qr.size, modules = [];
            for (var y = 0; y < n; y++) { for (var x = 0; x < n; x++) { modules.push(qr.getModule(x, y)); } }
            /* The three finder patterns, for the structure highlight. */
            var specials = [[0, 0], [n - 7, 0], [0, n - 7]].map(function (p) {
                return { kind: 'finder', x0: p[0], x1: p[0] + 7, y0: p[1], y1: p[1] + 7 };
            });
            return {
                ok: true, version: qr.version, ecc: level,
                symbol: {
                    symbology: 'qr', matrix: true, size: n, modules: modules,
                    runs: [], width: n, qz: [4, 4], chars: [], specials: specials, guards: [],
                    textMode: 'none', hri: null, hriMap: null, data: input, bearer: false, barHeight: null,
                    version: qr.version, ecc: level
                }
            };
        }
    };

    function encode(sym, input, opts) {
        var def = SYMBOLOGIES[sym];
        if (!def) { return { ok: false, error: 'Unknown symbology ' + sym + '.' }; }
        return def.encode(input == null ? '' : String(input), opts || {});
    }

    /* === Rendering ======================================================= */

    var PALETTE = {
        blue: '#2f6fb3', gray: '#6b7280', orange: '#c2410c', green: '#1f7a3a',
        purple: '#6d3fb3', teal: '#0f766e', red: '#b91c1c', gold: '#a16207'
    };
    var ROLE_COLORS = { check: PALETTE.purple, ai: PALETTE.gray, structure: '#9ca3af' };

    function defaultBarHeight(sym) {
        if (sym.textMode === 'ean') { return 60; }
        return Math.max(40, Math.round(sym.width * 0.18));
    }

    /* Geometry in module units, shared by the canvas and SVG renderers. */
    function geometry(sym, o) {
        if (sym.matrix) {
            var side = sym.size + sym.qz[0] + sym.qz[1];
            return { pad: 0, left: sym.qz[0], width: side, barTop: sym.qz[0], barH: sym.size, guardH: sym.size, textTop: side, textH: 0, bandTop: side, height: side, bearerW: 0, font: 7 };
        }
        var pad = 2;
        var bearerW = sym.bearer ? 4 : 0;
        var h = o.barHeight || sym.barHeight || defaultBarHeight(sym);
        var text = o.showText !== false && sym.hri != null;
        var textH = text ? 11 : 0;
        var bands = o.bands && o.bands.length ? 5 : 0;
        var left = sym.qz[0] + bearerW, width = left + sym.width + sym.qz[1] + bearerW;
        var barTop = pad + bearerW;
        return {
            pad: pad, left: left, width: width, barTop: barTop, barH: h,
            guardH: sym.textMode === 'ean' && text ? h + 5 : h,
            textTop: barTop + h + bearerW + 1, textH: textH,
            bandTop: barTop + h + bearerW + textH + 1,
            height: barTop + h + bearerW + textH + bands + pad + 1,
            bearerW: bearerW,
            font: sym.textMode === 'ean' ? 8.5 : 7
        };
    }

    function inGuard(sym, x) {
        for (var i = 0; i < sym.guards.length; i++) { if (x >= sym.guards[i][0] && x < sym.guards[i][1]) { return true; } }
        return false;
    }

    /* Collects what gets drawn: bars, text pieces and bands. Each item is
       in module units; the renderers only scale and paint. */
    function layoutDrawing(sym, o) {
        o = o || {};
        var g = geometry(sym, o), items = { bars: [], texts: [], bands: [], rects: [] };
        if (sym.matrix) { return matrixDrawing(sym, o, g, items); }
        var x = g.left;
        sym.runs.forEach(function (r) {
            if (r.bar) {
                var tall = inGuard(sym, x - g.left);
                items.bars.push({ x: x, w: r.w, y: g.barTop, h: tall ? g.guardH : g.barH });
            }
            x += r.w;
        });
        if (sym.bearer) {
            var bw = g.bearerW;
            items.rects.push({ x: g.left - sym.qz[0] - bw, y: g.barTop - bw, w: g.width, h: bw });
            items.rects.push({ x: g.left - sym.qz[0] - bw, y: g.barTop + g.barH, w: g.width, h: bw });
            items.rects.push({ x: g.left - sym.qz[0] - bw, y: g.barTop - bw, w: bw, h: g.barH + 2 * bw });
            items.rects.push({ x: g.width - bw, y: g.barTop - bw, w: bw, h: g.barH + 2 * bw });
        }
        var colorOf = o.charColors || [];
        if (o.showText !== false && sym.hri != null) {
            if (sym.textMode === 'ean') {
                sym.chars.forEach(function (c, i) {
                    items.texts.push({
                        x: g.left + c.tx, y: g.textTop + g.font * 0.85, text: c.ch,
                        size: c.small ? g.font * 0.75 : g.font, color: colorOf[i] || null, anchor: 'middle'
                    });
                });
            } else {
                var chw = g.font * 0.6, total = sym.hri.length * chw;
                var start = g.left + sym.width / 2 - total / 2;
                for (var k = 0; k < sym.hri.length; k++) {
                    var di = sym.hriMap ? sym.hriMap[k] : k;
                    items.texts.push({
                        x: start + (k + 0.5) * chw, y: g.textTop + g.font * 0.9, text: sym.hri[k],
                        size: g.font, color: di >= 0 ? (colorOf[di] || null) : null, anchor: 'middle'
                    });
                }
            }
        }
        (o.bands || []).forEach(function (bd) {
            items.bands.push({ x: g.left + bd.x0, w: bd.x1 - bd.x0, y: g.bandTop, h: 3, color: bd.color });
        });
        return { g: g, items: items };
    }

    /* A matrix symbol draws its dark modules a row at a time, one rect per
       run. A band with y0 is a frame around a region, drawn a quarter of a
       module outside it and half a module thick, so it lies only on light
       modules (the separator and the quiet zone) and never on the code. */
    function matrixDrawing(sym, o, g, items) {
        var n = sym.size;
        for (var y = 0; y < n; y++) {
            var x = 0;
            while (x < n) {
                if (!sym.modules[y * n + x]) { x++; continue; }
                var x0 = x;
                while (x < n && sym.modules[y * n + x]) { x++; }
                items.rects.push({ x: g.left + x0, y: g.barTop + y, w: x - x0, h: 1 });
            }
        }
        (o.bands || []).forEach(function (bd) {
            if (bd.y0 == null) { return; }
            var gap = 0.25, t = 0.5;
            var l = g.left + bd.x0 - gap - t, r = g.left + bd.x1 + gap, top = g.barTop + bd.y0 - gap - t, bot = g.barTop + bd.y1 + gap;
            var w = r + t - l, h = bot + t - top;
            items.bands.push({ x: l, y: top, w: w, h: t, color: bd.color });
            items.bands.push({ x: l, y: bot, w: w, h: t, color: bd.color });
            items.bands.push({ x: l, y: top, w: t, h: h, color: bd.color });
            items.bands.push({ x: r, y: top, w: t, h: h, color: bd.color });
        });
        return { g: g, items: items };
    }

    /* Bands for the checks and the structure, from the symbol alone. */
    function roleBands(sym, o) {
        var bands = [];
        if (o.checks) {
            sym.chars.forEach(function (c) { if (c.role === 'check' && c.x0 != null) { bands.push({ x0: c.x0, x1: c.x1, color: ROLE_COLORS.check }); } });
            sym.specials.forEach(function (s) { if (s.kind === 'check') { bands.push({ x0: s.x0, x1: s.x1, color: ROLE_COLORS.check }); } });
        }
        if (o.structure) {
            sym.specials.forEach(function (s) { if (s.kind !== 'check') { bands.push({ x0: s.x0, x1: s.x1, y0: s.y0, y1: s.y1, color: ROLE_COLORS.structure }); } });
        }
        return bands;
    }

    /* Draws a symbol to a canvas. o.px is device pixels per module; o.cssScale
       divides it back for the element's CSS size. */
    function render(canvas, sym, o) {
        o = o || {};
        var px = Math.max(1, Math.round(o.px || 2));
        var d = layoutDrawing(sym, o), g = d.g;
        canvas.width = Math.round(g.width * px);
        canvas.height = Math.round(g.height * px);
        if (o.cssScale) {
            canvas.style.width = (canvas.width / o.cssScale) + 'px';
            canvas.style.height = (canvas.height / o.cssScale) + 'px';
        }
        var ctx = canvas.getContext('2d');
        ctx.fillStyle = '#ffffff';
        ctx.fillRect(0, 0, canvas.width, canvas.height);
        ctx.fillStyle = '#000000';
        d.items.bars.concat(d.items.rects).forEach(function (r) {
            ctx.fillRect(Math.round(r.x * px), Math.round(r.y * px), Math.round(r.w * px), Math.round(r.h * px));
        });
        d.items.bands.forEach(function (bd) {
            ctx.fillStyle = bd.color;
            ctx.fillRect(Math.round(bd.x * px), Math.round(bd.y * px), Math.max(1, Math.round(bd.w * px)), Math.round(bd.h * px));
        });
        ctx.textBaseline = 'alphabetic';
        d.items.texts.forEach(function (t) {
            ctx.font = (t.color ? '700 ' : '400 ') + (t.size * px) + 'px ui-monospace, "Cascadia Mono", Consolas, monospace';
            ctx.fillStyle = t.color || '#000000';
            ctx.textAlign = 'center';
            ctx.fillText(t.text, t.x * px, t.y * px);
        });
        return g;
    }

    function esc(s) { return String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;'); }

    /* SVG sized for print: o.moduleMM is the width of one module. */
    function toSVG(sym, o) {
        o = o || {};
        var mm = o.moduleMM || 0.33;
        var d = layoutDrawing(sym, o), g = d.g, out = [];
        out.push('<svg xmlns="http://www.w3.org/2000/svg" width="' + (g.width * mm).toFixed(3) + 'mm" height="' + (g.height * mm).toFixed(3) + 'mm" viewBox="0 0 ' + g.width + ' ' + g.height + '" shape-rendering="crispEdges">');
        out.push('<rect x="0" y="0" width="' + g.width + '" height="' + g.height + '" fill="#ffffff"/>');
        d.items.bars.concat(d.items.rects).forEach(function (r) {
            out.push('<rect x="' + r.x + '" y="' + r.y + '" width="' + r.w + '" height="' + r.h + '" fill="#000000"/>');
        });
        d.items.bands.forEach(function (bd) {
            out.push('<rect x="' + bd.x + '" y="' + bd.y + '" width="' + bd.w + '" height="' + bd.h + '" fill="' + bd.color + '"/>');
        });
        d.items.texts.forEach(function (t) {
            out.push('<text x="' + t.x.toFixed(3) + '" y="' + t.y.toFixed(3) + '" font-family="OCR-B, ui-monospace, Consolas, monospace" font-size="' + t.size + '" font-weight="' + (t.color ? 700 : 400) + '" text-anchor="middle" fill="' + (t.color || '#000000') + '">' + esc(t.text) + '</text>');
        });
        out.push('</svg>');
        return out.join('');
    }

    /* === Layouts ========================================================= */

    var FIELD_TYPES = ['fixed', 'number', 'text', 'date', 'decimal', 'enum', 'check'];
    var COLORS = Object.keys(PALETTE);

    function fieldLength(f) {
        switch (f.type) {
            case 'fixed': return (f.values && f.values[0] ? String(f.values[0]).length : 0);
            case 'date': return (f.format || '').length;
            case 'check': return 1;
            case 'enum': return f.length || (f.values ? Object.keys(f.values)[0].length : 0);
            case 'text': return f.length || null;
            default: return f.length;
        }
    }

    /* Checks a layout's shape; returns a list of problems, empty when it is
       usable. */
    function validateLayout(L, where) {
        var errs = [], at = where || 'layout';
        if (!L || typeof L !== 'object') { return [at + ' is not an object.']; }
        if (!/^[A-Za-z0-9-]+$/.test(L.id || '')) { errs.push(at + ': id must be letters, digits and hyphens.'); }
        if (!L.name) { errs.push(at + ': name is missing.'); }
        if (!SYMBOLOGIES[L.symbology]) { errs.push(at + ': symbology "' + L.symbology + '" is not one of ' + Object.keys(SYMBOLOGIES).join(', ') + '.'); }
        if (L.sample != null && (typeof L.sample !== 'object' || Array.isArray(L.sample))) { errs.push(at + ': sample must be an object of field id to value.'); }
        if (!Array.isArray(L.fields) || !L.fields.length) { errs.push(at + ': fields must be a non-empty list.'); return errs; }
        var ids = {}, byId = {};
        L.fields.forEach(function (f) { if (f && f.id && !byId[f.id]) { byId[f.id] = f; } });
        L.fields.forEach(function (f, i) {
            var fat = at + ' field ' + (i + 1) + (f && f.id ? ' (' + f.id + ')' : '');
            if (!f || typeof f !== 'object') { errs.push(fat + ' is not an object.'); return; }
            if (!/^[A-Za-z0-9_-]+$/.test(f.id || '')) { errs.push(fat + ': id must be letters, digits, hyphens or underscores.'); }
            else if (ids[f.id]) { errs.push(fat + ': id is used twice.'); }
            ids[f.id] = true;
            if (FIELD_TYPES.indexOf(f.type) < 0) { errs.push(fat + ': type must be one of ' + FIELD_TYPES.join(', ') + '.'); return; }
            if (f.color && COLORS.indexOf(f.color) < 0) { errs.push(fat + ': color must be one of ' + COLORS.join(', ') + '.'); }
            if (f.type === 'fixed' && (!Array.isArray(f.values) || !f.values.length)) { errs.push(fat + ': a fixed field needs values.'); }
            if (f.type === 'fixed' && Array.isArray(f.values) && f.values.some(function (v) { return String(v).length !== String(f.values[0]).length; })) { errs.push(fat + ': every fixed value must be the same length.'); }
            if ((f.type === 'number' || f.type === 'decimal') && !(f.length > 0)) { errs.push(fat + ': length is missing.'); }
            if (f.type === 'decimal' && !(f.decimals >= 0)) { errs.push(fat + ': decimals is missing.'); }
            if (f.type === 'date' && !/^(dd|mm|yy|yyyy)+$/.test(f.format || '')) { errs.push(fat + ': format must be built from dd, mm, yy and yyyy.'); }
            if (f.type === 'enum' && (!f.values || typeof f.values !== 'object' || Array.isArray(f.values) || !Object.keys(f.values).length)) { errs.push(fat + ': an enum needs values, an object of code to meaning.'); }
            if (f.type === 'enum' && f.values && Object.keys(f.values).some(function (k) { return k.length !== Object.keys(f.values)[0].length; })) { errs.push(fat + ': every enum code must be the same length.'); }
            if (f.type === 'check' && !CHECKS[f.algorithm]) { errs.push(fat + ': algorithm must be one of ' + Object.keys(CHECKS).join(', ') + '.'); }
            if (f.type === 'check' && f.over && f.over.some(function (id) { var g = byId[id]; return !g || g === f || (g.type === 'check' && !ids[id]); })) { errs.push(fat + ': over must name other fields of this layout, and a check digit it covers must come before it.'); }
            else if (f.type === 'check' && CHECKS[f.algorithm] && CHECKS[f.algorithm].length) {
                var covered = f.over
                    ? L.fields.filter(function (g) { return f.over.indexOf(g.id) >= 0; })
                    : L.fields.slice(0, i).filter(function (g) { return g.type !== 'check'; });
                var n = covered.reduce(function (a, g) { var k = fieldLength(g); return a === null || !k ? null : a + k; }, 0);
                if (n !== CHECKS[f.algorithm].length) { errs.push(fat + ': ' + f.algorithm + ' covers exactly ' + CHECKS[f.algorithm].length + ' digits of fixed length; name them with over.'); }
            }
            if (f.type === 'text' && !(f.length > 0) && !(f.maxLength > 0)) { errs.push(fat + ': a text field needs length or maxLength.'); }
            if (f.type === 'text' && !(f.length > 0) && i < L.fields.length - 1 && L.symbology !== 'gs1-128') { errs.push(fat + ': only the last field may vary in length.'); }
            if (L.symbology === 'gs1-128' && i === 0 && !f.ai) { errs.push(fat + ': the first GS1-128 field needs an ai.'); }
            if (f.ai && !aiInfo(String(f.ai))) { errs.push(fat + ': AI (' + f.ai + ') is not one this tool knows.'); }
        });
        return errs;
    }

    function validateFile(obj) {
        if (!obj || obj.format !== 'pc-barcode-layouts') { return { ok: false, errors: ['This is not a layout file: its format must be "pc-barcode-layouts".'] }; }
        if (obj.version !== 1) { return { ok: false, errors: ['Only version 1 layout files are understood.'] }; }
        if (!Array.isArray(obj.layouts)) { return { ok: false, errors: ['layouts must be a list.'] }; }
        var errs = [];
        obj.layouts.forEach(function (L, i) { errs = errs.concat(validateLayout(L, 'layout ' + (i + 1) + (L && L.id ? ' (' + L.id + ')' : ''))); });
        return { ok: !errs.length, errors: errs, layouts: obj.layouts };
    }

    var MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

    function parseDate(format, s) {
        var parts = format.match(/dd|mm|yyyy|yy/g), pos = 0, y = null, m = null, d = null;
        for (var i = 0; i < parts.length; i++) {
            var n = parts[i].length, v = s.substr(pos, n);
            if (!/^[0-9]+$/.test(v) || v.length !== n) { return null; }
            if (parts[i] === 'dd') { d = +v; } else if (parts[i] === 'mm') { m = +v; }
            else if (parts[i] === 'yy') { y = 2000 + (+v); } else { y = +v; }
            pos += n;
        }
        if (m === null || m < 1 || m > 12) { return null; }
        if (d !== null && (d < 1 || d > new Date(y || 2000, m, 0).getDate())) { return null; }
        return { y: y, m: m, d: d };
    }

    function formatDateValue(dt) {
        return (dt.d ? dt.d + ' ' : '') + MONTHS[dt.m - 1] + (dt.y ? ' ' + dt.y : '');
    }

    function formatDecimal(f, raw) {
        var n = raw.replace(/^0+(?=\d)/, '');
        var dec = f.decimals || 0, whole = n, frac = '';
        if (dec) {
            var padded = raw.padStart(dec + 1, '0');
            whole = padded.slice(0, padded.length - dec).replace(/^0+(?=\d)/, '');
            frac = padded.slice(padded.length - dec);
        }
        return (f.prefix || '') + whole + (dec ? '.' + frac : '') + (f.suffix || '');
    }

    /* Normalizes one field's entered value to its encoded characters. */
    function normalizeField(f, value, preserveWhitespace) {
        var v = value == null ? '' : String(value);
        if (!preserveWhitespace) { v = v.trim(); }
        var L = fieldLength(f);
        switch (f.type) {
            case 'fixed':
                if (!v) { v = String(f.values[0]); }
                if (f.values.map(String).indexOf(v) < 0) { return { error: 'Must be ' + f.values.join(' or ') + '.' }; }
                return { raw: v, display: v };
            case 'number':
                if (!/^[0-9]*$/.test(v)) { return { error: 'Digits only.' }; }
                if (!v) { return { error: 'Required.' }; }
                if (v.length > L) { return { error: 'At most ' + L + ' digits.' }; }
                if (v.length < L) {
                    if (f.pad === 'none') { return { error: 'Needs ' + L + ' digits.' }; }
                    v = v.padStart(L, '0');
                }
                return { raw: v, display: v.replace(/^0+(?=\d)/, '') };
            case 'decimal': {
                var raw;
                if (/^[0-9]*\.[0-9]*$/.test(v)) {
                    var parts = v.split('.'), dec = f.decimals || 0;
                    if (parts[1].length > dec) { return { error: 'At most ' + dec + ' decimal places.' }; }
                    raw = (parts[0] || '0') + parts[1].padEnd(dec, '0');
                } else if (/^[0-9]+$/.test(v)) {
                    raw = v;
                } else if (!v) { return { error: 'Required.' }; }
                else { return { error: 'A number, like 12.50.' }; }
                raw = raw.replace(/^0+(?=\d)/, '');
                if (raw.length > L) { return { error: 'Too large for ' + L + ' digits.' }; }
                raw = raw.padStart(L, '0');
                return { raw: raw, display: formatDecimal(f, raw) };
            }
            case 'date': {
                if (!v) { return { error: 'Required.' }; }
                if (v.length !== L) { return { error: 'Enter as ' + f.format + '.' }; }
                var dt = parseDate(f.format, v);
                if (!dt) { return { error: 'Not a valid date in ' + f.format + '.' }; }
                return { raw: v, display: formatDateValue(dt) };
            }
            case 'enum': {
                if (!v) { v = Object.keys(f.values)[0]; }
                if (!Object.prototype.hasOwnProperty.call(f.values, v)) { return { error: 'One of ' + Object.keys(f.values).join(', ') + '.' }; }
                return { raw: v, display: v, meaning: f.values[v] };
            }
            case 'text':
                if (!v) { return { error: 'Required.' }; }
                if (f.length && v.length !== f.length) { return { error: 'Needs ' + f.length + ' characters.' }; }
                if (f.maxLength && v.length > f.maxLength) { return { error: 'At most ' + f.maxLength + ' characters.' }; }
                return { raw: v, display: v };
        }
        return { error: 'Unknown field type.' };
    }

    function checkOver(L, idx, raws) {
        var f = L.fields[idx], over = f.over;
        var src = '';
        if (over) { over.forEach(function (id) { src += raws[id] || ''; }); }
        else { for (var i = 0; i < idx; i++) { if (L.fields[i].type !== 'check') { src += raws[L.fields[i].id] || ''; } } }
        if (!/^[0-9]*$/.test(src)) { return null; }
        return CHECKS[f.algorithm].compute(src);
    }

    /* Check digits are computed after every other field, so one can cover
       a field that follows it, as the GS1 price check precedes its price. */

    /* Composes a layout's field values into encoder input. Returns the
       input string, per-field results, and each field's span in the data
       string the encoder builds (for GS1-128, the element string without
       parentheses). */
    function compose(L, values, readOptions) {
        values = values || {};
        var results = {}, raws = {}, ok = true;
        L.fields.forEach(function (f) {
            if (f.type === 'check') { return; }
            var r = normalizeField(f, values[f.id], readOptions && readOptions.preserveWhitespace);
            if (r.error) { ok = false; }
            results[f.id] = r;
            raws[f.id] = r.raw || '';
        });
        L.fields.forEach(function (f, idx) {
            if (f.type !== 'check') { return; }
            var covered = f.over || L.fields.slice(0, idx).filter(function (g) { return g.type !== 'check'; }).map(function (g) { return g.id; });
            var c = covered.some(function (id) { return results[id] && results[id].error; }) ? null : checkOver(L, idx, raws);
            var r = c === null ? { error: 'Computed once the fields it covers are valid.' } : { raw: c, display: c, computed: true };
            if (r.error) { ok = false; }
            results[f.id] = r;
            raws[f.id] = r.raw || '';
        });
        var input = '', spans = [], pos = 0;
        if (L.symbology === 'gs1-128') {
            L.fields.forEach(function (f) {
                if (f.ai) { input += '(' + f.ai + ')'; spans.push({ id: '@ai' + f.ai, from: pos, to: pos + String(f.ai).length, ai: true }); pos += String(f.ai).length; }
                var raw = raws[f.id];
                spans.push({ id: f.id, from: pos, to: pos + raw.length });
                input += raw; pos += raw.length;
            });
        } else {
            L.fields.forEach(function (f) {
                var raw = raws[f.id];
                spans.push({ id: f.id, from: pos, to: pos + raw.length });
                input += raw; pos += raw.length;
            });
        }
        return { ok: ok, input: input, fields: results, spans: spans };
    }

    /* Fills an explain template from composed field results. */
    function explain(L, results) {
        if (!L.explain) { return ''; }
        return L.explain.replace(/\{([A-Za-z0-9_-]+)(?::(raw|meaning))?\}/g, function (all, id, mod) {
            var r = results[id];
            if (!r || r.error) { return '…'; }
            if (mod === 'raw') { return r.raw; }
            if (mod === 'meaning') { return r.meaning || r.display; }
            return r.meaning ? r.display + ' (' + r.meaning + ')' : r.display;
        });
    }

    /* Human-readable line for a layout: "data", "none", or a template. */
    function layoutHri(L, results, fallback) {
        if (!L.hri || L.hri === 'data') { return fallback; }
        if (L.hri === 'none') { return null; }
        return L.hri.replace(/\{([A-Za-z0-9_-]+)(?::(raw|unpadded))?\}/g, function (all, id, mod) {
            var r = results[id];
            if (!r || r.error) { return ''; }
            if (mod === 'unpadded') { return r.raw.replace(/^0+(?=\d)/, ''); }
            return r.raw;
        });
    }

    /* The number of check characters the symbology adds to a layout's
       data, for reading a scanned value back. */
    function symbologyCheckLength(sym, opts) {
        if (sym === 'ean13' || sym === 'ean8' || sym === 'upca' || sym === 'itf14') { return 1; }
        if ((sym === 'itf' || sym === 'code39' || sym === 'codabar') && opts && opts.check) { return 1; }
        return 0;
    }

    /* Reads a scanned value back into a layout's fields. Returns null when
       the layout cannot apply (wrong family, length or fixed values), or
       the field values with any problems found. */
    function interpretWith(L, scanned, readOptions) {
        var s = String(scanned), issues = [], values = {};
        var preserveWhitespace = readOptions && readOptions.preserveWhitespace;
        if (!preserveWhitespace) { s = s.trim(); }
        var opts = L.options || {};
        if (L.symbology === 'gs1-128') {
            var p = gs1Parse(s[0] === '(' ? s : '');
            if (!p.ok) { return null; }
            var ei = 0, fi = 0;
            while (fi < L.fields.length) {
                var f0 = L.fields[fi];
                if (!f0.ai) { return null; }
                var el = p.elements[ei];
                if (!el || el.ai !== String(f0.ai)) { return null; }
                var group = [f0];
                fi++;
                while (fi < L.fields.length && !L.fields[fi].ai) { group.push(L.fields[fi]); fi++; }
                var off = 0;
                for (var gi = 0; gi < group.length; gi++) {
                    var f = group[gi], len = fieldLength(f);
                    var piece = len ? el.value.substr(off, len) : el.value.slice(off);
                    if (len && piece.length !== len) { return null; }
                    values[f.id] = piece; off += piece.length;
                }
                if (off !== el.value.length) { return null; }
                ei++;
            }
            if (ei !== p.elements.length) { return null; }
        } else {
            if (!preserveWhitespace) { s = s.replace(/\s+/g, ''); }
            if (L.symbology === 'codabar' && /^[A-Da-d]/.test(s) && /[A-Da-d]$/.test(s) && s.length > 2) { s = s.slice(1, -1); }
            var extra = symbologyCheckLength(L.symbology, opts);
            var total = 0, variable = false;
            L.fields.forEach(function (f) { var n = fieldLength(f); if (n) { total += n; } else { variable = true; } });
            if (variable ? s.length < total + extra : s.length !== total + extra) { return null; }
            if (extra) {
                var body = s.slice(0, s.length - extra), tail = s.slice(s.length - extra);
                if (/^[0-9]+$/.test(s) && ['ean13', 'ean8', 'upca', 'itf14', 'itf'].indexOf(L.symbology) >= 0) {
                    var want = gs1Check(body);
                    if (want !== tail) { issues.push('The symbol check digit is ' + tail + ', but it should be ' + want + '.'); }
                }
                s = body;
            }
            var pos = 0;
            L.fields.forEach(function (f) {
                var n = fieldLength(f);
                values[f.id] = n ? s.substr(pos, n) : s.slice(pos);
                pos += n || (s.length - pos);
            });
        }
        /* Fixed fields must match for the layout to apply at all. */
        for (var i = 0; i < L.fields.length; i++) {
            var fx = L.fields[i];
            if (fx.type === 'fixed' && fx.values.map(String).indexOf(values[fx.id]) < 0) { return null; }
        }
        var c = compose(L, values, readOptions);
        L.fields.forEach(function (f) {
            var r = c.fields[f.id];
            if (f.type === 'check') {
                if (!r.error && r.raw !== values[f.id]) { issues.push(f.name + ' is ' + values[f.id] + ', but it should be ' + r.raw + '.'); }
            } else if (r.error) {
                issues.push(f.name + ': ' + r.error);
            }
        });
        return { layout: L, values: values, composed: c, issues: issues };
    }

    /* === GS1 company prefixes, for identifying an EAN-13 ================ */

    var GS1_PREFIXES = [
        ['000', '019', 'United States and Canada'], ['020', '029', 'Restricted circulation (in-store)'],
        ['030', '039', 'United States (drugs)'], ['040', '049', 'Restricted circulation (in-store)'],
        ['050', '059', 'Coupons'], ['060', '139', 'United States and Canada'],
        ['200', '299', 'Restricted circulation (in-store)'], ['300', '379', 'France and Monaco'],
        ['400', '440', 'Germany'], ['450', '459', 'Japan'], ['460', '469', 'Russia'],
        ['471', '471', 'Taiwan'], ['480', '480', 'Philippines'], ['489', '489', 'Hong Kong'],
        ['490', '499', 'Japan'], ['500', '509', 'United Kingdom'], ['540', '549', 'Belgium and Luxembourg'],
        ['570', '579', 'Denmark'], ['690', '699', 'China'], ['700', '709', 'Norway'], ['730', '739', 'Sweden'],
        ['750', '750', 'Mexico'], ['760', '769', 'Switzerland'], ['800', '839', 'Italy'], ['840', '849', 'Spain'],
        ['870', '879', 'Netherlands'], ['880', '881', 'South Korea'], ['885', '885', 'Thailand'],
        ['888', '888', 'Singapore'], ['890', '890', 'India'], ['893', '893', 'Vietnam'], ['899', '899', 'Indonesia'],
        ['930', '939', 'Australia'], ['940', '949', 'New Zealand'], ['955', '955', 'Malaysia'],
        ['977', '977', 'Serial publications (ISSN)'], ['978', '979', 'Books (ISBN)'],
        ['980', '980', 'Refund receipts'], ['981', '984', 'Coupons'], ['990', '999', 'Coupons']
    ];

    function gs1PrefixName(d13) {
        var p = +d13.slice(0, 3);
        for (var i = 0; i < GS1_PREFIXES.length; i++) {
            if (p >= +GS1_PREFIXES[i][0] && p <= +GS1_PREFIXES[i][1]) { return GS1_PREFIXES[i][2]; }
        }
        return null;
    }

    /* What a scanned value could be, without any layout. */
    function identify(scanned) {
        var s = String(scanned).trim(), out = [];
        if (s[0] === '(') {
            var p = gs1Parse(s);
            if (p.ok) {
                out.push({ symbology: 'gs1-128', title: 'GS1 element strings', elements: p.elements.map(describeElement) });
            } else {
                out.push({ symbology: 'gs1-128', title: 'GS1 element strings', problem: p.error });
            }
            return out;
        }
        var d = s.replace(/\s+/g, '');
        if (/^[0-9]+$/.test(d)) {
            var ok = function (n) { return gs1Check(d.slice(0, n - 1)) === d[n - 1]; };
            if (d.length === 13) {
                out.push({ symbology: 'ean13', title: 'EAN-13', valid: ok(13), note: ok(13) ? (gs1PrefixName(d) ? 'GS1 prefix ' + d.slice(0, 3) + ': ' + gs1PrefixName(d) + '.' : '') : 'The check digit should be ' + gs1Check(d.slice(0, 12)) + '.' });
            }
            if (d.length === 12) { out.push({ symbology: 'upca', title: 'UPC-A', valid: ok(12), note: ok(12) ? '' : 'The check digit should be ' + gs1Check(d.slice(0, 11)) + '.' }); }
            if (d.length === 8) {
                out.push({ symbology: 'ean8', title: 'EAN-8', valid: ok(8), note: ok(8) ? '' : 'The check digit should be ' + gs1Check(d.slice(0, 7)) + '.' });
                if (d[0] === '0' || d[0] === '1') {
                    var e = SYMBOLOGIES.upce.encode(d);
                    out.push({ symbology: 'upce', title: 'UPC-E', valid: e.ok, note: e.ok ? 'Expands to UPC-A ' + e.expanded + '.' : e.error });
                }
            }
            if (d.length === 14) { out.push({ symbology: 'itf14', title: 'GTIN-14 (ITF-14)', valid: ok(14), note: ok(14) ? 'Packaging level ' + d[0] + '.' : 'The check digit should be ' + gs1Check(d.slice(0, 13)) + '.' }); }
            if (d.length % 2 === 0 && d.length !== 14) { out.push({ symbology: 'itf', title: 'Interleaved 2 of 5', valid: true, note: d.length + ' digits.' }); }
        }
        return out;
    }

    function describeElement(e) {
        var v = e.value, shown = v;
        if (e.info.date) { var dt = parseDate('yymmdd', v); shown = dt ? formatDateValue(dt) : v; }
        else if (e.info.decimals != null) { shown = formatDecimal({ decimals: e.info.decimals }, v) + (e.info.unit ? ' ' + e.info.unit : ''); }
        return { ai: e.ai, name: e.info.name, value: v, shown: shown };
    }

    /* Demonstration layouts. They are generic and invented: nothing here
       comes from a customer or a real scheme. */
    var DEMOS = [
        {
            id: 'demo-price-embedded', name: 'Price-embedded item', symbology: 'ean13',
            description: 'An in-store EAN-13 in the restricted-circulation range, carrying an item number and a price.',
            explain: 'Item {item} at {price}.',
            fields: [
                { id: 'prefix', name: 'Prefix', type: 'fixed', values: ['21'], color: 'blue', description: 'Restricted-circulation prefix chosen for priced items' },
                { id: 'item', name: 'Item', type: 'number', length: 5, color: 'gray' },
                { id: 'price', name: 'Price', type: 'decimal', length: 5, decimals: 2, color: 'green' }
            ],
            sample: { item: '4213', price: '3.49' }
        },
        {
            id: 'demo-price-check5', name: 'Price with a price check digit', symbology: 'ean13',
            description: 'A variable-measure EAN-13 whose five-digit price is guarded by the GS1 price check digit that stands before it.',
            explain: 'Item {item} at {price}.',
            fields: [
                { id: 'prefix', name: 'Prefix', type: 'fixed', values: ['20'], color: 'blue', description: 'Restricted-circulation prefix chosen for priced items' },
                { id: 'item', name: 'Item', type: 'number', length: 4, color: 'gray' },
                { id: 'pcheck', name: 'Price check', type: 'check', algorithm: 'gs1-price5', over: ['price'], color: 'purple' },
                { id: 'price', name: 'Price', type: 'decimal', length: 5, decimals: 2, color: 'green' }
            ],
            sample: { item: '731', price: '146.85' }
        },
        {
            id: 'demo-price-check4', name: 'UPC-A price with a price check digit', symbology: 'upca',
            description: 'A variable-measure UPC-A, number system 2, with a five-digit item and a four-digit price behind the GS1 price check digit.',
            explain: 'Item {item} at {price}.',
            fields: [
                { id: 'system', name: 'Number system', type: 'fixed', values: ['2'], color: 'blue' },
                { id: 'item', name: 'Item', type: 'number', length: 5, color: 'gray' },
                { id: 'pcheck', name: 'Price check', type: 'check', algorithm: 'gs1-price4', over: ['price'], color: 'purple' },
                { id: 'price', name: 'Price', type: 'decimal', length: 4, decimals: 2, prefix: '$', color: 'green' }
            ],
            sample: { item: '4011', price: '28.75' }
        },
        {
            id: 'demo-weight-embedded', name: 'Weight-embedded item', symbology: 'ean13',
            description: 'An in-store EAN-13 carrying an item number and a net weight in kilograms.',
            explain: 'Item {item}, weighing {weight}.',
            fields: [
                { id: 'prefix', name: 'Prefix', type: 'fixed', values: ['22'], color: 'blue' },
                { id: 'item', name: 'Item', type: 'number', length: 5, color: 'gray' },
                { id: 'weight', name: 'Weight', type: 'decimal', length: 5, decimals: 3, suffix: ' kg', color: 'teal' }
            ],
            sample: { item: '1102', weight: '1.250' }
        },
        {
            id: 'demo-logistics', name: 'Logistics label', symbology: 'gs1-128',
            description: 'A case label with its GTIN, expiry date, net weight and batch, as GS1 Application Identifiers.',
            explain: 'GTIN {gtin:raw}{check:raw}, expires {expiry}, {weight} net, batch {batch}.',
            fields: [
                { id: 'gtin', name: 'GTIN', type: 'number', length: 13, ai: '01', color: 'blue' },
                { id: 'check', name: 'GTIN check', type: 'check', algorithm: 'gs1-mod10', over: ['gtin'], color: 'purple' },
                { id: 'expiry', name: 'Expiry', type: 'date', format: 'yymmdd', ai: '17', color: 'orange' },
                { id: 'weight', name: 'Net weight', type: 'decimal', length: 6, decimals: 3, suffix: ' kg', ai: '3103', color: 'teal' },
                { id: 'batch', name: 'Batch', type: 'text', maxLength: 20, ai: '10', color: 'gray' }
            ],
            sample: { gtin: '0950110153000', expiry: '271231', weight: '12.500', batch: 'LOT42A' }
        },
        {
            id: 'demo-receipt', name: 'Receipt lookup', symbology: 'itf',
            description: 'A receipt footer code for returns: store, register, date and transaction, all numeric.',
            explain: 'Store {store}, register {register}, {date}, transaction {txn}.',
            fields: [
                { id: 'store', name: 'Store', type: 'number', length: 4, color: 'blue' },
                { id: 'register', name: 'Register', type: 'number', length: 3, color: 'gray' },
                { id: 'date', name: 'Date', type: 'date', format: 'yymmdd', color: 'orange' },
                { id: 'txn', name: 'Transaction', type: 'number', length: 5, color: 'green' }
            ],
            sample: { store: '17', register: '3', date: '260929', txn: '1234' }
        },
        {
            id: 'demo-membership', name: 'Membership card', symbology: 'codabar',
            description: 'A Codabar membership card with a tier code, a member number and a Luhn check digit.',
            options: { start: 'A', stop: 'B' },
            explain: '{tier:meaning} member {member}.',
            fields: [
                { id: 'tier', name: 'Tier', type: 'enum', values: { '10': 'Standard', '20': 'Silver', '30': 'Gold' }, color: 'blue' },
                { id: 'member', name: 'Member', type: 'number', length: 10, color: 'gray' },
                { id: 'check', name: 'Check digit', type: 'check', algorithm: 'luhn', color: 'purple' }
            ],
            sample: { tier: '20', member: '4410023' }
        },
        {
            id: 'demo-coupon', name: 'Store coupon', symbology: 'code128',
            description: 'A numeric coupon carrying a campaign, a discount type and value, an expiry date and a check digit.',
            explain: 'Campaign {campaign}: {type:meaning}, value {value}, valid until {expiry}.',
            fields: [
                { id: 'prefix', name: 'Coupon prefix', type: 'fixed', values: ['99'], color: 'blue' },
                { id: 'campaign', name: 'Campaign', type: 'number', length: 4, color: 'gray' },
                { id: 'type', name: 'Discount type', type: 'enum', values: { '1': 'percent off one item', '2': 'amount off the transaction', '3': 'free item', '9': 'recorded only, no discount' }, color: 'orange' },
                { id: 'value', name: 'Value', type: 'number', length: 4, color: 'green' },
                { id: 'expiry', name: 'Expiry', type: 'date', format: 'yymmdd', color: 'teal' },
                { id: 'check', name: 'Check digit', type: 'check', algorithm: 'gs1-mod10', color: 'purple' }
            ],
            sample: { campaign: '318', type: '1', value: '15', expiry: '261231' }
        }
    ];

    global.barcodeEngine = {
        symbologies: SYMBOLOGIES,
        demos: DEMOS,
        checks: CHECKS,
        palette: PALETTE,
        roleColors: ROLE_COLORS,
        encode: encode,
        render: render,
        toSVG: toSVG,
        geometry: geometry,
        roleBands: roleBands,
        gs1: { parse: gs1Parse, aiInfo: aiInfo, prefixName: gs1PrefixName },
        layouts: {
            preservesWhitespace: true,
            validate: validateLayout,
            validateFile: validateFile,
            compose: compose,
            explain: explain,
            hri: layoutHri,
            interpret: interpretWith,
            fieldLength: fieldLength,
            types: FIELD_TYPES,
            colors: COLORS
        },
        identify: identify
    };
})(typeof window !== 'undefined' ? window : globalThis);

/* The layout library the barcode tool and the scanner share: the reader's
   own layouts, as a file of the "pc-barcode-layouts" format.

   Where the host has a file system (pudlHost.fs), the library is the file
   ~/barcode-layouts.json, an ordinary file the reader can open, edit,
   copy or delete like any other; where it has none, it is kept in this
   browser's storage under pc-barcode-layouts. A library kept in the
   browser before the host had a file system moves into the file the first
   time it is read, and the browser's copy is kept aside under
   pc-barcode-layouts-moved, which also stops it moving again.

     barcodeLibrary.load(B)    resolves to { layouts, error }: the layouts
                               that are not demonstrations, and why the
                               library could not be read, or null
     barcodeLibrary.save(B, list)
                               resolves to null, or why it was not saved;
                               a library that could not be read is never
                               written over
     barcodeLibrary.onChange(fn)
                               calls fn() when the library may have
                               changed elsewhere; returns a function that
                               stops it
     barcodeLibrary.path       the file's path, or null in the browser
     barcodeLibrary.where()    where the layouts are kept, in words

   B is the barcode engine, which checks the file. */
(function (global) {
    'use strict';
    if (global.barcodeLibrary) { return; }

    var PATH = '~/barcode-layouts.json', KEY = 'pc-barcode-layouts', MOVED = 'pc-barcode-layouts-moved';
    var broken = false;

    function fs() {
        var h = global.pudlHost;
        return h && h.fs && typeof h.fs.readText === 'function' && typeof h.fs.writeText === 'function' ? h.fs : null;
    }
    function text(list) { return JSON.stringify({ format: 'pc-barcode-layouts', version: 1, layouts: list }, null, 2); }
    function own(B, layouts) { return layouts.filter(function (L) { return !B.demos.some(function (d) { return d.id === L.id; }); }); }
    function stored(key) { try { return localStorage.getItem(key); } catch (err) { return null; } }

    /* The layouts in a file's text, or why there are none. */
    function parse(B, raw, name) {
        var obj;
        try { obj = JSON.parse(raw); } catch (err) { return { layouts: [], error: name + ' is not valid JSON: ' + err.message }; }
        var res = B.layouts.validateFile(obj);
        if (!res.ok) { return { layouts: [], error: name + ' could not be read: ' + res.errors.slice(0, 2).join(' ') }; }
        return { layouts: own(B, res.layouts), error: null };
    }

    function load(B) {
        var f = fs();
        if (!f) {
            var raw = stored(KEY);
            var got = raw ? parse(B, raw, 'The saved layout library') : { layouts: [], error: null };
            broken = !!got.error;
            return Promise.resolve(got);
        }
        return Promise.resolve(f.readText(PATH)).then(function (raw) {
            if (raw != null) { var got = parse(B, raw, PATH); broken = !!got.error; return got; }
            broken = false;
            var old = stored(KEY);
            if (!old || stored(MOVED) !== null) { return { layouts: [], error: null }; }
            var moving = parse(B, old, 'The layouts kept in this browser');
            if (moving.error) { return moving; }
            return Promise.resolve(f.writeText(PATH, text(moving.layouts))).then(function (err) {
                if (err) { return { layouts: moving.layouts, error: 'Your layouts could not move into ' + PATH + ': ' + err }; }
                try { localStorage.setItem(MOVED, old); localStorage.removeItem(KEY); } catch (e) { }
                return { layouts: moving.layouts, error: null };
            });
        }, function (err) {
            broken = true;
            return { layouts: [], error: PATH + ' could not be read: ' + (err && err.message || err) };
        });
    }

    function save(B, list) {
        if (broken) { return Promise.resolve('the library could not be read, so it was not written over; correct ' + (fs() ? PATH : 'it') + ' first'); }
        var f = fs();
        if (!f) {
            try { localStorage.setItem(KEY, JSON.stringify({ format: 'pc-barcode-layouts', version: 1, layouts: list })); }
            catch (err) { return Promise.resolve('this browser would not store it (' + err.name + ')'); }
            try { global.dispatchEvent(new CustomEvent('barcode-library-change')); } catch (err) { }
            return Promise.resolve(null);
        }
        return Promise.resolve(f.writeText(PATH, text(list))).then(function (err) { return err || null; }, function (err) { return (err && err.message) || String(err); });
    }

    function onChange(fn) {
        var f = fs();
        if (f && typeof f.onChange === 'function') { return f.onChange(function () { fn(); }); }
        if (f) { return function () { }; }
        function storage(e) { if (!e.key || e.key === KEY) { fn(); } }
        function local() { fn(); }
        global.addEventListener('storage', storage);
        global.addEventListener('barcode-library-change', local);
        return function () { global.removeEventListener('storage', storage); global.removeEventListener('barcode-library-change', local); };
    }

    global.barcodeLibrary = {
        load: load, save: save, onChange: onChange, text: text,
        get path() { return fs() ? PATH : null; },
        where: function () { return fs() ? PATH : 'this browser'; }
    };
})(typeof window === 'undefined' ? globalThis : window);

/* Scanner interpretation stays independent of camera and DOM APIs. */
(function (global) {
    'use strict';
    var formats = { EAN13: 'ean13', EAN8: 'ean8', UPCA: 'upca', UPCE: 'upce',
        Code128: 'code128', Code39: 'code39', Code39Std: 'code39', Code39Ext: 'code39',
        ITF: 'itf', ITF14: 'itf14', Codabar: 'codabar', QRCode: 'qr', QRCodeModel2: 'qr' };

    function visible(text) {
        return String(text).replace(/[\x00-\x1f\x7f]/g, function (c) {
            return ({ 9: '<TAB>', 10: '<LF>', 13: '<CR>', 29: '<GS>' })[c.charCodeAt(0)] ||
                '<0x' + c.charCodeAt(0).toString(16).padStart(2, '0').toUpperCase() + '>';
        });
    }

    function gs1Input(raw, B) {
        var pos = 0, parts = [];
        while (pos < raw.length) {
            if (raw[pos] === '\x1d') { throw new Error('Unexpected GS separator at character ' + (pos + 1) + '.'); }
            var ai, info;
            for (var n = 2; n <= 4; n++) {
                ai = raw.slice(pos, pos + n); info = B.gs1.aiInfo(ai);
                if (info) { break; }
            }
            if (!info) { throw new Error('Unknown GS1 Application Identifier at character ' + (pos + 1) + '.'); }
            pos += ai.length;
            var end = info.fixed ? pos + info.len : raw.indexOf('\x1d', pos);
            if (end < 0) { end = raw.length; }
            var value = raw.slice(pos, end);
            if (end > raw.length || value.indexOf('\x1d') >= 0 || /[()]/.test(value)) {
                throw new Error('AI (' + ai + ') cannot be represented by the layout reader. Check its length and separators.');
            }
            parts.push('(' + ai + ')' + value);
            pos = end;
            if (raw[pos] === '\x1d') { pos++; }
        }
        var result = parts.join(''), parsed = B.gs1.parse(result);
        if (!parsed.ok) { throw new Error(parsed.error); }
        return result;
    }

    function inspect(capture, layouts, selected, B) {
        var raw = String(capture.text || ''), text = raw, format = capture.format || '',
            aim = capture.symbologyIdentifier || '', issues = [], matches = [];
        if (capture.source === 'text' && /^\][A-Za-z][0-9]/.test(text)) {
            aim = text.slice(0, 3); text = text.slice(3);
        }
        var sym = formats[format] || format;
        if (aim === ']C1') { sym = 'gs1-128'; }
        else if (!sym && aim === ']C0') { sym = 'code128'; }
        if (!sym && capture.source === 'text' && /^\([0-9]{2,4}\)/.test(text)) { sym = 'gs1-128'; }
        var gs1 = sym === 'gs1-128' || capture.contentType === 'GS1';
        try {
            if (!raw) { throw new Error('Enter or scan a barcode.'); }
            if (capture.isValid === false) { throw new Error(capture.error || 'The decoder reported an invalid symbol.'); }
            if (gs1) {
                if (capture.source === 'text' && text[0] === '(') {
                    var parsed = B.gs1.parse(text); if (!parsed.ok) { throw new Error(parsed.error); }
                } else { text = gs1Input(text, B); }
            } else if (/\s/.test(text) && (!sym || /^(ean13|ean8|upca|upce|itf|itf14|codabar)$/.test(sym))) {
                throw new Error('Whitespace is present in the captured value. It has not been removed.');
            }
            var candidates = layouts.filter(function (L) { return !selected || L.id === selected; });
            if (selected && !candidates.length) { throw new Error('The selected layout is not in your layouts. Import it or choose another layout.'); }
            candidates.forEach(function (L) {
                var input = text, equivalent = false;
                // GS1 permits UPC-A to be reported with an implied leading zero.
                // Keep the capture intact and adapt only the layout-reader input.
                if (sym === 'ean13' && L.symbology === 'upca' && /^0[0-9]{12}$/.test(text)) {
                    input = text.slice(1); equivalent = true;
                } else if (sym === 'upca' && L.symbology === 'ean13' && /^[0-9]{12}$/.test(text)) {
                    input = '0' + text; equivalent = true;
                }
                if (sym && L.symbology !== sym && !equivalent && !(sym === 'itf' && L.symbology === 'itf14')) { return; }
                var match = B.layouts.interpret(L, input, { preserveWhitespace: true });
                if (match && equivalent) { match.normalization = 'UPC-A and its EAN-13 representation differ by an implied leading zero. The raw scan above is unchanged.'; }
                if (match) { matches.push(match); }
            });
            if (!matches.length) { issues.push(selected ? 'The selected layout does not match this format, length or fixed fields.' : 'No available layout matches this value.'); }
        } catch (e) { issues.push(e.message); }
        return { raw: raw, input: text, symbology: sym, aim: aim, matches: matches, issues: issues };
    }
    global.barcodeScannerCore = { visible: visible, inspect: inspect, gs1Input: gs1Input };
})(typeof window !== 'undefined' ? window : globalThis);

/* Versioned lookup definitions and execution, independent of scanner rendering. */
(function (global) {
    'use strict';
    var formats = { EAN13: 'ean13', EAN8: 'ean8', UPCA: 'upca', UPCE: 'upce', QRCode: 'qr', QRCodeModel2: 'qr' };
    var defaults = [{
        id: 'builtin:open-food-facts', revision: 1, name: 'Open Food Facts',
        description: 'Food products. Coverage varies; a missing record does not mean the barcode is invalid.',
        execution: 'request', accepts: [{ kind: 'gtin', symbologies: ['ean13', 'ean8', 'upca', 'upce'] }],
        request: { transport: 'connector', connector: 'open-food-facts' },
        response: { adapter: 'json-fields-v1', found: { pointer: '/found', equals: true }, notFound: { pointer: '/found', equals: false }, title: '/product/product_name', fields: [
            { label: 'Brand', pointer: '/product/brands' }, { label: 'Quantity', pointer: '/product/quantity' }, { label: 'Ingredients', pointer: '/product/ingredients_text' }
        ] },
        attribution: { name: 'Open Food Facts', url: 'https://world.openfoodfacts.org', text: 'Open Food Facts contributors. Database: ODbL; individual contents: DbCL.' }
    }, {
        id: 'builtin:open-url', revision: 1, name: 'Open URL', description: 'Preview the full address before opening it. No preview request is sent.',
        execution: 'local', handler: 'http-url-v1', accepts: [{ kind: 'uri' }]
    }];
    function fail(s) { throw new Error(s); }
    /* A connector source goes through the host, which offers its proxy as
       the service barcode-products (pudlHost.service); the connector's
       name is the path under it. A host without the service has no
       connector sources. */
    function connector(name) {
        var h = global.pudlHost, base = h && typeof h.service === 'function' ? h.service('barcode-products') : null;
        return base ? base + name + '/' : null;
    }
    function available(s) { return !(s.request && s.request.transport === 'connector') || !!connector(s.request.connector); }
    function object(v) { return v && typeof v === 'object' && !Array.isArray(v); }
    function keys(v, allowed) { if (!object(v) || Object.keys(v).some(function (k) { return allowed.indexOf(k) < 0; })) { fail('Unknown or invalid source fields.'); } }
    function str(v, label, max) { if (typeof v !== 'string' || !v.trim() || v.length > (max || 200)) { fail('Invalid ' + label + '.'); } }
    function safeUrl(s, https) {
        if (typeof s !== 'string' || /[\x00-\x20\x7f]/.test(s)) { fail('The URL contains whitespace or control characters.'); }
        var u = new URL(s);
        if (!(https ? u.protocol === 'https:' : /^(https?:)$/.test(u.protocol)) || u.username || u.password) { fail('Use an HTTP(S) URL without credentials.'); }
        return u.href;
    }
    function pointer(p) { if (typeof p !== 'string' || p.length > 300 || (p !== '' && p[0] !== '/') || /~(?![01])/.test(p)) { fail('Invalid JSON Pointer.'); } }
    function read(data, p) { pointer(p); return p === '' ? data : p.slice(1).split('/').reduce(function (v, key) { key = key.replace(/~1/g, '/').replace(/~0/g, '~'); return v != null && Object.prototype.hasOwnProperty.call(v, key) ? v[key] : undefined; }, data); }
    function validate(s, user) {
        keys(s, ['id', 'revision', 'name', 'description', 'execution', 'handler', 'accepts', 'symbologyMap', 'request', 'response', 'attribution', 'copiedFrom']);
        str(s.id, 'source ID'); if (!/^(builtin|user):[a-z0-9-]+$/.test(s.id) || (user && !s.id.startsWith('user:'))) { fail('User source IDs must start with user: and use lowercase letters, digits and hyphens.'); }
        str(s.name, 'name'); str(s.description, 'description', 1000);
        if (s.revision !== undefined && (!Number.isInteger(s.revision) || s.revision < 1)) { fail('Invalid revision.'); }
        if (s.copiedFrom !== undefined) { keys(s.copiedFrom, ['id', 'revision']); str(s.copiedFrom.id, 'original ID'); if (!Number.isInteger(s.copiedFrom.revision)) { fail('Invalid original revision.'); } }
        if (!Array.isArray(s.accepts) || !s.accepts.length || s.accepts.length > 20) { fail('Specify accepted identifiers.'); }
        s.accepts.forEach(function (r) { keys(r, ['kind', 'symbologies']); if (!['gtin', 'uri'].includes(r.kind)) { fail('This version supports gtin and uri identifiers.'); } if (r.symbologies && (!Array.isArray(r.symbologies) || !r.symbologies.length || r.symbologies.some(function (v) { return !['ean13','ean8','upca','upce','qr','code128','code39','codabar','itf','itf14','gs1-128'].includes(v); }))) { fail('Invalid symbology restriction.'); } });
        if (s.symbologyMap !== undefined) { if (!object(s.symbologyMap)) { fail('Invalid symbology map.'); } Object.keys(s.symbologyMap).forEach(function (k) { str(s.symbologyMap[k], 'endpoint symbology'); }); }
        if (s.execution === 'local') { if (s.handler !== 'http-url-v1' || s.request || s.response || s.symbologyMap || s.accepts.some(function (r) { return r.kind !== 'uri'; })) { fail('The local handler supports only HTTP(S) URLs.'); } }
        else if (s.execution === 'request') {
            if (s.handler || s.accepts.some(function (r) { return r.kind !== 'gtin'; })) { fail('Request sources currently accept GTINs only.'); }
            var r = s.request;
            if (r && r.transport === 'connector') { keys(r, ['transport','connector']); if (r.connector !== 'open-food-facts') { fail('Unknown connector.'); } }
            else {
                keys(r, ['transport','origin','path','query']); if (r.transport !== 'json-get') { fail('Use json-get or the Open Food Facts connector.'); }
                var u = new URL(safeUrl(r.origin, true)); if (u.origin !== r.origin) { fail('Origin must contain only HTTPS scheme and host.'); }
                str(r.path, 'path', 1000); if (!r.path.startsWith('/') || r.path.startsWith('//') || /[?#\\]/.test(r.path) || /\{(?!identifier.value\})/.test(r.path)) { fail('Invalid path template. Only {identifier.value} is supported.'); }
                if (r.query) { if (!object(r.query) || Object.keys(r.query).length > 30) { fail('Invalid query bindings.'); } Object.keys(r.query).forEach(function (k) { var v = r.query[k]; if (!['identifier.value','identifier.kind','symbology.endpoint'].includes(v)) { keys(v, ['literal']); str(v.literal, 'literal query value', 1000); } }); }
            }
            var a = s.response; keys(a, ['adapter','found','notFound','title','fields']); if (a.adapter !== 'json-fields-v1') { fail('Unknown response adapter.'); }
            [a.found,a.notFound].forEach(function (p) { keys(p, ['pointer','equals']); pointer(p.pointer); if (!['string','boolean','number'].includes(typeof p.equals)) { fail('Predicates require a scalar equals value.'); } });
            pointer(a.title); if (!Array.isArray(a.fields) || a.fields.length > 30) { fail('Invalid response fields.'); } a.fields.forEach(function (f) { keys(f, ['label','pointer']); str(f.label, 'field label'); pointer(f.pointer); });
            keys(s.attribution, ['name','url','text']); str(s.attribution.name, 'attribution'); safeUrl(s.attribution.url, true); str(s.attribution.text, 'attribution text', 2000);
        } else { fail('Unknown execution kind.'); }
        return s;
    }
    function file(data) {
        keys(data, ['format','version','sources']); if (data.format !== 'pc-barcode-lookup-sources' || data.version !== 1 || !Array.isArray(data.sources) || data.sources.length > 50) { fail('Expected a version 1 lookup-source file with at most 50 sources.'); }
        var ids = new Set(); data.sources.forEach(function (s) { validate(s, true); if (ids.has(s.id)) { fail('Duplicate source ID.'); } ids.add(s.id); }); return data.sources;
    }
    function identify(c, B) {
        if (!c) { return { reason: 'Scan or enter a barcode first.' }; }
        if (c.isValid === false) { return { reason: 'The decoder reported an invalid barcode.' }; }
        var sym = formats[c.format] || c.format || '', raw = c.text, value = raw;
        if (/^https?:\/\//i.test(raw)) { try { return { kind: 'uri', value: safeUrl(raw), symbology: sym, note: 'Opening this link sends a request to its destination.' }; } catch (e) { return { reason: e.message }; } }
        if (!sym) { return { reason: 'Select an EAN or UPC input format in Type or paste before product lookup.' }; }
        var length = { ean13: 13, ean8: 8, upca: 12, upce: 8 }[sym];
        if (!length) { return { reason: 'Lookup currently supports EAN/UPC products and HTTP(S) URLs.' }; }
        if (!new RegExp('^[0-9]{' + length + '}$').test(raw)) { return { reason: 'A complete barcode including its check digit is required.' }; }
        var encoded = B.encode(sym, raw); if (!encoded.ok) { return { reason: encoded.error }; }
        if (sym === 'upce') { value = encoded.expanded; }
        var ean = value.length === 12 ? '0' + value : value;
        // GS1 General Specifications: RCN prefixes 02, 04, 20-29; EAN-8 RCN prefix 0 or 2.
        if ((ean.length === 13 && /^(02|04|2)/.test(ean)) || (ean.length === 8 && /^[02]/.test(ean))) { return { reason: 'This is a restricted-circulation code. Use Decode with the retailer layout.' }; }
        return { kind: 'gtin', value: value, symbology: sym, note: sym === 'upce' ? 'UPC-E expanded to UPC-A for lookup. The original capture is unchanged.' : '' };
    }
    function eligible(s, id) { if (s.request && s.request.connector === 'open-food-facts' && /^(978|979|977|98|99)/.test(id.value || '')) { return false; } return !!id.kind && s.accepts.some(function (r) { return r.kind === id.kind && (!r.symbologies || r.symbologies.includes(id.symbology)); }); }
    function request(s, id) {
        validate(s); if (!eligible(s, id) || s.execution !== 'request') { fail('The source does not accept this identifier.'); }
        var r = s.request;
        if (r.transport === 'connector') {
            var base = connector(r.connector);
            if (!base) { fail('This site offers no ' + s.name + ' lookup.'); }
            return base + encodeURIComponent(id.value);
        }
        var u = new URL(r.path.replaceAll('{identifier.value}', encodeURIComponent(id.value)), r.origin);
        if (u.origin !== r.origin) { fail('Request origin changed.'); }
        Object.keys(r.query || {}).forEach(function (k) { var v = r.query[k], resolved = object(v) ? v.literal : v === 'identifier.value' ? id.value : v === 'identifier.kind' ? id.kind : (s.symbologyMap || {})[id.symbology]; if (resolved === undefined) { fail('This source needs an endpoint mapping for ' + id.symbology + '.'); } u.searchParams.set(k, resolved); }); return u.href;
    }
    function interpret(s, data) {
        var a = s.response, found = read(data,a.found.pointer) === a.found.equals, missing = read(data,a.notFound.pointer) === a.notFound.equals;
        if (found === missing) { fail('The response does not match the source definition.'); } if (missing) { return { found: false }; }
        var title = read(data,a.title); if (typeof title !== 'string' || !title.trim()) { fail('The response has no product name.'); }
        return { found: true, title: title, fields: a.fields.map(function (f) { var v = read(data,f.pointer); if (v == null || v === '') { return null; } if (!['string','number','boolean'].includes(typeof v)) { fail('A response field is not a scalar value.'); } return { label:f.label,value:String(v) }; }).filter(Boolean) };
    }
    async function execute(s, id, signal) {
        var response = await fetch(request(s,id), { signal:signal, credentials:'omit', redirect:'error', referrerPolicy:'no-referrer', cache:'no-store', headers:{ Accept:'application/json' } });
        if (response.status === 429) { var retry = response.headers.get('Retry-After'), seconds = /^\d+$/.test(retry || '') ? Number(retry) : Math.ceil((Date.parse(retry) - Date.now()) / 1000); var e = new Error('The source is rate limited. Try again later.'); e.retrySeconds = Number.isFinite(seconds) ? Math.max(1,seconds) : 60; throw e; }
        if (!response.ok) { fail('Lookup unavailable (HTTP ' + response.status + ').'); }
        if (!/\bjson\b/i.test(response.headers.get('Content-Type') || '')) { fail('The source did not return JSON.'); }
        var reader = response.body.getReader(), chunks = [], size = 0;
        try { while (true) { var part = await reader.read(); if (part.done) { break; } size += part.value.length; if (size > 2 * 1024 * 1024) { fail('The response exceeds 2 MiB.'); } chunks.push(part.value); } } catch (e) { await reader.cancel(); throw e; } finally { reader.releaseLock(); }
        var bytes = new Uint8Array(size), pos = 0; chunks.forEach(function (chunk) { bytes.set(chunk,pos); pos += chunk.length; });
        return interpret(s, JSON.parse(new TextDecoder().decode(bytes)));
    }
    defaults.forEach(function (s) { validate(s); });
    global.barcodeLookup = { defaults:defaults, available:available, validate:validate, file:file, identify:identify, eligible:eligible, request:request, interpret:interpret, execute:execute, safeUrl:safeUrl };
})(typeof window === 'undefined' ? globalThis : window);

/* Lookup and source management share the scanner's addressable applet state. */
(function () {
    'use strict';
    window.barcodeLookupUI = function (root, opts) {
        var L = window.barcodeLookup, view = 'decode', source = '', edit = '', users = [], loadError = '', outcome = null,
            controller, revision = 0, deadline, cooldowns = new Map(), destroyed = false;
        var storageKey = 'pc-barcode-lookup-sources';
        var panel = document.createElement('div'); panel.className = 'bs-lookup'; panel.dataset.role = 'lookup';
        root.querySelector('[data-role="reading"]').appendChild(panel);
        var modes = document.createElement('div'); modes.className = 'seg'; modes.setAttribute('role','group'); modes.setAttribute('aria-label','Scanner mode');
        modes.innerHTML = '<button type="button" data-view="decode">Decode</button><button type="button" data-view="lookup">Lookup</button>';
        root.querySelector('.bs-layout').prepend(modes);
        var layoutLabel = root.querySelector('.bs-layout .form-label'); layoutLabel.classList.add('bs-sr-only');
        /* A random UUID. crypto.randomUUID exists only in a secure
           context; getRandomValues exists everywhere. */
        function uuid() {
            if (crypto.randomUUID) { return crypto.randomUUID(); }
            var b = crypto.getRandomValues(new Uint8Array(16)); b[6] = b[6] & 15 | 64; b[8] = b[8] & 63 | 128;
            var h = Array.from(b, function (x) { return x.toString(16).padStart(2, '0'); }).join('');
            return h.slice(0, 8) + '-' + h.slice(8, 12) + '-' + h.slice(12, 16) + '-' + h.slice(16, 20) + '-' + h.slice(20);
        }
        function esc(v) { return String(v == null ? '' : v).replace(/[&<>"']/g, function (c) { return {'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]; }); }
        function all() { return L.defaults.filter(L.available).concat(users); }
        function guide() { return ((window.pudlHost && window.pudlHost.pages) || '/page/') + 'barcode-lookup-guide'; }
        function selected() { return all().find(function (s) { return s.id === source; }); }
        function identity() { return L.identify(opts.capture(), opts.engine); }
        function load() { try { var raw = localStorage.getItem(storageKey); users = raw ? L.file(JSON.parse(raw)) : []; loadError = ''; } catch (e) { users = []; loadError = 'Saved sources could not be read: ' + e.message; } }
        function invalidate() { revision++; if (controller) { controller.abort(); controller = null; } clearTimeout(deadline); outcome = null; }
        function state() { var p = new URLSearchParams(); if (view !== 'decode') { p.set('view',view); } if (source) { p.set('source',source); } if (edit) { p.set('edit',edit); } return p.toString(); }
        function navigate(next, nextEdit) { invalidate(); opts.stop(); view = next; edit = nextEdit || ''; render(); root.querySelector('[data-role=reading]').scrollTop = 0; opts.changed(); }
        function setState(s) { invalidate(); var p = new URLSearchParams(s); view = ['lookup','sources'].includes(p.get('view')) ? p.get('view') : 'decode'; source = p.get('source') || ''; edit = p.get('edit') || ''; load(); render(); }
        function notice(s, bad) { return '<p class="notice ' + (bad ? 'danger' : '') + '">' + esc(s) + '</p>'; }
        function render() {
            if (destroyed) { return; }
            modes.querySelectorAll('button').forEach(function (b) { b.setAttribute('aria-pressed',String(b.dataset.view === view)); });
            root.querySelector('[data-role="results"]').hidden = view !== 'decode'; panel.hidden = view === 'decode';
            root.querySelector('[data-role="layout"]').hidden = view !== 'decode';
            root.classList.toggle('bs-lookup-mode', view !== 'decode');
            if (view === 'decode') { return; }
            if (view === 'sources') { renderSources(); return; }
            var id = identity(), options = all().filter(function (s) { return L.eligible(s,id); });
            if (!source && options.length === 1) { source = options[0].id; }
            var s = selected(), compatible = s && L.eligible(s,id);
            var html = '<div class="bs-result-head"><span class="chip">' + esc(id.kind === 'uri' ? 'URL' : 'Product lookup') + '</span>' +
                (opts.capture() ? '<h2 class="bs-value">' + esc(opts.capture().text) + '</h2>' : '') + '</div>';
                    if (compatible && outcome) {
                        if (outcome.message) { html += notice(outcome.message,!!outcome.error); }
                        else if (!outcome.found) { html += notice('Not found in '+s.name+'. The barcode may still be valid.',false); }
                        else { html += '<h3>'+esc(outcome.title)+'</h3><table class="kv-table bs-fields"><tbody>'+outcome.fields.map(function (f) { return '<tr><th scope="row">'+esc(f.label)+'</th><td>'+esc(f.value)+'</td></tr>'; }).join('')+'</tbody></table>'; }
                        if (outcome.fetched) { html += '<p class="form-help">Retrieved '+esc(new Date(outcome.fetched).toLocaleString())+'.</p>'; }
                    }
            if (loadError) { html += notice(loadError,true); }
            if (!id.kind) { html += notice(id.reason,false); }
            else {
                html += '<label class="form-label" for="' + root.dataset.lookupId + '">Source</label><span class="form-select-wrap"><select class="form-select" id="' + root.dataset.lookupId + '" data-lookup="source"><option value="">Choose a source</option>' + options.map(function (s) { return '<option value="'+esc(s.id)+'"'+(s.id === source ? ' selected' : '')+'>'+esc(s.name)+'</option>'; }).join('') + '</select></span>';
                if (source && !compatible) { html += notice('The selected source is unavailable for this barcode. Choose a compatible source.',false); }
                if (!options.length) { html += notice('No source accepts this identifier.',false); }
                if (id.note) { html += '<p class="form-help">'+esc(id.note)+'</p>'; }
                if (compatible) {
                    html += '<p class="form-help">'+esc(s.description)+'</p>';
                    if (s.execution === 'local') {
                        html += '<p>Destination: <strong>'+esc(new URL(id.value).host)+'</strong></p><p><a href="'+esc(L.safeUrl(id.value))+'" target="_blank" rel="noopener noreferrer">Open URL</a></p>';
                    } else {
                        try {
                            var url = L.request(s,id), target = s.request.transport === 'connector' ? s.name + ' through this site' : new URL(url).host;
                            html += '<p class="form-help">Send <code>'+esc(id.value)+'</code> to '+esc(target)+'.</p><button type="button" class="btn" data-lookup="run"'+(controller ? ' disabled' : '')+'>Look up</button>';
                        } catch (e) { html += notice(e.message,true); }
                    }
                    if (s.attribution) { html += '<p class="form-help"><a href="'+esc(s.attribution.url)+'" target="_blank" rel="noopener noreferrer">'+esc(s.attribution.name)+'</a>. '+esc(s.attribution.text)+'</p>'; }
                }
            }
            html += '<p><button type="button" class="btn" data-lookup="manage">Manage sources</button></p>';
            panel.innerHTML = html;
        }
        function renderSources() {
            var s = selected() || all()[0], editing = edit === s.id && s.id.startsWith('user:');
            panel.innerHTML = '<h2>Lookup sources</h2><p class="form-help">Copy a default to customize it. Definitions are JSON. <a href="'+esc(guide())+'" target="_blank" rel="noopener">Read the source-format guide</a> for fields and an example.</p>'+ (loadError ? notice(loadError,true) : '') +
                '<label class="form-label" for="'+root.dataset.lookupId+'">Source definition</label><span class="form-select-wrap"><select class="form-select" id="'+root.dataset.lookupId+'" data-lookup="definition">'+all().map(function (x) { return '<option value="'+esc(x.id)+'"'+(x.id === s.id ? ' selected' : '')+'>'+esc(x.name)+'</option>'; }).join('')+'</select></span>'+
                '<div class="bs-source-actions"><button class="btn" type="button" data-lookup="clone">Copy as new source</button><button class="btn" type="button" data-lookup="export">Export</button>'+(s.id.startsWith('user:') ? '<button class="btn" type="button" data-lookup="edit">Edit</button><button class="btn btn-danger" type="button" data-lookup="delete">Delete</button>' : '')+'</div>'+
                '<label class="form-label" for="'+root.dataset.lookupId+'-json">'+(editing ? 'Edit source JSON' : 'Source JSON')+'</label><textarea class="form-input" id="'+root.dataset.lookupId+'-json" data-lookup="json" rows="12" spellcheck="false"'+(editing?'':' readonly')+'>'+esc(JSON.stringify(s,null,2))+'</textarea>'+
                (editing ? '<button class="btn" type="button" data-lookup="save">Save source</button>' : '')+
                '<p class="form-help">Imports use a version 1 pc-barcode-lookup-sources file. Duplicate IDs are rejected; edit an existing source to replace it.</p><label class="form-label">Import source file<input class="form-input" type="file" accept=".json,application/json" data-lookup="import"></label><p data-lookup="feedback" role="status"></p><button class="btn" type="button" data-lookup="back">Back to lookup</button>';
        }
        function persist(next) { var data = {format:'pc-barcode-lookup-sources',version:1,sources:next}; L.file(data); localStorage.setItem(storageKey,JSON.stringify(data)); users=next; loadError=''; window.dispatchEvent(new CustomEvent('barcode-lookup-sources')); }
        function feedback(e) { var p = panel.querySelector('[data-lookup="feedback"]'); if (p) { p.className='notice danger'; p.textContent=e.message; } }
        async function run() {
            if (controller) { return; }
            var s=selected(), id=identity(); if (!s || !L.eligible(s,id)) { return; }
            var key=s.request.transport === 'connector' ? 'open-food-facts' : s.request.origin;
            if ((cooldowns.get(key)||0)>Date.now()) { outcome={error:true,message:'Please wait '+Math.ceil((cooldowns.get(key)-Date.now())/1000)+' seconds before retrying.'};render();return; }
            invalidate(); var token=revision, abort=new AbortController(), timedOut=false; controller=abort;
            outcome={message:'Looking up...'};render();deadline=setTimeout(function(){timedOut=true;abort.abort();},15000);
            try { var result=await L.execute(s,id,abort.signal); if (!destroyed && token===revision) { outcome=Object.assign(result,{fetched:Date.now()}); } }
            catch(e) { if (!destroyed && token===revision) { if(e.retrySeconds){cooldowns.set(key,Date.now()+e.retrySeconds*1000);} outcome={error:true,message:timedOut?'Lookup timed out. Try again.':e instanceof TypeError?'The source could not be reached or does not permit browser access.':e.message}; } }
            finally { if (!destroyed && token===revision) { clearTimeout(deadline);controller=null;render();root.querySelector('[data-role=reading]').scrollTop=0; } }
        }
        async function click(e) {
            var b=e.target.closest('[data-lookup]');if(!b||b.tagName!=='BUTTON'){return;}
            var s=selected()||all()[0];
            try { switch(b.dataset.lookup){
                case 'run':run();break;
                case 'manage':source=s.id;navigate('sources');break;
                case 'back':navigate('lookup');break;
                case 'clone':var copy=JSON.parse(JSON.stringify(s));copy.id='user:'+uuid();copy.name=s.name+' copy';copy.copiedFrom={id:s.id,revision:s.revision||1};persist(users.concat([copy]));source=copy.id;navigate('sources',copy.id);break;
                case 'edit':source=s.id;navigate('sources',s.id);break;
                case 'save':var updated=JSON.parse(panel.querySelector('[data-lookup="json"]').value);L.validate(updated,true);if(updated.id!==edit){throw new Error('Keep this source ID. Use Copy as new source for a new ID.');}persist(users.map(function(x){return x.id===edit?updated:x;}));navigate('sources');break;
                case 'delete':if(confirm('Delete '+s.name+' from this browser?')){persist(users.filter(function(x){return x.id!==s.id;}));source='';navigate('sources');}break;
                case 'export':var exported=JSON.parse(JSON.stringify(s));if(exported.id.startsWith('builtin:')){exported.copiedFrom={id:s.id,revision:s.revision||1};exported.id='user:'+s.id.slice(8);}var blob=new Blob([JSON.stringify({format:'pc-barcode-lookup-sources',version:1,sources:[exported]},null,2)],{type:'application/json'}),url=URL.createObjectURL(blob),a=document.createElement('a');a.href=url;a.download='barcode-lookup-sources.json';a.click();setTimeout(function(){URL.revokeObjectURL(url);},1000);break;
            }}catch(err){feedback(err);}
        }
        async function change(e){try{switch(e.target.dataset.lookup){
            case 'source':invalidate();source=e.target.value;render();opts.changed();break;
            case 'definition':source=e.target.value;navigate('sources');break;
            case 'import':var f=e.target.files[0];if(!f){return;}if(f.size>128*1024){throw new Error('Source files must be smaller than 128 KiB.');}var added=L.file(JSON.parse(await f.text()));if(destroyed){return;}load();if(added.some(function(s){return users.some(function(u){return s.id===u.id;});})){throw new Error('An imported ID already exists. No sources were changed.');}persist(users.concat(added));navigate('sources');break;
        }}catch(err){feedback(err);}}
        function modeClick(e){var b=e.target.closest('[data-view]');if(b){navigate(b.dataset.view);}}
        function storage(e){if(e.type==='storage'&&e.key!==storageKey){return;}invalidate();load();render();}
        root.dataset.lookupId='lookup-'+uuid();load();panel.addEventListener('click',click);panel.addEventListener('change',change);modes.addEventListener('click',modeClick);window.addEventListener('storage',storage);window.addEventListener('barcode-lookup-sources',storage);
        return {render:render,state:state,setState:setState,invalidate:invalidate,manage:function(){navigate('sources');},destroy:function(){destroyed=true;invalidate();window.removeEventListener('storage',storage);window.removeEventListener('barcode-lookup-sources',storage);panel.removeEventListener('click',click);panel.removeEventListener('change',change);modes.removeEventListener('click',modeClick);}};
    };
})();

/* Camera, image and text input for the shared retail barcode layouts. The
   engine, the reader's layout library, the scanner's interpretation and
   the lookup are bundled in front of this script when the collection is
   packed; the decoder, which is large, loads from vendor beside it the
   first time it is needed. */
(function () {
    'use strict';
    var src = document.currentScript.src, decoderReady, serial = 0;
    function host() { return window.pudlHost || {}; }
    function script(url) {
        return new Promise(function (resolve, reject) {
            var s = document.createElement('script'); s.src = url;
            s.onload = resolve; s.onerror = function () { s.remove(); reject(new Error('A scanner component could not load. Reload the page to retry.')); };
            document.head.appendChild(s);
        });
    }
    function decoder() {
        if (!decoderReady) {
            var base = new URL('vendor/zxing-wasm-3.1.4/', src);
            decoderReady = (window.ZXingWASM ? Promise.resolve() : script(new URL('zxing-reader.js', base).href))
                .then(function () {
                    return window.ZXingWASM.prepareZXingModule({ overrides: {
                        locateFile: function (name) { return new URL(name, base).href; }
                    }, fireImmediately: true });
                }).then(function () { return window.ZXingWASM; })
                .catch(function (e) { decoderReady = null; throw e; });
        }
        return decoderReady;
    }
    function esc(s) { return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]; }); }

    pudlApplets.register('barcode-scanner', { init: function (root, opts) {
        var destroyed = false, cleanup = function () {}, pendingState = opts.state || '', instance = {};
        build();
        function build() {
            var B = window.barcodeEngine, C = window.barcodeScannerCore, Lib = window.barcodeLibrary, id = 'scanner-' + (++serial),
                stream = null, timer, generation = 0, capture = null, library = [], layout = '', format = '', cameraOn = false;
            root.classList.add('barcode-scanner');
            root.innerHTML = `
                <div class="bs-toolbar">
                    <button class="btn btn-primary" type="button" data-action="camera" aria-pressed="false" title="Start camera">Camera</button>
                    <div class="menu">
                        <button class="btn menu-btn" type="button" popovertarget="${id}-actions">Actions</button>
                        <nav class="menu-panel" id="${id}-actions" data-role="actions" popover aria-label="Scanner actions">
                            <button class="menu-action" type="button" data-action="image"><span class="glyph" style="--glyph: var(--glyph-file)" aria-hidden="true"></span>Open image</button>
                            <button class="menu-action" type="button" data-action="type"><span class="glyph" style="--glyph: var(--glyph-file)" aria-hidden="true"></span>Type or paste</button>
                            <button class="menu-action" type="button" data-action="import"><span class="glyph" style="--glyph: var(--glyph-folder)" aria-hidden="true"></span>Import layouts</button>
                            <hr class="menu-sep">
                            <button class="menu-action" type="button" data-action="copy" disabled><span class="glyph" style="--glyph: var(--glyph-copy)" aria-hidden="true"></span>Copy result</button>
                            <button class="menu-action" type="button" data-action="details" disabled><span class="glyph" style="--glyph: var(--glyph-info)" aria-hidden="true"></span>Scan details</button>
                            <button class="menu-action" type="button" data-action="clear"><span class="glyph" style="--glyph: var(--glyph-close)" aria-hidden="true"></span>Clear</button>
                            <hr class="menu-sep">
                            <button class="menu-action" type="button" data-action="sources"><span class="glyph" style="--glyph: var(--glyph-folder)" aria-hidden="true"></span>Lookup sources</button>
                            <button class="menu-action" type="button" data-action="install"><span class="glyph" style="--glyph: var(--glyph-info)" aria-hidden="true"></span>Install scanner</button>
                        </nav>
                    </div>
                </div>
                <div class="bs-layout">
                    <label class="form-label" for="${id}-layout">Layout</label>
                    <span class="form-select-wrap"><select class="form-select" id="${id}-layout" data-role="layout"></select></span>
                </div>
                <div class="bs-stage" data-role="stage">
                    <div class="bs-reading" data-role="reading">
                        <div data-role="symbols" hidden></div>
                        <div data-role="results" tabindex="-1" aria-live="polite"></div>
                    </div>
                    <div class="bs-camera" data-role="camera-layer" hidden>
                        <video data-role="video" muted playsinline aria-label="Camera preview"></video>
                        <p class="bs-camera-hint">Hold the barcode in view</p>
                    </div>
                </div>
                <p class="bs-status" data-role="status" role="status">Ready to scan</p>
                <input type="file" accept="image/*" data-role="image-file" hidden>
                <input type="file" accept="application/json,.json" data-role="layout-file" hidden>
                <dialog class="dialog" data-role="input-dialog" aria-labelledby="${id}-input-title">
                    <h2 class="dialog-title" id="${id}-input-title">Enter a barcode</h2>
                    <form data-role="text-form">
                        <div class="dialog-body"><div class="form-group">
                        <label class="form-label" for="${id}-text">Scanned or pasted value</label>
                        <textarea class="form-textarea" id="${id}-text" data-role="text" rows="3" spellcheck="false" autocomplete="off"></textarea></div><div class="form-group">
                        <label class="form-label" for="${id}-format">Input format</label>
                        <span class="form-select-wrap"><select class="form-select" id="${id}-format" data-role="format"><option value="">Unknown / try all</option>
                        ${Object.keys(B.symbologies).map(function (key) { return '<option value="' + esc(key) + '">' + esc(B.symbologies[key].name || key) + '</option>'; }).join('')}</select></span>
                        </div>
                        <p class="form-help">Enter decodes; Shift+Enter inserts a line break. You can also use a keyboard scanner.</p>
                        </div>
                        <div class="dialog-actions"><button class="btn" type="button" data-action="close-input">Cancel</button><button class="btn btn-primary" type="submit">Decode value</button></div>
                    </form>
                </dialog>
                <dialog class="dialog" data-role="details-dialog" aria-labelledby="${id}-details-title">
                    <h2 class="dialog-title" id="${id}-details-title">Scan details</h2>
                    <div class="dialog-body" data-role="details"></div>
                    <div class="dialog-actions"><button class="btn" type="button" data-action="close-details">Close</button></div>
                </dialog>
                <dialog class="dialog" data-role="install-dialog" aria-labelledby="${id}-install-title">
                    <h2 class="dialog-title" id="${id}-install-title">Install scanner</h2>
                    <div class="dialog-body">
                    <p><a href="${esc((host().pages || '/page/') + 'barcode-scanner?frame')}" target="_blank" rel="noopener">Open the standalone scanner</a> in your browser, then install it from there.</p>
                    <ul>
                        <li>On iPhone or iPad, use Share, then Add to Home Screen.</li>
                        <li>On Android, use the browser menu's Install app or Add to Home screen option.</li>
                        <li>On desktop Chrome or Edge, use the address bar's install icon or the browser's app installation menu.</li>
                        <li>On Safari for Mac, use File, then Add to Dock.</li>
                    </ul>
                    <p class="form-help">Installation adds a Scanner icon that opens this app on its own. An internet connection is still needed to load the scanner.</p>
                    </div>
                    <div class="dialog-actions"><button class="btn" type="button" data-action="close-install">Close</button></div>
                </dialog>
                <dialog class="dialog" data-role="copy-fallback" aria-labelledby="${id}-export-title">
                    <h2 class="dialog-title" id="${id}-export-title">Copy result</h2>
                    <div class="dialog-body"><div class="form-group">
                    <label class="form-label" for="${id}-export">Select and copy this result</label>
                    <textarea class="form-textarea" id="${id}-export" readonly rows="6"></textarea>
                    </div></div>
                    <div class="dialog-actions"><button class="btn" type="button" data-action="close-copy">Close</button></div>
                </dialog>`;
            function q(role) { return root.querySelector('[data-role="' + role + '"]'); }
            function button(action) { return root.querySelector('[data-action="' + action + '"]'); }
            var video = q('video'), lookup;
            function status(message, error) {
                if (destroyed) { return; }
                q('status').textContent = message;
                q('status').classList.toggle('notice', !!error);
                q('status').classList.toggle('danger', !!error);
            }
            function state() { var p = new URLSearchParams(lookup ? lookup.state() : ''); if (layout) { p.set('layout', layout); } if (format) { p.set('format', format); } return p.toString(); }
            function commit() { if (opts.changed) { opts.changed(state()); } }
            function refresh() { if (window.pudlMenubar) { window.pudlMenubar.refresh(); } }
            /* The reader's layouts, which the Barcode Tool keeps; until they
               have loaded, the demonstrations alone. */
            /* version counts the imports begun and saving the ones not yet done, as the settings' reload does (config.js, watch). A read
               of the library that began before an import, or while one ran, would bring back the library the import replaced, so it
               counts only if no import began while it ran, and a change that comes while one runs is read when the import is done. */
            var libraryVersion = 0, librarySaving = 0, libraryReread = false;
            function readLibrary() {
                if (librarySaving) { libraryReread = true; return Promise.resolve(); }
                var version = libraryVersion;
                return Lib.load(B).then(function (got) {
                    if (destroyed || librarySaving || version !== libraryVersion) { return; }
                    library = got.layouts;
                    if (got.error) { status(got.error, true); }
                    fillLayouts(); render();
                });
            }
            function fillLayouts() {
                q('layout').innerHTML = '<option value="">Automatic: try all layouts</option>' + B.demos.concat(library).map(function (L) {
                    return '<option value="' + esc(L.id) + '">' + esc(L.name) + '</option>';
                }).join('');
                if (layout && !B.demos.concat(library).some(function (L) { return L.id === layout; })) {
                    var o = document.createElement('option'); o.value = layout; o.textContent = 'Missing layout: ' + layout; q('layout').appendChild(o);
                }
                q('layout').value = layout;
            }
            function render() {
                if (lookup) { lookup.render(); }
                button('copy').disabled = !capture; button('details').disabled = !capture;
                if (!capture) {
                    q('results').innerHTML = '<div class="bs-empty"><h2>Ready for a barcode</h2><p>Turn on the camera, or use Actions to open an image or enter a value.</p><p class="form-help">Images stay in this browser. Lookup sends a value only when you ask.</p></div>';
                    q('details').textContent = ''; return;
                }
                var result = C.inspect(capture, B.demos.concat(library), layout, B);
                var html = '<header class="bs-result-head"><span class="chip">' + esc(capture.format || result.symbology || 'Typed value') + '</span>' +
                    '<h2 class="bs-value">' + esc(C.visible(capture.text)) + '</h2></header>';
                result.issues.forEach(function (s) { html += '<p class="notice warn">' + esc(s) + '</p>'; });
                result.matches.forEach(function (m) {
                    html += '<section class="bs-match"><div class="bs-match-head"><h3>' + esc(m.layout.name) + '</h3><span class="badge ' +
                        (m.issues.length ? 'danger' : 'positive') + '">' + (m.issues.length ? 'Check failed' : 'Valid') + '</span></div>';
                    m.issues.forEach(function (s) { html += '<p class="notice danger">' + esc(s) + '</p>'; });
                    html += '<table class="kv-table bs-fields"><caption class="bs-sr-only">Decoded fields</caption><thead><tr><th>Field</th><th>Value</th></tr></thead><tbody>';
                    m.layout.fields.forEach(function (f) {
                        var value = m.composed.fields[f.id], raw = C.visible(m.values[f.id]), display = value.error || value.meaning || value.display;
                        html += '<tr><th scope="row">' + esc(f.name) + '</th><td><span>' + esc(display) + '</span>' +
                            (String(display) !== raw ? '<small>' + esc(raw) + '</small>' : '') + '</td></tr>';
                    });
                    html += '</tbody></table>';
                    if (m.normalization) { html += '<p class="form-help">' + esc(m.normalization) + '</p>'; }
                    html += '</section>';
                });
                q('results').innerHTML = html;
                q('details').innerHTML = '<table class="kv-table"><tbody>' +
                    '<tr><th>Source</th><td>' + esc(capture.source) + '</td></tr>' +
                    '<tr><th>Format</th><td>' + esc(capture.format || 'Not detected (typed input)') + '</td></tr>' +
                    '<tr><th>AIM identifier</th><td>' + esc(result.aim || 'Not supplied') + '</td></tr>' +
                    '<tr><th>Raw value</th><td><code>' + esc(C.visible(capture.text)) + '</code></td></tr>' +
                    (capture.bytes ? '<tr><th>Bytes (hex)</th><td><code>' + capture.bytes.map(function (n) { return n.toString(16).padStart(2, '0'); }).join(' ') + '</code></td></tr>' : '') +
                    '</tbody></table><p class="form-help">Images stay in this browser. Lookup sends a value only when you ask. Copy result includes the raw capture and layout identifier.</p>';
            }
            function fit() {
                if (destroyed) { return; }
                var viewport = window.visualViewport, bottom = viewport ? viewport.offsetTop + viewport.height : window.innerHeight;
                var host = root.closest('.win-body');
                var contentWindow = root.closest('.win[data-win-size="content"]');
                if (contentWindow) {
                    // The content sizes this window. Its current bottom cannot also
                    // constrain the content, or the window can never grow again.
                    var layer = contentWindow.closest('[data-win-layer]');
                    if (layer && getComputedStyle(layer).position !== 'static') {
                        var dockBottom = parseFloat(getComputedStyle(layer).getPropertyValue('--dock-bottom')) || 0;
                        bottom = Math.min(bottom, layer.getBoundingClientRect().bottom - dockBottom);
                    }
                } else if (host) { bottom = Math.min(bottom, host.getBoundingClientRect().bottom); }
                var available = Math.max(160, bottom - root.getBoundingClientRect().top - 12);
                root.style.setProperty('--bs-height', Math.floor(available) + 'px');
            }
            function reveal() { fit(); q('reading').scrollTop = 0; }
            function cameraState(on) {
                root.classList.toggle('is-scanning', on);
                cameraOn = on; button('camera').setAttribute('aria-pressed', String(on));
                button('camera').title = on ? 'Stop camera' : 'Start camera';
                q('camera-layer').hidden = !on; q('reading').hidden = on;
            }
            function typeInput() { stop(); q('input-dialog').showModal(); q('text').focus(); }
            function toggleCamera() { if (cameraOn) { stop(); status('Camera stopped'); } else { start(); } }
            function stop() {
                generation++; clearTimeout(timer);
                if (stream) { stream.getTracks().forEach(function (t) { t.stop(); }); stream = null; }
                video.pause(); video.srcObject = null; cameraState(false);
            }
            function accept(result, source) {
                lookup.invalidate();
                if (q('copy-fallback').open) { q('copy-fallback').close(); }
                q('copy-fallback').querySelector('textarea').value = '';
                capture = { source: source, text: result.text, format: result.format || '',
                    bytes: result.bytes ? Array.from(result.bytes) : null,
                    contentType: result.contentType || '', symbologyIdentifier: result.symbologyIdentifier || '',
                    isValid: result.isValid, error: result.error || '' };
                render(); reveal(); refresh();
            }
            function showResults(results, source) {
                var valid = results.filter(function (r) { return r.isValid; });
                if (!valid.length) { status('No barcode was decoded. Try better light, a closer view or another image.'); return false; }
                accept(valid[0], source);
                if (valid.length > 1) {
                    var label = document.createElement('label'); label.className = 'form-label'; label.textContent = 'Barcode in this image';
                    var select = document.createElement('select'); select.className = 'form-select';
                    valid.forEach(function (r, i) { var option = document.createElement('option'); option.value = i; option.textContent = (i + 1) + '. ' + r.format + ': ' + C.visible(r.text).slice(0, 80); select.appendChild(option); });
                    select.addEventListener('change', function () { accept(valid[Number(select.value)], source); });
                    var wrap = document.createElement('span'); wrap.className = 'form-select-wrap'; wrap.appendChild(select);
                    label.appendChild(wrap); q('symbols').replaceChildren(label); q('symbols').hidden = false; status(valid.length + ' barcodes found');
                } else { q('symbols').hidden = true; status('Captured'); }
                return true;
            }
            async function start() {
                stop(); var token = generation;
                cameraState(true); reveal(); status('Requesting camera...');
                try {
                    if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) { throw new Error('Camera access needs HTTPS and a browser with camera support. You can still open an image or enter a value.'); }
                    var media = await navigator.mediaDevices.getUserMedia({ audio: false, video: { facingMode: { ideal: 'environment' }, width: { ideal: 1920 }, height: { ideal: 1080 } } });
                    if (destroyed || generation !== token) { media.getTracks().forEach(function (t) { t.stop(); }); return; }
                    stream = media; video.srcObject = media; await video.play();
                    var reader = await decoder();
                    if (destroyed || generation !== token) { return; }
                    status('Scanning...');
                    var canvas = document.createElement('canvas'), ctx = canvas.getContext('2d', { willReadFrequently: true });
                    async function frame() {
                        if (destroyed || generation !== token) { return; }
                        try {
                            if (video.readyState >= 2 && video.videoWidth) {
                                var scale = Math.min(1, 1920 / video.videoWidth);
                                canvas.width = Math.round(video.videoWidth * scale); canvas.height = Math.round(video.videoHeight * scale);
                                ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
                                var results = await reader.readBarcodes(ctx.getImageData(0, 0, canvas.width, canvas.height), { textMode: 'Plain', maxNumberOfSymbols: 8 });
                                if (destroyed || generation !== token) { return; }
                                if (results.some(function (r) { return r.isValid; })) { stop(); showResults(results, 'camera'); return; }
                            }
                            timer = setTimeout(frame, 250);
                        } catch (e) { if (!destroyed && generation === token) { stop(); status('Camera decoding failed: ' + e.message, true); } }
                    }
                    frame();
                } catch (e) { if (!destroyed && generation === token) { stop(); status('Camera unavailable: ' + e.message, true); } }
            }
            async function imageFile(file) {
                stop(); var token = generation;
                if (!file) { return; }
                lookup.invalidate(); capture = null; render();
                if (file.size > 20 * 1024 * 1024) { status('Choose an image smaller than 20 MB.'); return; }
                status('Reading image…');
                try {
                    var reader = await decoder();
                    if (destroyed || generation !== token) { return; }
                    var results = await reader.readBarcodes(file, { textMode: 'Plain', maxNumberOfSymbols: 32 });
                    if (!destroyed && generation === token) { showResults(results, 'image'); }
                } catch (e) { if (!destroyed && generation === token) { status('The image could not be decoded: ' + e.message, true); } }
            }
            async function importFile(file) {
                if (!file) { return; }
                libraryVersion++; librarySaving++;
                try {
                    if (file.size > 2 * 1024 * 1024) { throw new Error('Choose a layout file smaller than 2 MB.'); }
                    var imported = B.layouts.validateFile(JSON.parse(await file.text()));
                    if (destroyed) { return; }
                    if (!imported.ok) { throw new Error(imported.errors.join(' ')); }
                    var got = await Lib.load(B);
                    if (got.error) { throw new Error(got.error); }
                    var merged = new Map(got.layouts.map(function (L) { return [L.id, L]; }));
                    imported.layouts.forEach(function (L) { if (!B.demos.some(function (d) { return d.id === L.id; })) { merged.set(L.id, L); } });
                    var err = await Lib.save(B, Array.from(merged.values()));
                    if (err) { throw new Error(err); }
                    if (destroyed) { return; }
                    library = Array.from(merged.values()); fillLayouts(); render();
                    status('Layouts imported into ' + Lib.where() + '. The Barcode Tool uses the same library.');
                } catch (e) { status('Layouts were not imported: ' + e.message, true); }
                finally { librarySaving--; if (!librarySaving && libraryReread && !destroyed) { libraryReread = false; readLibrary(); } }
            }
            async function copy() {
                if (!capture) { return; }
                var json = JSON.stringify({ version: 1, capture: capture, layout: layout || null }, null, 2);
                try { await navigator.clipboard.writeText(json); status('Result copied as JSON.'); }
                catch (e) { if (!destroyed) { q('copy-fallback').showModal(); var text = q('copy-fallback').querySelector('textarea'); text.value = json; text.focus(); text.select(); } }
            }
            function clear() { stop(); lookup.invalidate(); capture = null; q('text').value = ''; q('symbols').hidden = true; if (q('copy-fallback').open) { q('copy-fallback').close(); } q('copy-fallback').querySelector('textarea').value = ''; render(); status('Scan cleared.'); refresh(); }
            function submit(e) { e.preventDefault(); stop(); q('input-dialog').close(); q('symbols').hidden = true; accept({ text: q('text').value, format: format }, 'text'); q('results').focus({ preventScroll: true }); status('Decoded'); }
            function click(e) {
                var target = e.target.closest('[data-action]'); if (!target) { return; }
                if (q('actions').matches(':popover-open')) { q('actions').hidePopover(); }
                var actions = { camera: toggleCamera, type: typeInput, details: function () { q('details-dialog').showModal(); },
                    'close-input': function () { q('input-dialog').close(); }, 'close-details': function () { q('details-dialog').close(); },
                    'close-copy': function () { q('copy-fallback').close(); },
                    sources: function () { lookup.manage(); }, install: function () { stop(); q('install-dialog').showModal(); },
                    'close-install': function () { q('install-dialog').close(); }, image: function () { q('image-file').click(); },
                    import: importLayouts, copy: copy, clear: clear };
                if (actions[target.dataset.action]) { actions[target.dataset.action](); }
            }
            function change(e) {
                if (e.target === q('layout')) { layout = e.target.value; render(); commit(); }
                if (e.target === q('format')) { lookup.invalidate(); format = e.target.value; if (capture && capture.source === 'text') { capture.format = format; render(); } commit(); }
                if (e.target === q('image-file')) { imageFile(e.target.files[0]); e.target.value = ''; }
                if (e.target === q('layout-file')) { importFile(e.target.files[0]); e.target.value = ''; }
            }
            function key(e) { if (e.target === q('text') && e.key === 'Enter' && !e.shiftKey && !e.isComposing) { submit(e); } }
            function hidden() { if (document.hidden || root.closest('.win[hidden]')) { stop(); status('Camera stopped while the scanner was hidden.'); } }
            function setState(s) {
                if (lookup) { lookup.setState(s); }
                var p = new URLSearchParams(s || ''); layout = p.get('layout') || ''; format = p.get('format') || '';
                if (!Object.prototype.hasOwnProperty.call(B.symbologies, format)) { format = ''; }
                fillLayouts(); q('format').value = format;
                if (capture && capture.source === 'text') { capture.format = format; } render();
            }
            /* Import layouts: the host's own dialog where it has one, and
               otherwise a file from the reader's computer. */
            function importLayouts() {
                var f = host().fs;
                if (!f || !f.open) { q('layout-file').click(); return; }
                f.open({ title: 'Import layouts', accept: ['.json'], host: root }).then(function (got) {
                    if (got) { importFile(new File([got.text], got.name, { type: 'application/json' })); }
                }, function (e) { status('Layouts were not imported: ' + (e && e.message || e), true); });
            }
            root.addEventListener('click', click); root.addEventListener('change', change); root.addEventListener('keydown', key);
            q('text-form').addEventListener('submit', submit);
            document.addEventListener('visibilitychange', hidden); document.addEventListener('pudl:windows-change', hidden);
            var stopWatching = Lib.onChange(readLibrary);
            window.addEventListener('pagehide', stop);
            instance.state = state; instance.setState = setState;
            instance.menus = function () { return { titles: [
                { label: 'Barcode Scanner', items: (host().identity || function (r, e) { return e; })(root, [
                    { label: 'Install scanner…', run: function () { q('install-dialog').showModal(); } }
                ]) },
                { id: 'file', label: 'File', items: [
                    { label: 'Open image…', run: function () { q('image-file').click(); } },
                    { label: 'Import layouts…', run: importLayouts }
                ] },
                { id: 'edit', label: 'Edit', items: [
                    { label: 'Copy result', run: copy, disabled: !capture }
                ] },
                { label: 'Scan', items: [
                    { label: 'Camera', run: toggleCamera, checked: cameraOn },
                    { label: 'Type or paste…', run: typeInput },
                    { label: 'Scan details', run: function () { q('details-dialog').showModal(); }, disabled: !capture },
                    { label: 'Lookup sources', run: function () { lookup.manage(); } },
                    '-', { label: 'Clear result', run: clear, disabled: !capture }
                ] }
            ] }; };
            var resize = new ResizeObserver(fit); resize.observe(root.parentElement);
            window.addEventListener('resize', fit);
            if (window.visualViewport) { window.visualViewport.addEventListener('resize', fit); }
            cleanup = function () {
                resize.disconnect(); window.removeEventListener('resize', fit);
                if (window.visualViewport) { window.visualViewport.removeEventListener('resize', fit); }
                root.querySelectorAll('dialog[open]').forEach(function (d) { d.close(); });
                if (q('actions').matches(':popover-open')) { q('actions').hidePopover(); }
                lookup.destroy(); stop(); root.removeEventListener('click', click); root.removeEventListener('change', change); root.removeEventListener('keydown', key);
                q('text-form').removeEventListener('submit', submit); document.removeEventListener('visibilitychange', hidden);
                document.removeEventListener('pudl:windows-change', hidden); stopWatching();
                window.removeEventListener('pagehide', stop);
            };
            lookup = window.barcodeLookupUI(root, { capture: function () { return capture; }, engine: B, changed: commit, stop: stop });
            setState(pendingState); fit(); refresh(); readLibrary();
        }
        return { state: function () { return instance.state ? instance.state() : pendingState; },
            setState: function (s) { pendingState = s; if (instance.setState) { instance.setState(s); } },
            menus: function () { return instance.menus ? instance.menus() : null; },
            destroy: function () { destroyed = true; cleanup(); } };
    } });
})();
