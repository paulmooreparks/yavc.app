/* Project Nayuki QR Code generator, v1.8.0 (MIT License), compiled from
   typescript-javascript/qrcodegen.ts at tag v1.8.0 of
   https://github.com/nayuki/QR-Code-generator with tsc --target es2017.
   Unmodified apart from compilation; it defines the global qrcodegen. */
/*
 * QR Code generator library (TypeScript)
 *
 * Copyright (c) Project Nayuki. (MIT License)
 * https://www.nayuki.io/page/qr-code-generator-library
 *
 * Permission is hereby granted, free of charge, to any person obtaining a copy of
 * this software and associated documentation files (the "Software"), to deal in
 * the Software without restriction, including without limitation the rights to
 * use, copy, modify, merge, publish, distribute, sublicense, and/or sell copies of
 * the Software, and to permit persons to whom the Software is furnished to do so,
 * subject to the following conditions:
 * - The above copyright notice and this permission notice shall be included in
 *   all copies or substantial portions of the Software.
 * - The Software is provided "as is", without warranty of any kind, express or
 *   implied, including but not limited to the warranties of merchantability,
 *   fitness for a particular purpose and noninfringement. In no event shall the
 *   authors or copyright holders be liable for any claim, damages or other
 *   liability, whether in an action of contract, tort or otherwise, arising from,
 *   out of or in connection with the Software or the use or other dealings in the
 *   Software.
 */
