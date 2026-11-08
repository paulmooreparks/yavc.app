# Fractional spin increments for unrestricted measurements

Paul reported this against the bundled PUDL 0.103.0 on 2026-11-08. He chose small unit-based wheel increments, rather than stepping the digit at the caret. The intended increments are 0.1 mm, 0.01 cm, 0.01 in and 0.1 pt.

The 0.105.0 upgrade rechecked this behavior in all three browser engines. Its number-field script is unchanged, and the independent spin increment remains an upstream requirement. Typed precision is retained.

## Current behavior

Page Setup uses native number inputs with `step="any"` so custom measurements and conversions retain their precision. PUDL's `pudl-fields.js` documents wheel stepping while the field is focused. Its `stepBy` implementation uses one unit when the step is unrestricted, so a value of 25.4 changes to 26.4 while its fractional part stays unchanged.

The same component uses a finite `step` to snap committed typed values and derive displayed decimal places. Changing the input to `step="0.1"` would therefore change validation and display precision as well as the wheel increment. The application must not silently round authored paper sizes or converted margins to obtain finer scrolling.

## Required capability

The component needs a documented way to specify a spin increment independently of an unrestricted input's accepted precision. That increment should apply consistently to the wheel, arrow keys and plus/minus buttons. Existing finite-step inputs should retain their current snapping behavior. Disabled/read-only fields and wheel scrolling past an unfocused field must retain their current behavior.

The Page Setup integration can then select the increment for its active units while retaining `step="any"`. Typed fractional measurements currently remain usable. No vendor patch or unsupported component hook is installed by this batch. This report is prepared for upstream work; it has not been sent or filed externally.
