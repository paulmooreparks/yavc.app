/* Copyright 2026 Paul Parks. SPDX-License-Identifier: Apache-2.0 */
/* Shared document CSS compiler. Hosts assign a scope and own installation. */
(function () {
    'use strict';
    var LIMIT = 256 * 1024;
    var TOKENS = /^--doc-(font|font-heading|size|leading|ink|muted|accent|rule|page)$/;
    // This first compiler admits typography and layout without resource loads.
    // Containment, positioning and animation remain under host control.
    var PAINT = /^(color|background-color|font-(style|weight|size|family|variant)|text-(align|decoration(-[a-z]+)?|transform|indent)|letter-spacing|word-spacing|line-height|vertical-align|white-space|(max-|min-)?(width|height)|margin(-[a-z]+)?|padding(-[a-z]+)?|border(-(top|right|bottom|left))?(-(color|style|width|radius))?|border-radius|list-style-type|display|opacity|columns?(-[a-z]+)*|gap|aspect-ratio|object-fit|float|clear|break-(before|after|inside))$/;
    function compile(key, css) {
        var problems = [], classes = new Set();
        function problem(message) { if (problems.indexOf(message) < 0) { problems.push(message); } }
        css = String(css == null ? '' : css);
        if (!/^[a-z][a-z0-9-]{0,63}$/.test(key)) { throw new Error('Invalid document style scope'); }
        // Reject escapes until resource parsing has a token-aware resolver.
        // A textual url() check alone cannot recognize escaped CSS functions.
        if (new TextEncoder().encode(css).length > LIMIT || /\\/.test(css)) {
            return { css: '', classes: [], problems: ['Stylesheets must be at most 256 KiB and may not contain CSS escapes.'] };
        }
        function clean(rule) {
            if (rule.type !== CSSRule.STYLE_RULE) {
                problem('At-rules are not supported in document styles yet.'); return '';
            }
            var declarations = [];
            for (var i = 0; i < rule.style.length; i++) {
                var name = rule.style[i], value = rule.style.getPropertyValue(name);
                if ((!PAINT.test(name) && !TOKENS.test(name)) || /url\s*\(|image-set\s*\(|expression\s*\(|attr\s*\(/i.test(value)) {
                    problem('Unsupported or resource-loading declarations were omitted.'); continue;
                }
                declarations.push(name + ':' + value + (rule.style.getPropertyPriority(name) ? '!important' : '') + ';');
            }
            var nested = Array.prototype.map.call(rule.cssRules || [], clean).join('');
            if (!declarations.length && !nested) { return ''; }
            var match, names = /\.([a-zA-Z_][a-zA-Z0-9_-]*)/g;
            while ((match = names.exec(rule.selectorText))) { classes.add(match[1]); }
            return rule.selectorText + '{' + declarations.join('') + nested + '}';
        }
        var result = '';
        try {
            var sheet = new CSSStyleSheet();
            sheet.replaceSync(':scope {\n' + css + '\n}');
            var first = sheet.cssRules[0];
            if (first && first.type === CSSRule.STYLE_RULE && first.selectorText === ':scope') { result = clean(first); }
            if (sheet.cssRules.length > 1) { problem('Rules outside the document scope were omitted.'); }
        } catch (err) { problem('The browser could not parse this stylesheet.'); }
        return { css: result ? '@scope ([data-md-style="' + key + '"]) {' + result + '}' : '', classes: Array.from(classes).sort(), problems: problems };
    }
    window.yavcDocumentStyle = Object.freeze({ compile: compile });
})();