"use strict";
var qrcodegen;
(function (qrcodegen) {
    /*---- QR Code symbol class ----*/
    /*
     * A QR Code symbol, which is a type of two-dimension barcode.
     * Invented by Denso Wave and described in the ISO/IEC 18004 standard.
     * Instances of this class represent an immutable square grid of dark and light cells.
     * The class provides static factory functions to create a QR Code from text or binary data.
     * The class covers the QR Code Model 2 specification, supporting all versions (sizes)
     * from 1 to 40, all 4 error correction levels, and 4 character encoding modes.
     *
     * Ways to create a QR Code object:
     * - High level: Take the payload data and call QrCode.encodeText() or QrCode.encodeBinary().
     * - Mid level: Custom-make the list of segments and call QrCode.encodeSegments().
     * - Low level: Custom-make the array of data codeword bytes (including
     *   segment headers and final padding, excluding error correction codewords),
     *   supply the appropriate version number, and call the QrCode() constructor.
     * (Note that all ways require supplying the desired error correction level.)
     */
    class QrCode {
        /*-- Static factory functions (high level) --*/
        // Returns a QR Code representing the given Unicode text string at the given error correction level.
        // As a conservative upper bound, this function is guaranteed to succeed for strings that have 738 or fewer
        // Unicode code points (not UTF-16 code units) if the low error correction level is used. The smallest possible
        // QR Code version is automatically chosen for the output. The ECC level of the result may be higher than the
        // ecl argument if it can be done without increasing the version.
        static encodeText(text, ecl) {
            const segs = qrcodegen.QrSegment.makeSegments(text);
            return QrCode.encodeSegments(segs, ecl);
        }
        // Returns a QR Code representing the given binary data at the given error correction level.
        // This function always encodes using the binary segment mode, not any text mode. The maximum number of
        // bytes allowed is 2953. The smallest possible QR Code version is automatically chosen for the output.
        // The ECC level of the result may be higher than the ecl argument if it can be done without increasing the version.
        static encodeBinary(data, ecl) {
            const seg = qrcodegen.QrSegment.makeBytes(data);
            return QrCode.encodeSegments([seg], ecl);
        }
        /*-- Static factory functions (mid level) --*/
        // Returns a QR Code representing the given segments with the given encoding parameters.
        // The smallest possible QR Code version within the given range is automatically
        // chosen for the output. Iff boostEcl is true, then the ECC level of the result
        // may be higher than the ecl argument if it can be done without increasing the
        // version. The mask number is either between 0 to 7 (inclusive) to force that
        // mask, or -1 to automatically choose an appropriate mask (which may be slow).
        // This function allows the user to create a custom sequence of segments that switches
        // between modes (such as alphanumeric and byte) to encode text in less space.
        // This is a mid-level API; the high-level API is encodeText() and encodeBinary().
        static encodeSegments(segs, ecl, minVersion = 1, maxVersion = 40, mask = -1, boostEcl = true) {
            if (!(QrCode.MIN_VERSION <= minVersion && minVersion <= maxVersion && maxVersion <= QrCode.MAX_VERSION)
                || mask < -1 || mask > 7)
                throw new RangeError("Invalid value");
            // Find the minimal version number to use
            let version;
            let dataUsedBits;
            for (version = minVersion;; version++) {
                const dataCapacityBits = QrCode.getNumDataCodewords(version, ecl) * 8; // Number of data bits available
                const usedBits = QrSegment.getTotalBits(segs, version);
                if (usedBits <= dataCapacityBits) {
                    dataUsedBits = usedBits;
                    break; // This version number is found to be suitable
                }
                if (version >= maxVersion) // All versions in the range could not fit the given data
                    throw new RangeError("Data too long");
            }
            // Increase the error correction level while the data still fits in the current version number
            for (const newEcl of [QrCode.Ecc.MEDIUM, QrCode.Ecc.QUARTILE, QrCode.Ecc.HIGH]) { // From low to high
                if (boostEcl && dataUsedBits <= QrCode.getNumDataCodewords(version, newEcl) * 8)
                    ecl = newEcl;
            }
            // Concatenate all segments to create the data bit string
            let bb = [];
            for (const seg of segs) {
                appendBits(seg.mode.modeBits, 4, bb);
                appendBits(seg.numChars, seg.mode.numCharCountBits(version), bb);
                for (const b of seg.getData())
                    bb.push(b);
            }
            assert(bb.length == dataUsedBits);
            // Add terminator and pad up to a byte if applicable
            const dataCapacityBits = QrCode.getNumDataCodewords(version, ecl) * 8;
            assert(bb.length <= dataCapacityBits);
            appendBits(0, Math.min(4, dataCapacityBits - bb.length), bb);
            appendBits(0, (8 - bb.length % 8) % 8, bb);
            assert(bb.length % 8 == 0);
            // Pad with alternating bytes until data capacity is reached
            for (let padByte = 0xEC; bb.length < dataCapacityBits; padByte ^= 0xEC ^ 0x11)
                appendBits(padByte, 8, bb);
            // Pack bits into bytes in big endian
            let dataCodewords = [];
            while (dataCodewords.length * 8 < bb.length)
                dataCodewords.push(0);
            bb.forEach((b, i) => dataCodewords[i >>> 3] |= b << (7 - (i & 7)));
            // Create the QR Code object
            return new QrCode(version, ecl, dataCodewords, mask);
        }
        /*-- Constructor (low level) and fields --*/
        // Creates a new QR Code with the given version number,
        // error correction level, data codeword bytes, and mask number.
        // This is a low-level API that most users should not use directly.
        // A mid-level API is the encodeSegments() function.
        constructor(
        // The version number of this QR Code, which is between 1 and 40 (inclusive).
        // This determines the size of this barcode.
        version, 
        // The error correction level used in this QR Code.
        errorCorrectionLevel, dataCodewords, msk) {
            this.version = version;
            this.errorCorrectionLevel = errorCorrectionLevel;
            // The modules of this QR Code (false = light, true = dark).
            // Immutable after constructor finishes. Accessed through getModule().
            this.modules = [];
            // Indicates function modules that are not subjected to masking. Discarded when constructor finishes.
            this.isFunction = [];
            // Check scalar arguments
            if (version < QrCode.MIN_VERSION || version > QrCode.MAX_VERSION)
                throw new RangeError("Version value out of range");
            if (msk < -1 || msk > 7)
                throw new RangeError("Mask value out of range");
            this.size = version * 4 + 17;
            // Initialize both grids to be size*size arrays of Boolean false
            let row = [];
            for (let i = 0; i < this.size; i++)
                row.push(false);
            for (let i = 0; i < this.size; i++) {
                this.modules.push(row.slice()); // Initially all light
                this.isFunction.push(row.slice());
            }
            // Compute ECC, draw modules
            this.drawFunctionPatterns();
            const allCodewords = this.addEccAndInterleave(dataCodewords);
            this.drawCodewords(allCodewords);
            // Do masking
            if (msk == -1) { // Automatically choose best mask
                let minPenalty = 1000000000;
                for (let i = 0; i < 8; i++) {
                    this.applyMask(i);
                    this.drawFormatBits(i);
                    const penalty = this.getPenaltyScore();
                    if (penalty < minPenalty) {
                        msk = i;
                        minPenalty = penalty;
                    }
                    this.applyMask(i); // Undoes the mask due to XOR
                }
            }
            assert(0 <= msk && msk <= 7);
            this.mask = msk;
            this.applyMask(msk); // Apply the final choice of mask
            this.drawFormatBits(msk); // Overwrite old format bits
            this.isFunction = [];
        }
        /*-- Accessor methods --*/
        // Returns the color of the module (pixel) at the given coordinates, which is false
        // for light or true for dark. The top left corner has the coordinates (x=0, y=0).
        // If the given coordinates are out of bounds, then false (light) is returned.
        getModule(x, y) {
            return 0 <= x && x < this.size && 0 <= y && y < this.size && this.modules[y][x];
        }
        /*-- Private helper methods for constructor: Drawing function modules --*/
        // Reads this object's version field, and draws and marks all function modules.
        drawFunctionPatterns() {
            // Draw horizontal and vertical timing patterns
            for (let i = 0; i < this.size; i++) {
                this.setFunctionModule(6, i, i % 2 == 0);
                this.setFunctionModule(i, 6, i % 2 == 0);
            }
            // Draw 3 finder patterns (all corners except bottom right; overwrites some timing modules)
            this.drawFinderPattern(3, 3);
            this.drawFinderPattern(this.size - 4, 3);
            this.drawFinderPattern(3, this.size - 4);
            // Draw numerous alignment patterns
            const alignPatPos = this.getAlignmentPatternPositions();
            const numAlign = alignPatPos.length;
            for (let i = 0; i < numAlign; i++) {
                for (let j = 0; j < numAlign; j++) {
                    // Don't draw on the three finder corners
                    if (!(i == 0 && j == 0 || i == 0 && j == numAlign - 1 || i == numAlign - 1 && j == 0))
                        this.drawAlignmentPattern(alignPatPos[i], alignPatPos[j]);
                }
            }
            // Draw configuration data
            this.drawFormatBits(0); // Dummy mask value; overwritten later in the constructor
            this.drawVersion();
        }
        // Draws two copies of the format bits (with its own error correction code)
        // based on the given mask and this object's error correction level field.
        drawFormatBits(mask) {
            // Calculate error correction code and pack bits
            const data = this.errorCorrectionLevel.formatBits << 3 | mask; // errCorrLvl is uint2, mask is uint3
            let rem = data;
            for (let i = 0; i < 10; i++)
                rem = (rem << 1) ^ ((rem >>> 9) * 0x537);
            const bits = (data << 10 | rem) ^ 0x5412; // uint15
            assert(bits >>> 15 == 0);
            // Draw first copy
            for (let i = 0; i <= 5; i++)
                this.setFunctionModule(8, i, getBit(bits, i));
            this.setFunctionModule(8, 7, getBit(bits, 6));
            this.setFunctionModule(8, 8, getBit(bits, 7));
            this.setFunctionModule(7, 8, getBit(bits, 8));
            for (let i = 9; i < 15; i++)
                this.setFunctionModule(14 - i, 8, getBit(bits, i));
            // Draw second copy
            for (let i = 0; i < 8; i++)
                this.setFunctionModule(this.size - 1 - i, 8, getBit(bits, i));
            for (let i = 8; i < 15; i++)
                this.setFunctionModule(8, this.size - 15 + i, getBit(bits, i));
            this.setFunctionModule(8, this.size - 8, true); // Always dark
        }
        // Draws two copies of the version bits (with its own error correction code),
        // based on this object's version field, iff 7 <= version <= 40.
        drawVersion() {
            if (this.version < 7)
                return;
            // Calculate error correction code and pack bits
            let rem = this.version; // version is uint6, in the range [7, 40]
            for (let i = 0; i < 12; i++)
                rem = (rem << 1) ^ ((rem >>> 11) * 0x1F25);
            const bits = this.version << 12 | rem; // uint18
            assert(bits >>> 18 == 0);
            // Draw two copies
            for (let i = 0; i < 18; i++) {
                const color = getBit(bits, i);
                const a = this.size - 11 + i % 3;
                const b = Math.floor(i / 3);
                this.setFunctionModule(a, b, color);
                this.setFunctionModule(b, a, color);
            }
        }
        // Draws a 9*9 finder pattern including the border separator,
        // with the center module at (x, y). Modules can be out of bounds.
        drawFinderPattern(x, y) {
            for (let dy = -4; dy <= 4; dy++) {
                for (let dx = -4; dx <= 4; dx++) {
                    const dist = Math.max(Math.abs(dx), Math.abs(dy)); // Chebyshev/infinity norm
                    const xx = x + dx;
                    const yy = y + dy;
                    if (0 <= xx && xx < this.size && 0 <= yy && yy < this.size)
                        this.setFunctionModule(xx, yy, dist != 2 && dist != 4);
                }
            }
        }
        // Draws a 5*5 alignment pattern, with the center module
        // at (x, y). All modules must be in bounds.
        drawAlignmentPattern(x, y) {
            for (let dy = -2; dy <= 2; dy++) {
                for (let dx = -2; dx <= 2; dx++)
                    this.setFunctionModule(x + dx, y + dy, Math.max(Math.abs(dx), Math.abs(dy)) != 1);
            }
        }
        // Sets the color of a module and marks it as a function module.
        // Only used by the constructor. Coordinates must be in bounds.
        setFunctionModule(x, y, isDark) {
            this.modules[y][x] = isDark;
            this.isFunction[y][x] = true;
        }
        /*-- Private helper methods for constructor: Codewords and masking --*/
        // Returns a new byte string representing the given data with the appropriate error correction
        // codewords appended to it, based on this object's version and error correction level.
        addEccAndInterleave(data) {
            const ver = this.version;
            const ecl = this.errorCorrectionLevel;
            if (data.length != QrCode.getNumDataCodewords(ver, ecl))
                throw new RangeError("Invalid argument");
            // Calculate parameter numbers
            const numBlocks = QrCode.NUM_ERROR_CORRECTION_BLOCKS[ecl.ordinal][ver];
            const blockEccLen = QrCode.ECC_CODEWORDS_PER_BLOCK[ecl.ordinal][ver];
            const rawCodewords = Math.floor(QrCode.getNumRawDataModules(ver) / 8);
            const numShortBlocks = numBlocks - rawCodewords % numBlocks;
            const shortBlockLen = Math.floor(rawCodewords / numBlocks);
            // Split data into blocks and append ECC to each block
            let blocks = [];
            const rsDiv = QrCode.reedSolomonComputeDivisor(blockEccLen);
            for (let i = 0, k = 0; i < numBlocks; i++) {
                let dat = data.slice(k, k + shortBlockLen - blockEccLen + (i < numShortBlocks ? 0 : 1));
                k += dat.length;
                const ecc = QrCode.reedSolomonComputeRemainder(dat, rsDiv);
                if (i < numShortBlocks)
                    dat.push(0);
                blocks.push(dat.concat(ecc));
            }
            // Interleave (not concatenate) the bytes from every block into a single sequence
            let result = [];
            for (let i = 0; i < blocks[0].length; i++) {
                blocks.forEach((block, j) => {
                    // Skip the padding byte in short blocks
                    if (i != shortBlockLen - blockEccLen || j >= numShortBlocks)
                        result.push(block[i]);
                });
            }
            assert(result.length == rawCodewords);
            return result;
        }
        // Draws the given sequence of 8-bit codewords (data and error correction) onto the entire
        // data area of this QR Code. Function modules need to be marked off before this is called.
        drawCodewords(data) {
            if (data.length != Math.floor(QrCode.getNumRawDataModules(this.version) / 8))
                throw new RangeError("Invalid argument");
            let i = 0; // Bit index into the data
            // Do the funny zigzag scan
            for (let right = this.size - 1; right >= 1; right -= 2) { // Index of right column in each column pair
                if (right == 6)
                    right = 5;
                for (let vert = 0; vert < this.size; vert++) { // Vertical counter
                    for (let j = 0; j < 2; j++) {
                        const x = right - j; // Actual x coordinate
                        const upward = ((right + 1) & 2) == 0;
                        const y = upward ? this.size - 1 - vert : vert; // Actual y coordinate
                        if (!this.isFunction[y][x] && i < data.length * 8) {
                            this.modules[y][x] = getBit(data[i >>> 3], 7 - (i & 7));
                            i++;
                        }
                        // If this QR Code has any remainder bits (0 to 7), they were assigned as
                        // 0/false/light by the constructor and are left unchanged by this method
                    }
                }
            }
            assert(i == data.length * 8);
        }
        // XORs the codeword modules in this QR Code with the given mask pattern.
        // The function modules must be marked and the codeword bits must be drawn
        // before masking. Due to the arithmetic of XOR, calling applyMask() with
        // the same mask value a second time will undo the mask. A final well-formed
        // QR Code needs exactly one (not zero, two, etc.) mask applied.
        applyMask(mask) {
            if (mask < 0 || mask > 7)
                throw new RangeError("Mask value out of range");
            for (let y = 0; y < this.size; y++) {
                for (let x = 0; x < this.size; x++) {
                    let invert;
                    switch (mask) {
                        case 0:
                            invert = (x + y) % 2 == 0;
                            break;
                        case 1:
                            invert = y % 2 == 0;
                            break;
                        case 2:
                            invert = x % 3 == 0;
                            break;
                        case 3:
                            invert = (x + y) % 3 == 0;
                            break;
                        case 4:
                            invert = (Math.floor(x / 3) + Math.floor(y / 2)) % 2 == 0;
                            break;
                        case 5:
                            invert = x * y % 2 + x * y % 3 == 0;
                            break;
                        case 6:
                            invert = (x * y % 2 + x * y % 3) % 2 == 0;
                            break;
                        case 7:
                            invert = ((x + y) % 2 + x * y % 3) % 2 == 0;
                            break;
                        default: throw new Error("Unreachable");
                    }
                    if (!this.isFunction[y][x] && invert)
                        this.modules[y][x] = !this.modules[y][x];
                }
            }
        }
        // Calculates and returns the penalty score based on state of this QR Code's current modules.
        // This is used by the automatic mask choice algorithm to find the mask pattern that yields the lowest score.
        getPenaltyScore() {
            let result = 0;
            // Adjacent modules in row having same color, and finder-like patterns
            for (let y = 0; y < this.size; y++) {
                let runColor = false;
                let runX = 0;
                let runHistory = [0, 0, 0, 0, 0, 0, 0];
                for (let x = 0; x < this.size; x++) {
                    if (this.modules[y][x] == runColor) {
                        runX++;
                        if (runX == 5)
                            result += QrCode.PENALTY_N1;
                        else if (runX > 5)
                            result++;
                    }
                    else {
                        this.finderPenaltyAddHistory(runX, runHistory);
                        if (!runColor)
                            result += this.finderPenaltyCountPatterns(runHistory) * QrCode.PENALTY_N3;
                        runColor = this.modules[y][x];
                        runX = 1;
                    }
                }
                result += this.finderPenaltyTerminateAndCount(runColor, runX, runHistory) * QrCode.PENALTY_N3;
            }
            // Adjacent modules in column having same color, and finder-like patterns
            for (let x = 0; x < this.size; x++) {
                let runColor = false;
                let runY = 0;
                let runHistory = [0, 0, 0, 0, 0, 0, 0];
                for (let y = 0; y < this.size; y++) {
                    if (this.modules[y][x] == runColor) {
                        runY++;
                        if (runY == 5)
                            result += QrCode.PENALTY_N1;
                        else if (runY > 5)
                            result++;
                    }
                    else {
                        this.finderPenaltyAddHistory(runY, runHistory);
                        if (!runColor)
                            result += this.finderPenaltyCountPatterns(runHistory) * QrCode.PENALTY_N3;
                        runColor = this.modules[y][x];
                        runY = 1;
                    }
                }
                result += this.finderPenaltyTerminateAndCount(runColor, runY, runHistory) * QrCode.PENALTY_N3;
            }
            // 2*2 blocks of modules having same color
            for (let y = 0; y < this.size - 1; y++) {
                for (let x = 0; x < this.size - 1; x++) {
                    const color = this.modules[y][x];
                    if (color == this.modules[y][x + 1] &&
                        color == this.modules[y + 1][x] &&
                        color == this.modules[y + 1][x + 1])
                        result += QrCode.PENALTY_N2;
                }
            }
            // Balance of dark and light modules
            let dark = 0;
            for (const row of this.modules)
                dark = row.reduce((sum, color) => sum + (color ? 1 : 0), dark);
            const total = this.size * this.size; // Note that size is odd, so dark/total != 1/2
            // Compute the smallest integer k >= 0 such that (45-5k)% <= dark/total <= (55+5k)%
            const k = Math.ceil(Math.abs(dark * 20 - total * 10) / total) - 1;
            assert(0 <= k && k <= 9);
            result += k * QrCode.PENALTY_N4;
            assert(0 <= result && result <= 2568888); // Non-tight upper bound based on default values of PENALTY_N1, ..., N4
            return result;
        }
        /*-- Private helper functions --*/
        // Returns an ascending list of positions of alignment patterns for this version number.
        // Each position is in the range [0,177), and are used on both the x and y axes.
        // This could be implemented as lookup table of 40 variable-length lists of integers.
        getAlignmentPatternPositions() {
            if (this.version == 1)
                return [];
            else {
                const numAlign = Math.floor(this.version / 7) + 2;
                const step = (this.version == 32) ? 26 :
                    Math.ceil((this.version * 4 + 4) / (numAlign * 2 - 2)) * 2;
                let result = [6];
                for (let pos = this.size - 7; result.length < numAlign; pos -= step)
                    result.splice(1, 0, pos);
                return result;
            }
        }
        // Returns the number of data bits that can be stored in a QR Code of the given version number, after
        // all function modules are excluded. This includes remainder bits, so it might not be a multiple of 8.
        // The result is in the range [208, 29648]. This could be implemented as a 40-entry lookup table.
        static getNumRawDataModules(ver) {
            if (ver < QrCode.MIN_VERSION || ver > QrCode.MAX_VERSION)
                throw new RangeError("Version number out of range");
            let result = (16 * ver + 128) * ver + 64;
            if (ver >= 2) {
                const numAlign = Math.floor(ver / 7) + 2;
                result -= (25 * numAlign - 10) * numAlign - 55;
                if (ver >= 7)
                    result -= 36;
            }
            assert(208 <= result && result <= 29648);
            return result;
        }
        // Returns the number of 8-bit data (i.e. not error correction) codewords contained in any
        // QR Code of the given version number and error correction level, with remainder bits discarded.
        // This stateless pure function could be implemented as a (40*4)-cell lookup table.
        static getNumDataCodewords(ver, ecl) {
            return Math.floor(QrCode.getNumRawDataModules(ver) / 8) -
                QrCode.ECC_CODEWORDS_PER_BLOCK[ecl.ordinal][ver] *
                    QrCode.NUM_ERROR_CORRECTION_BLOCKS[ecl.ordinal][ver];
        }
        // Returns a Reed-Solomon ECC generator polynomial for the given degree. This could be
        // implemented as a lookup table over all possible parameter values, instead of as an algorithm.
        static reedSolomonComputeDivisor(degree) {
            if (degree < 1 || degree > 255)
                throw new RangeError("Degree out of range");
            // Polynomial coefficients are stored from highest to lowest power, excluding the leading term which is always 1.
            // For example the polynomial x^3 + 255x^2 + 8x + 93 is stored as the uint8 array [255, 8, 93].
            let result = [];
            for (let i = 0; i < degree - 1; i++)
                result.push(0);
            result.push(1); // Start off with the monomial x^0
            // Compute the product polynomial (x - r^0) * (x - r^1) * (x - r^2) * ... * (x - r^{degree-1}),
            // and drop the highest monomial term which is always 1x^degree.
            // Note that r = 0x02, which is a generator element of this field GF(2^8/0x11D).
            let root = 1;
            for (let i = 0; i < degree; i++) {
                // Multiply the current product by (x - r^i)
                for (let j = 0; j < result.length; j++) {
                    result[j] = QrCode.reedSolomonMultiply(result[j], root);
                    if (j + 1 < result.length)
                        result[j] ^= result[j + 1];
                }
                root = QrCode.reedSolomonMultiply(root, 0x02);
            }
            return result;
        }
        // Returns the Reed-Solomon error correction codeword for the given data and divisor polynomials.
        static reedSolomonComputeRemainder(data, divisor) {
            let result = divisor.map(_ => 0);
            for (const b of data) { // Polynomial division
                const factor = b ^ result.shift();
                result.push(0);
                divisor.forEach((coef, i) => result[i] ^= QrCode.reedSolomonMultiply(coef, factor));
            }
            return result;
        }
        // Returns the product of the two given field elements modulo GF(2^8/0x11D). The arguments and result
        // are unsigned 8-bit integers. This could be implemented as a lookup table of 256*256 entries of uint8.
        static reedSolomonMultiply(x, y) {
            if (x >>> 8 != 0 || y >>> 8 != 0)
                throw new RangeError("Byte out of range");
            // Russian peasant multiplication
            let z = 0;
            for (let i = 7; i >= 0; i--) {
                z = (z << 1) ^ ((z >>> 7) * 0x11D);
                z ^= ((y >>> i) & 1) * x;
            }
            assert(z >>> 8 == 0);
            return z;
        }
        // Can only be called immediately after a light run is added, and
        // returns either 0, 1, or 2. A helper function for getPenaltyScore().
        finderPenaltyCountPatterns(runHistory) {
            const n = runHistory[1];
            assert(n <= this.size * 3);
            const core = n > 0 && runHistory[2] == n && runHistory[3] == n * 3 && runHistory[4] == n && runHistory[5] == n;
            return (core && runHistory[0] >= n * 4 && runHistory[6] >= n ? 1 : 0)
                + (core && runHistory[6] >= n * 4 && runHistory[0] >= n ? 1 : 0);
        }
        // Must be called at the end of a line (row or column) of modules. A helper function for getPenaltyScore().
        finderPenaltyTerminateAndCount(currentRunColor, currentRunLength, runHistory) {
            if (currentRunColor) { // Terminate dark run
                this.finderPenaltyAddHistory(currentRunLength, runHistory);
                currentRunLength = 0;
            }
            currentRunLength += this.size; // Add light border to final run
            this.finderPenaltyAddHistory(currentRunLength, runHistory);
            return this.finderPenaltyCountPatterns(runHistory);
        }
        // Pushes the given value to the front and drops the last value. A helper function for getPenaltyScore().
        finderPenaltyAddHistory(currentRunLength, runHistory) {
            if (runHistory[0] == 0)
                currentRunLength += this.size; // Add light border to initial run
            runHistory.pop();
            runHistory.unshift(currentRunLength);
        }
    }
    /*-- Constants and tables --*/
    // The minimum version number supported in the QR Code Model 2 standard.
    QrCode.MIN_VERSION = 1;
    // The maximum version number supported in the QR Code Model 2 standard.
    QrCode.MAX_VERSION = 40;
    // For use in getPenaltyScore(), when evaluating which mask is best.
    QrCode.PENALTY_N1 = 3;
    QrCode.PENALTY_N2 = 3;
    QrCode.PENALTY_N3 = 40;
    QrCode.PENALTY_N4 = 10;
    QrCode.ECC_CODEWORDS_PER_BLOCK = [
        // Version: (note that index 0 is for padding, and is set to an illegal value)
        //0,  1,  2,  3,  4,  5,  6,  7,  8,  9, 10, 11, 12, 13, 14, 15, 16, 17, 18, 19, 20, 21, 22, 23, 24, 25, 26, 27, 28, 29, 30, 31, 32, 33, 34, 35, 36, 37, 38, 39, 40    Error correction level
        [-1, 7, 10, 15, 20, 26, 18, 20, 24, 30, 18, 20, 24, 26, 30, 22, 24, 28, 30, 28, 28, 28, 28, 30, 30, 26, 28, 30, 30, 30, 30, 30, 30, 30, 30, 30, 30, 30, 30, 30, 30], // Low
        [-1, 10, 16, 26, 18, 24, 16, 18, 22, 22, 26, 30, 22, 22, 24, 24, 28, 28, 26, 26, 26, 26, 28, 28, 28, 28, 28, 28, 28, 28, 28, 28, 28, 28, 28, 28, 28, 28, 28, 28, 28], // Medium
        [-1, 13, 22, 18, 26, 18, 24, 18, 22, 20, 24, 28, 26, 24, 20, 30, 24, 28, 28, 26, 30, 28, 30, 30, 30, 30, 28, 30, 30, 30, 30, 30, 30, 30, 30, 30, 30, 30, 30, 30, 30], // Quartile
        [-1, 17, 28, 22, 16, 22, 28, 26, 26, 24, 28, 24, 28, 22, 24, 24, 30, 28, 28, 26, 28, 30, 24, 30, 30, 30, 30, 30, 30, 30, 30, 30, 30, 30, 30, 30, 30, 30, 30, 30, 30], // High
    ];
    QrCode.NUM_ERROR_CORRECTION_BLOCKS = [
        // Version: (note that index 0 is for padding, and is set to an illegal value)
        //0, 1, 2, 3, 4, 5, 6, 7, 8, 9,10, 11, 12, 13, 14, 15, 16, 17, 18, 19, 20, 21, 22, 23, 24, 25, 26, 27, 28, 29, 30, 31, 32, 33, 34, 35, 36, 37, 38, 39, 40    Error correction level
        [-1, 1, 1, 1, 1, 1, 2, 2, 2, 2, 4, 4, 4, 4, 4, 6, 6, 6, 6, 7, 8, 8, 9, 9, 10, 12, 12, 12, 13, 14, 15, 16, 17, 18, 19, 19, 20, 21, 22, 24, 25], // Low
        [-1, 1, 1, 1, 2, 2, 4, 4, 4, 5, 5, 5, 8, 9, 9, 10, 10, 11, 13, 14, 16, 17, 17, 18, 20, 21, 23, 25, 26, 28, 29, 31, 33, 35, 37, 38, 40, 43, 45, 47, 49], // Medium
        [-1, 1, 1, 2, 2, 4, 4, 6, 6, 8, 8, 8, 10, 12, 16, 12, 17, 16, 18, 21, 20, 23, 23, 25, 27, 29, 34, 34, 35, 38, 40, 43, 45, 48, 51, 53, 56, 59, 62, 65, 68], // Quartile
        [-1, 1, 1, 2, 4, 4, 4, 5, 6, 8, 8, 11, 11, 16, 16, 18, 16, 19, 21, 25, 25, 25, 34, 30, 32, 35, 37, 40, 42, 45, 48, 51, 54, 57, 60, 63, 66, 70, 74, 77, 81], // High
    ];
    qrcodegen.QrCode = QrCode;
    // Appends the given number of low-order bits of the given value
    // to the given buffer. Requires 0 <= len <= 31 and 0 <= val < 2^len.
    function appendBits(val, len, bb) {
        if (len < 0 || len > 31 || val >>> len != 0)
            throw new RangeError("Value out of range");
        for (let i = len - 1; i >= 0; i--) // Append bit by bit
            bb.push((val >>> i) & 1);
    }
    // Returns true iff the i'th bit of x is set to 1.
    function getBit(x, i) {
        return ((x >>> i) & 1) != 0;
    }
    // Throws an exception if the given condition is false.
    function assert(cond) {
        if (!cond)
            throw new Error("Assertion error");
    }
    /*---- Data segment class ----*/
    /*
     * A segment of character/binary/control data in a QR Code symbol.
     * Instances of this class are immutable.
     * The mid-level way to create a segment is to take the payload data
     * and call a static factory function such as QrSegment.makeNumeric().
     * The low-level way to create a segment is to custom-make the bit buffer
     * and call the QrSegment() constructor with appropriate values.
     * This segment class imposes no length restrictions, but QR Codes have restrictions.
     * Even in the most favorable conditions, a QR Code can only hold 7089 characters of data.
     * Any segment longer than this is meaningless for the purpose of generating QR Codes.
     */
    class QrSegment {
        /*-- Static factory functions (mid level) --*/
        // Returns a segment representing the given binary data encoded in
        // byte mode. All input byte arrays are acceptable. Any text string
        // can be converted to UTF-8 bytes and encoded as a byte mode segment.
        static makeBytes(data) {
            let bb = [];
            for (const b of data)
                appendBits(b, 8, bb);
            return new QrSegment(QrSegment.Mode.BYTE, data.length, bb);
        }
        // Returns a segment representing the given string of decimal digits encoded in numeric mode.
        static makeNumeric(digits) {
            if (!QrSegment.isNumeric(digits))
                throw new RangeError("String contains non-numeric characters");
            let bb = [];
            for (let i = 0; i < digits.length;) { // Consume up to 3 digits per iteration
                const n = Math.min(digits.length - i, 3);
                appendBits(parseInt(digits.substr(i, n), 10), n * 3 + 1, bb);
                i += n;
            }
            return new QrSegment(QrSegment.Mode.NUMERIC, digits.length, bb);
        }
        // Returns a segment representing the given text string encoded in alphanumeric mode.
        // The characters allowed are: 0 to 9, A to Z (uppercase only), space,
        // dollar, percent, asterisk, plus, hyphen, period, slash, colon.
        static makeAlphanumeric(text) {
            if (!QrSegment.isAlphanumeric(text))
                throw new RangeError("String contains unencodable characters in alphanumeric mode");
            let bb = [];
            let i;
            for (i = 0; i + 2 <= text.length; i += 2) { // Process groups of 2
                let temp = QrSegment.ALPHANUMERIC_CHARSET.indexOf(text.charAt(i)) * 45;
                temp += QrSegment.ALPHANUMERIC_CHARSET.indexOf(text.charAt(i + 1));
                appendBits(temp, 11, bb);
            }
            if (i < text.length) // 1 character remaining
                appendBits(QrSegment.ALPHANUMERIC_CHARSET.indexOf(text.charAt(i)), 6, bb);
            return new QrSegment(QrSegment.Mode.ALPHANUMERIC, text.length, bb);
        }
        // Returns a new mutable list of zero or more segments to represent the given Unicode text string.
        // The result may use various segment modes and switch modes to optimize the length of the bit stream.
        static makeSegments(text) {
            // Select the most efficient segment encoding automatically
            if (text == "")
                return [];
            else if (QrSegment.isNumeric(text))
                return [QrSegment.makeNumeric(text)];
            else if (QrSegment.isAlphanumeric(text))
                return [QrSegment.makeAlphanumeric(text)];
            else
                return [QrSegment.makeBytes(QrSegment.toUtf8ByteArray(text))];
        }
        // Returns a segment representing an Extended Channel Interpretation
        // (ECI) designator with the given assignment value.
        static makeEci(assignVal) {
            let bb = [];
            if (assignVal < 0)
                throw new RangeError("ECI assignment value out of range");
            else if (assignVal < (1 << 7))
                appendBits(assignVal, 8, bb);
            else if (assignVal < (1 << 14)) {
                appendBits(0b10, 2, bb);
                appendBits(assignVal, 14, bb);
            }
            else if (assignVal < 1000000) {
                appendBits(0b110, 3, bb);
                appendBits(assignVal, 21, bb);
            }
            else
                throw new RangeError("ECI assignment value out of range");
            return new QrSegment(QrSegment.Mode.ECI, 0, bb);
        }
        // Tests whether the given string can be encoded as a segment in numeric mode.
        // A string is encodable iff each character is in the range 0 to 9.
        static isNumeric(text) {
            return QrSegment.NUMERIC_REGEX.test(text);
        }
        // Tests whether the given string can be encoded as a segment in alphanumeric mode.
        // A string is encodable iff each character is in the following set: 0 to 9, A to Z
        // (uppercase only), space, dollar, percent, asterisk, plus, hyphen, period, slash, colon.
        static isAlphanumeric(text) {
            return QrSegment.ALPHANUMERIC_REGEX.test(text);
        }
        /*-- Constructor (low level) and fields --*/
        // Creates a new QR Code segment with the given attributes and data.
        // The character count (numChars) must agree with the mode and the bit buffer length,
        // but the constraint isn't checked. The given bit buffer is cloned and stored.
        constructor(
        // The mode indicator of this segment.
        mode, 
        // The length of this segment's unencoded data. Measured in characters for
        // numeric/alphanumeric/kanji mode, bytes for byte mode, and 0 for ECI mode.
        // Always zero or positive. Not the same as the data's bit length.
        numChars, 
        // The data bits of this segment. Accessed through getData().
        bitData) {
            this.mode = mode;
            this.numChars = numChars;
            this.bitData = bitData;
            if (numChars < 0)
                throw new RangeError("Invalid argument");
            this.bitData = bitData.slice(); // Make defensive copy
        }
        /*-- Methods --*/
        // Returns a new copy of the data bits of this segment.
        getData() {
            return this.bitData.slice(); // Make defensive copy
        }
        // (Package-private) Calculates and returns the number of bits needed to encode the given segments at
        // the given version. The result is infinity if a segment has too many characters to fit its length field.
        static getTotalBits(segs, version) {
            let result = 0;
            for (const seg of segs) {
                const ccbits = seg.mode.numCharCountBits(version);
                if (seg.numChars >= (1 << ccbits))
                    return Infinity; // The segment's length doesn't fit the field's bit width
                result += 4 + ccbits + seg.bitData.length;
            }
            return result;
        }
        // Returns a new array of bytes representing the given string encoded in UTF-8.
        static toUtf8ByteArray(str) {
            str = encodeURI(str);
            let result = [];
            for (let i = 0; i < str.length; i++) {
                if (str.charAt(i) != "%")
                    result.push(str.charCodeAt(i));
                else {
                    result.push(parseInt(str.substr(i + 1, 2), 16));
                    i += 2;
                }
            }
            return result;
        }
    }
    /*-- Constants --*/
    // Describes precisely all strings that are encodable in numeric mode.
    QrSegment.NUMERIC_REGEX = /^[0-9]*$/;
    // Describes precisely all strings that are encodable in alphanumeric mode.
    QrSegment.ALPHANUMERIC_REGEX = /^[A-Z0-9 $%*+.\/:-]*$/;
    // The set of all legal characters in alphanumeric mode,
    // where each character value maps to the index in the string.
    QrSegment.ALPHANUMERIC_CHARSET = "0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZ $%*+-./:";
    qrcodegen.QrSegment = QrSegment;
})(qrcodegen || (qrcodegen = {}));
/*---- Public helper enumeration ----*/
(function (qrcodegen) {
    var QrCode;
    (function (QrCode) {
        /*
         * The error correction level in a QR Code symbol. Immutable.
         */
        class Ecc {
            /*-- Constructor and fields --*/
            constructor(
            // In the range 0 to 3 (unsigned 2-bit integer).
            ordinal, 
            // (Package-private) In the range 0 to 3 (unsigned 2-bit integer).
            formatBits) {
                this.ordinal = ordinal;
                this.formatBits = formatBits;
            }
        }
        /*-- Constants --*/
        Ecc.LOW = new Ecc(0, 1); // The QR Code can tolerate about  7% erroneous codewords
        Ecc.MEDIUM = new Ecc(1, 0); // The QR Code can tolerate about 15% erroneous codewords
        Ecc.QUARTILE = new Ecc(2, 3); // The QR Code can tolerate about 25% erroneous codewords
        Ecc.HIGH = new Ecc(3, 2); // The QR Code can tolerate about 30% erroneous codewords
        QrCode.Ecc = Ecc;
    })(QrCode = qrcodegen.QrCode || (qrcodegen.QrCode = {}));
})(qrcodegen || (qrcodegen = {}));
/*---- Public helper enumeration ----*/
(function (qrcodegen) {
    var QrSegment;
    (function (QrSegment) {
        /*
         * Describes how a segment's data bits are interpreted. Immutable.
         */
        class Mode {
            /*-- Constructor and fields --*/
            constructor(
            // The mode indicator bits, which is a uint4 value (range 0 to 15).
            modeBits, 
            // Number of character count bits for three different version ranges.
            numBitsCharCount) {
                this.modeBits = modeBits;
                this.numBitsCharCount = numBitsCharCount;
            }
            /*-- Method --*/
            // (Package-private) Returns the bit width of the character count field for a segment in
            // this mode in a QR Code at the given version number. The result is in the range [0, 16].
            numCharCountBits(ver) {
                return this.numBitsCharCount[Math.floor((ver + 7) / 17)];
            }
        }
        /*-- Constants --*/
        Mode.NUMERIC = new Mode(0x1, [10, 12, 14]);
        Mode.ALPHANUMERIC = new Mode(0x2, [9, 11, 13]);
        Mode.BYTE = new Mode(0x4, [8, 16, 16]);
        Mode.KANJI = new Mode(0x8, [8, 10, 12]);
        Mode.ECI = new Mode(0x7, [0, 0, 0]);
        QrSegment.Mode = Mode;
    })(QrSegment = qrcodegen.QrSegment || (qrcodegen.QrSegment = {}));
})(qrcodegen || (qrcodegen = {}));

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

/* The Barcode Tool's actions (actions.json), run by the host's action
   broker without the tool's window. generate and interpret are GK
   Companion's barcode commands (vendor/barcode/barcode-commands.js there),
   over the same engine the tool uses, which the collection's build
   bundles in front of this module. */
(function () {
    'use strict';

    function ready() {
        return window.barcodeEngine ? Promise.resolve(window.barcodeEngine) : Promise.reject(new Error('The barcode engine is not bundled with this module.'));
    }

    function evaluate(B, input) {
        var def = B.symbologies[input.symbology];
        if (!def) { throw new Error('Choose a supported barcode format.'); }
        var options = input.options || {};
        Object.keys(options).forEach(function (key) {
            if ((def.options || []).indexOf(key) < 0) { throw new Error(key + ' is not an option for ' + input.symbology + '.'); }
        });
        return B.encode(input.symbology, input.data, options);
    }

    async function generate(input, ctx) {
        var B = await ready(ctx), result = evaluate(B, input);
        if (!result.ok) { throw new Error(result.error + (result.fix ? ' Suggested correction: ' + result.fix : '')); }
        var symbol = result.symbol, options = Object.assign({}, input.render || {});
        if (Object.prototype.hasOwnProperty.call(options, 'hri')) {
            symbol = Object.assign({}, symbol, { hri: options.hri, hriMap: null, textMode: 'center' });
            delete options.hri;
        }
        options.moduleMM = input.moduleMM === undefined ? 0.33 : input.moduleMM;
        if (input.showText !== undefined) { options.showText = input.showText; }
        if (input.highlights) { options.bands = (options.bands || []).concat(B.roleBands(symbol, input.highlights)); }
        var geometry = B.geometry(symbol, options);
        return {
            output: { symbology: input.symbology, data: symbol.data, widthMM: geometry.width * options.moduleMM, heightMM: geometry.height * options.moduleMM },
            artifacts: [{
                key: 'image', mime: 'image/svg+xml', data: B.toSVG(symbol, options),
                name: (input.symbology + '-' + (symbol.data || 'barcode')).replace(/[^A-Za-z0-9-]+/g, '_').slice(0, 60) + '.svg'
            }]
        };
    }

    async function interpret(input, ctx) {
        var B = await ready(ctx);
        return { output: { matches: B.identify(input.data) } };
    }

    window.pudlApplets.provide('parks.barcode', { 'generate@1': generate, 'interpret@1': interpret });
})();
