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

/* The barcode tool as a PUDL applet (0.23.0). It makes barcodes from free
   data or from a layout of named fields, and reads a scanned value back
   into its fields. The encoding, rendering and layout model live in
   the engine (barcode-engine.js, with the QR library it wraps), and the
   reader's layouts are the library (barcode-library.js), both bundled in
   front of this script when the collection is packed; this file is only
   the interface. The design is Architecture/barcode-tool-design.md in the
   parkscomputing repo.

   State is a query string (sym, data, layout, field values as f.<id>,
   options), so a barcode is a link: on the applet's own page it rides in
   the address, and elsewhere it goes through the applet state handshake.
   The host's services (window.pudlHost) are used where it has them: its
   file dialogs for Open and Save as, and its file system for the
   library. */
(function () {
    'use strict';

    function host() { return window.pudlHost || {}; }
    function hostFs() { return host().fs || null; }

    /* The guide is a page of the host's, where it has one. */
    var GUIDE_KEY = 'barcode-tool-guide';
    function guideUrl() { return (host().pages || '/page/') + GUIDE_KEY; }

    var SYM_GROUPS = [
        ['Retail', ['ean13', 'ean8', 'upca', 'upce']],
        ['Logistics', ['gs1-128', 'itf14', 'itf']],
        ['General', ['code128', 'code39', 'codabar']],
        ['Two-dimensional', ['qr']]
    ];
    var SAMPLE_DATA = {
        ean13: '480036140036', ean8: '9638507', upca: '03600029145', upce: '0425261',
        'gs1-128': '(01)09501101530003(17)271231(10)LOT42A', itf14: '1540014128876', itf: '123420260929001234',
        code128: 'Hello, PUDL 2026', code39: 'CODE-39', codabar: '40156',
        qr: 'https://github.com/paulmooreparks/pudl-barcodes'
    };
    var ECC_LEVELS = [['L', 'L (7%)'], ['M', 'M (15%)'], ['Q', 'Q (25%)'], ['H', 'H (30%)']];
    var MODULE_MM = [['0.264', '0.264 mm (80%)'], ['0.33', '0.33 mm (100%)'], ['0.40', '0.40 mm'], ['0.495', '0.495 mm (150%)'], ['0.66', '0.66 mm (200%)']];

    var uid = 0;
    function esc(s) { return String(s == null ? '' : s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;'); }

    function libraryFile(list) { return window.barcodeLibrary.text(list); }

    /* A linked layouts file (File System Access, Edge and Chrome): the
       handle is kept in IndexedDB, since it cannot go in localStorage, and
       the browser asks again for permission after a restart. Everything
       here fails soft: without the API or the database, the library is
       simply the browser's own copy. */
    var FILE_API = typeof window.showOpenFilePicker === 'function' && typeof window.showSaveFilePicker === 'function';
    var DB_NAME = 'pc-barcodes', HANDLE_KEY = 'library-file';
    function idb(op, value) {
        return new Promise(function (resolve, reject) {
            if (!window.indexedDB) { reject(new Error('no IndexedDB')); return; }
            var open = indexedDB.open(DB_NAME, 1);
            open.onupgradeneeded = function () { open.result.createObjectStore('kv'); };
            open.onerror = function () { reject(open.error); };
            open.onsuccess = function () {
                var db = open.result;
                try {
                    var tx = db.transaction('kv', op === 'get' ? 'readonly' : 'readwrite'), store = tx.objectStore('kv');
                    var req = op === 'get' ? store.get(HANDLE_KEY) : op === 'delete' ? store.delete(HANDLE_KEY) : store.put(value, HANDLE_KEY);
                    req.onsuccess = function () { resolve(req.result); };
                    req.onerror = function () { reject(req.error); };
                    tx.oncomplete = function () { db.close(); };
                } catch (err) {
                    /* put() throws at once for a value it cannot store. */
                    db.close();
                    reject(err);
                }
            };
        });
    }
    function readHandle(handle) {
        return handle.getFile().then(function (f) { return f.text(); }).then(function (text) { return JSON.parse(text); });
    }
    function writeHandle(handle, list) {
        return handle.createWritable().then(function (w) {
            return w.write(libraryFile(list)).then(function () { return w.close(); });
        });
    }

    function parseState(s) {
        var q = new URLSearchParams((s || '').replace(/^[?]/, ''));
        var st = { mode: q.get('m') === 'read' ? 'read' : 'make', sym: q.get('s') || 'ean13', data: q.get('d'), layout: q.get('l') || '', fields: {}, opts: {}, flags: {}, mm: q.get('mw') || '0.33', scan: q.get('scan') || '' };
        q.forEach(function (v, k) {
            if (k.indexOf('f.') === 0) { st.fields[k.slice(2)] = v; }
            if (k.indexOf('x.') === 0) { st.opts[k.slice(2)] = v; }
        });
        var o = q.get('o');
        st.flags = o === null ? { text: true, checks: true, colors: true } : { text: /t/.test(o), checks: /c/.test(o), structure: /s/.test(o), colors: /f/.test(o), annotate: /a/.test(o) };
        return st;
    }

    function stateString(st) {
        var q = new URLSearchParams();
        if (st.mode === 'read') {
            q.set('m', 'read');
            if (st.scan) { q.set('scan', st.scan); }
            return q.toString();
        }
        q.set('s', st.sym);
        if (st.layout) {
            q.set('l', st.layout);
            Object.keys(st.fields).forEach(function (k) { if (st.fields[k] !== '' && st.fields[k] != null) { q.set('f.' + k, st.fields[k]); } });
        } else if (st.data != null) {
            q.set('d', st.data);
        }
        Object.keys(st.opts).forEach(function (k) { if (st.opts[k] !== '' && st.opts[k] != null) { q.set('x.' + k, st.opts[k]); } });
        var f = st.flags, o = (f.text ? 't' : '') + (f.checks ? 'c' : '') + (f.structure ? 's' : '') + (f.colors ? 'f' : '') + (f.annotate ? 'a' : '');
        if (o !== 'tcf') { q.set('o', o || '-'); }
        if (st.mm !== '0.33') { q.set('mw', st.mm); }
        return q.toString();
    }

    function init(root, opts) {
        opts = opts || {};
        var ownUrl = !!opts.ownsUrl;
        root.classList.add('pc-barcodes');
        /* PUDL draws the toolbar into its slot as soon as init returns, while
           the layouts may still be loading, so the slot is here from the
           start, hidden until the tool is built round it. */
        root.innerHTML = '<div class="bt-toolbar" data-toolbar-slot hidden></div><p class="bt-loading">Loading your layouts…</p>';
        var instance = { destroyed: false, destroy: function () { this.destroyed = true; if (this.cleanup) { this.cleanup(); } } };

        var initial = ownUrl && location.search ? location.search : (typeof opts.state === 'string' ? opts.state : '');
        var B = window.barcodeEngine;
        window.barcodeLibrary.load(B).then(function (got) {
            if (instance.destroyed) { return; }
            build(root, opts, B, parseState(initial), instance, got);
        }, function (err) {
            root.innerHTML = '<p class="form-error">The barcode tool did not start: ' + esc(err.message) + '</p>';
        });
        return instance;
    }

    function build(root, opts, B, st, instance, got) {
        var n = ++uid;
        var ownUrl = !!opts.ownsUrl;
        var Lib = window.barcodeLibrary;
        var library = got.layouts;
        /* The demonstration layouts are the engine's, which the scanner
           shares. */
        var DEMOS = B.demos;

        function allLayouts() { return DEMOS.concat(library); }
        function findLayout(id) {
            for (var i = 0; i < library.length; i++) { if (library[i].id === id) { return library[i]; } }
            for (var j = 0; j < DEMOS.length; j++) { if (DEMOS[j].id === id) { return DEMOS[j]; } }
            return null;
        }
        function isDemo(id) { return DEMOS.some(function (d) { return d.id === id; }); }

        /* A state naming a layout but no values (a preset link, say) starts
           from the layout's sample; one naming neither starts from the
           symbology's sample data. */
        function fillDefaults() {
            var L = st.layout ? findLayout(st.layout) : null;
            if (L) {
                st.sym = L.symbology;
                if (!Object.keys(st.fields).length && L.sample) { Object.keys(L.sample).forEach(function (k) { st.fields[k] = L.sample[k]; }); }
                if (!Object.keys(st.opts).length && L.options) { st.opts = Object.assign({}, L.options); }
            } else if (st.data == null) {
                st.data = SAMPLE_DATA[st.sym] || '';
            }
        }
        fillDefaults();

        var symOptions = SYM_GROUPS.map(function (g) {
            return '<optgroup label="' + g[0] + '">' + g[1].map(function (id) {
                return '<option value="' + id + '">' + esc(B.symbologies[id].name) + '</option>';
            }).join('') + '</optgroup>';
        }).join('');

        /* The toolbar's slot, made by init, is kept as the tool is built
           round it, with the toolbar PUDL drew in it (commandTable, below). */
        var slot = root.querySelector('[data-toolbar-slot]');
        root.innerHTML =
            '<div data-role="slot-place"></div>' +
            '<div class="notice" data-role="notice" hidden><span data-role="notice-text"></span>' +
            '<button type="button" class="btn btn-primary" data-role="notice-action" hidden></button>' +
            '<button type="button" class="btn" data-action="notice-close">Dismiss</button></div>' +
            '<section class="bt-editor" data-role="editor" hidden aria-labelledby="bt-editor-title-' + n + '">' +
            '<header class="bt-editor-head">' +
            '<h2 class="bt-editor-title" id="bt-editor-title-' + n + '" data-role="editor-title">New layout</h2>' +
            '<button type="button" class="btn" data-action="editor-cancel">Cancel</button>' +
            '<button type="button" class="btn btn-primary" data-action="editor-save">Save layout</button>' +
            '</header>' +
            '<div class="bt-editor-body" data-role="editor-body">' +
            '<div class="form-error bt-editor-errors" data-role="editor-errors" role="alert" hidden></div>' +
            '<section class="bt-editor-section">' +
            '<h3 class="bt-editor-heading">Layout</h3>' +
            '<div class="bt-editor-grid">' +
            '<div class="form-group"><label class="form-label" for="bt-editor-name-' + n + '">Name</label><input class="form-input" id="bt-editor-name-' + n + '" data-editor="name" autocomplete="off" /></div>' +
            '<div class="form-group"><label class="form-label" for="bt-editor-id-' + n + '">Identifier</label><input class="form-input" id="bt-editor-id-' + n + '" data-editor="id" autocomplete="off" spellcheck="false" /></div>' +
            '<div class="form-group"><label class="form-label" for="bt-editor-sym-' + n + '">Symbology</label><span class="form-select-wrap"><select class="form-select" id="bt-editor-sym-' + n + '" data-editor="sym">' + symOptions + '</select></span></div>' +
            '</div>' +
            '<div class="form-group"><label class="form-label" for="bt-editor-description-' + n + '">Description</label><textarea class="form-textarea" id="bt-editor-description-' + n + '" data-editor="description" rows="2"></textarea></div>' +
            '<div class="form-group"><label class="form-label" for="bt-editor-explain-' + n + '">Explanation</label><input class="form-input" id="bt-editor-explain-' + n + '" data-editor="explain" autocomplete="off" placeholder="Item {item} at {price}." />' +
            '<p class="form-help">The line under the barcode. Write a field\'s identifier in braces to show its value.</p></div>' +
            '</section>' +
            '<section class="bt-editor-section">' +
            '<div class="bt-editor-section-head"><h3 class="bt-editor-heading">Fields, in barcode order</h3>' +
            '<button type="button" class="btn btn-sm" data-action="editor-add-field">Add field</button></div>' +
            '<p class="form-help" data-role="editor-empty" hidden>There are no fields yet. Add one to start the barcode\'s data.</p>' +
            '<ol class="bt-editor-fields" data-role="editor-fields"></ol>' +
            '<p class="form-help">Type test values into the fields on the left.</p>' +
            '</section>' +
            '</div>' +
            '</section>' +
            '<section class="bt-make" data-role="make">' +
            '<p class="bt-layout-desc" data-role="layout-desc" hidden></p>' +
            '<div class="bt-free" data-role="free">' +
            '<div class="form-group">' +
            '<label class="form-label" for="bt-data-' + n + '">Data</label>' +
            '<input class="form-input bt-data" id="bt-data-' + n + '" data-role="data" autocomplete="off" spellcheck="false" />' +
            '<p class="form-help" data-role="help"></p>' +
            '<p class="form-error" data-role="error" hidden></p>' +
            '</div>' +
            '</div>' +
            '<div class="bt-fields" data-role="fields" hidden></div>' +
            '<div class="bt-symopts" data-role="symopts"></div>' +
            '<div class="bt-preview">' +
            '<div class="bt-well"><canvas data-role="canvas" role="img" aria-label="Barcode"></canvas></div>' +
            '<p class="bt-status" data-role="status"></p>' +
            '<ul class="bt-legend" data-role="legend" hidden></ul>' +
            '<p class="bt-explain" data-role="explain" hidden></p>' +
            '</div>' +
            '<div class="bt-actions">' +
            '<div class="bt-controls">' +
            '<label class="check" data-linear-only><input type="checkbox" data-flag="text" /> Text</label>' +
            '<label class="check" data-linear-only><input type="checkbox" data-flag="checks" /> Check digits</label>' +
            '<label class="check"><input type="checkbox" data-flag="structure" /> <span data-role="structure-label">Guards, start and stop</span></label>' +
            '<label class="check" data-role="colors-flag"><input type="checkbox" data-flag="colors" /> Field colors</label>' +
            '</div>' +
            '<div class="bt-controls">' +
            '<span class="form-select-wrap"><select class="form-select" data-role="mm" aria-label="Module width for downloads">' +
            MODULE_MM.map(function (m) { return '<option value="' + m[0] + '">' + m[1] + '</option>'; }).join('') +
            '</select></span>' +
            '<label class="check"><input type="checkbox" data-flag="annotate" /> Highlights in downloads</label>' +
            '</div>' +
            '</div>' +
            '</section>' +
            '<section class="bt-read" data-role="read" hidden>' +
            '<div class="form-group">' +
            '<label class="form-label" for="bt-scan-' + n + '">Scanned or typed value</label>' +
            '<input class="form-input bt-data" id="bt-scan-' + n + '" data-role="scan" autocomplete="off" spellcheck="false" placeholder="Digits, or GS1 element strings like (01)09501101530003(17)271231" />' +
            '<p class="form-help">Every layout whose shape fits is tried, and the value is split into its fields.</p>' +
            '</div>' +
            '<div data-role="results"></div>' +
            '</section>' +
            '<input type="file" accept=".json,application/json" data-role="chooser" hidden />' +
            '<dialog class="dialog bt-json-dialog" data-role="json-dialog" aria-labelledby="bt-json-title-' + n + '">' +
            '<h3 class="dialog-title" id="bt-json-title-' + n + '">Layout JSON</h3>' +
            '<div class="dialog-body">' +
            '<p class="form-help">One layout object. The <a href="' + guideUrl() + '#format" data-win-open="' + GUIDE_KEY + '">guide</a> describes every key. It is saved with your layouts, in ' + esc(Lib.where()) + ', and in a linked layouts file if there is one.</p>' +
            '<textarea class="form-textarea bt-json" data-role="json" spellcheck="false" aria-label="Layout JSON"></textarea>' +
            '<ul class="form-error bt-json-errors" data-role="json-errors" hidden></ul>' +
            '<p class="form-help" data-role="json-file" hidden>Or <a href="#" data-action="edit-file">edit every layout at once</a>, as the file ' + esc(Lib.path || '') + '. This dialog closes without saving.</p>' +
            '</div>' +
            '<div class="dialog-actions">' +
            '<button type="button" class="btn" data-action="json-cancel">Cancel</button>' +
            '<button type="button" class="btn btn-primary" data-action="json-save">Save layout</button>' +
            '</div>' +
            '</dialog>' +
            '<dialog class="dialog bt-remove-dialog" data-role="remove-dialog" aria-labelledby="bt-remove-title-' + n + '">' +
            '<h3 class="dialog-title" id="bt-remove-title-' + n + '">Remove this layout</h3>' +
            '<div class="dialog-body"><p data-role="remove-text"></p></div>' +
            '<div class="dialog-actions">' +
            '<button type="button" class="btn" data-action="remove-cancel">Cancel</button>' +
            '<button type="button" class="btn btn-danger" data-action="remove-confirm">Remove</button>' +
            '</div>' +
            '</dialog>' +
            '<dialog class="dialog bt-help-dialog" data-role="help-dialog" aria-labelledby="bt-help-title-' + n + '">' +
            '<h3 class="dialog-title" id="bt-help-title-' + n + '">Using the barcode tool</h3>' +
            '<div class="dialog-body bt-help">' +
            '<p><strong>Make</strong> draws a barcode. Pick a symbology and type the data; the barcode redraws as you type. ' +
            'A problem is shown under the field, and a wrong check digit comes with a button that puts the right one in.</p>' +
            '<p><strong>Layouts</strong> describe data inside a barcode, such as an item and a price. Choose one from the ' +
            '<strong>Layout</strong> menu to fill in named fields instead of raw digits; each field gets its own color and ' +
            'the line under the barcode explains the result.</p>' +
            '<p><strong>Read</strong> works the other way: paste a scanned value and the tool splits it into the fields of ' +
            'every layout that fits, and checks its check digits and dates.</p>' +
            '<p>The check boxes mark check digits, guards and fields. <strong>Save SVG</strong> is sized in millimetres ' +
            'for printing; saved files leave the highlights out unless you ask for them. ' +
            (hostFs() && hostFs().save ? 'Saving puts a file in your home directory (~) on this site, or downloads it to your computer if you choose. '
                : 'Saving downloads the file to your computer. ') + '<strong>Copy link</strong> ' +
            'reproduces the exact barcode.</p>' +
            '<p>To make, edit, open or save layouts, use the window menu at the left of the title bar, or on the ' +
            'tool\'s own page the <strong>Commands</strong> menu above it. <strong>New layout</strong> and ' +
            '<strong>Edit</strong> open an editor beside the barcode, and the form shows the layout as you change it.</p>' +
            '<p>Your own layouts are kept in ' + esc(Lib.where()) + ', and also in a file on your disk if you link one.</p>' +
            '<p><a href="' + guideUrl() + '" data-win-open="' + GUIDE_KEY + '">Read the full guide</a>, with the layout ' +
            'format and examples.</p>' +
            '</div>' +
            '<div class="dialog-actions">' +
            '<button type="button" class="btn btn-primary" data-action="help-close">Close</button>' +
            '</div>' +
            '</dialog>';

        var q = function (sel) { return root.querySelector(sel); };
        if (slot) { q('[data-role="slot-place"]').replaceWith(slot); slot.hidden = false; }
        var el = {
            notice: q('[data-role="notice"]'), noticeText: q('[data-role="notice-text"]'),
            editor: q('[data-role="editor"]'), editorFields: q('[data-role="editor-fields"]'), editorEmpty: q('[data-role="editor-empty"]'), editorErrors: q('[data-role="editor-errors"]'), editorTitle: q('[data-role="editor-title"]'), editorBody: q('[data-role="editor-body"]'),
            make: q('[data-role="make"]'), read: q('[data-role="read"]'),
            layoutDesc: q('[data-role="layout-desc"]'), free: q('[data-role="free"]'), data: q('[data-role="data"]'),
            help: q('[data-role="help"]'), error: q('[data-role="error"]'), fields: q('[data-role="fields"]'),
            symopts: q('[data-role="symopts"]'), canvas: q('[data-role="canvas"]'), well: q('[data-role="make"] .bt-well'),
            status: q('[data-role="status"]'), legend: q('[data-role="legend"]'), explain: q('[data-role="explain"]'),
            mm: q('[data-role="mm"]'), scan: q('[data-role="scan"]'), results: q('[data-role="results"]'),
            dialog: q('[data-role="json-dialog"]'), json: q('[data-role="json"]'),
            jsonErrors: q('[data-role="json-errors"]'), jsonFile: q('[data-role="json-file"]'), colorsFlag: q('[data-role="colors-flag"]'),
            helpDialog: q('[data-role="help-dialog"]'), noticeAction: q('[data-role="notice-action"]'),
            removeDialog: q('[data-role="remove-dialog"]'), removeText: q('[data-role="remove-text"]'),
            chooser: q('[data-role="chooser"]')
        };

        var current = null;   /* the last good encode, for downloads */
        var currentBands = [], currentColors = [];

        /* A notice may carry one action, such as reopening a linked file,
           which needs the click to count as the reader's own gesture. */
        var noticeHandler = null;
        function notify(msg, actionLabel, handler) {
            el.noticeText.textContent = msg;
            el.noticeAction.hidden = !actionLabel;
            el.noticeAction.textContent = actionLabel || '';
            noticeHandler = handler || null;
            el.notice.hidden = false;
        }

        /* === The library, and a linked file if there is one ============= */

        var linked = null;   /* the linked file's handle, once permission is granted */
        var pendingHandle = null;   /* a linked file awaiting permission after a restart */

        function writeLinked(list) {
            if (!linked) { return; }
            writeHandle(linked, list).catch(function (err) {
                notify('Your layouts are saved in ' + Lib.where() + ', but writing ' + linked.name + ' failed: ' + err.message);
            });
        }

        function saveLibrary(list) {
            writeLinked(list);
            return Lib.save(B, list).then(function (err) {
                if (err) { notify('Your layouts were not saved: ' + err + '.'); }
                return err;
            });
        }

        /* The library changed somewhere else: in an editor, the terminal
           or another tab. The tool takes the new library, passes it on to
           a linked file, and redraws; a layout that has gone is let go. A
           library that can no longer be read is said so, and the tool
           keeps the layouts it has until it is put right. */
        function onLibraryChange() {
            Lib.load(B).then(function (fresh) {
                if (instance.destroyed) { return; }
                if (fresh.error) { notify(fresh.error); return; }
                if (JSON.stringify(fresh.layouts) === JSON.stringify(library)) { return; }
                library = fresh.layouts;
                writeLinked(library);
                if (st.layout && !findLayout(st.layout)) { selectLayout(''); }
                else { buildForm(); update(); }
                renderLayoutMenu();
            });
        }
        var stopWatching = Lib.onChange(onLibraryChange);

        /* Adds layouts from a file to the library: file entries win on the
           same id, and demonstration ids are skipped. */
        function mergeLayouts(fromFile) {
            var incoming = fromFile.filter(function (L) { return !isDemo(L.id); });
            var ids = incoming.map(function (L) { return L.id; });
            library = library.filter(function (L) { return ids.indexOf(L.id) < 0; }).concat(incoming);
            return { added: incoming.length, skipped: fromFile.length - incoming.length };
        }

        function adoptHandle(handle, fromOpen) {
            return readHandle(handle).then(function (obj) {
                var res = B.layouts.validateFile(obj);
                if (!res.ok) { throw new Error(res.errors.slice(0, 2).join(' ')); }
                var inFile = res.layouts.filter(function (L) { return !isDemo(L.id); }).length;
                mergeLayouts(res.layouts);
                linked = handle; pendingHandle = null;
                Lib.save(B, library).then(function (err) { if (err) { notify('Your layouts were not saved: ' + err + '.'); } });
                /* Layouts that were only in the library go into the file. */
                if (library.length !== inFile) { return writeHandle(handle, library); }
            }).then(function () {
                renderLayoutMenu();
                if (fromOpen) { notify('Linked to ' + handle.name + '. Changes to your layouts are written to it.'); }
                else { el.notice.hidden = true; }
            });
        }

        function linkExisting() {
            window.showOpenFilePicker({ types: [{ description: 'Barcode layouts', accept: { 'application/json': ['.json'] } }] })
                .then(function (handles) {
                    var h = handles[0];
                    return h.requestPermission({ mode: 'readwrite' }).then(function (p) {
                        if (p !== 'granted') { throw new Error('permission to write the file was refused'); }
                        return adoptHandle(h, true).then(function () { return idb('put', h).catch(function () { }); });
                    });
                })
                .catch(function (err) { if (err && err.name !== 'AbortError') { notify('The file was not linked: ' + err.message); } });
        }

        function linkNew() {
            window.showSaveFilePicker({ suggestedName: 'barcode-layouts.json', types: [{ description: 'Barcode layouts', accept: { 'application/json': ['.json'] } }] })
                .then(function (h) {
                    return writeHandle(h, library).then(function () {
                        linked = h; pendingHandle = null;
                        renderLayoutMenu();
                        notify('Created ' + h.name + ' with ' + library.length + ' layout' + (library.length === 1 ? '' : 's') + '. Changes are written to it.');
                        return idb('put', h).catch(function () { });
                    });
                })
                .catch(function (err) { if (err && err.name !== 'AbortError') { notify('The file was not created: ' + err.message); } });
        }

        function unlink() {
            var name = linked ? linked.name : pendingHandle ? pendingHandle.name : 'the file';
            linked = null; pendingHandle = null;
            idb('delete').catch(function () { });
            renderLayoutMenu();
            notify('Unlinked ' + name + '. Your layouts stay in ' + Lib.where() + ', and the file is left as it is.');
        }

        /* After a restart the browser keeps the handle but asks again for
           permission, which only a click can grant. */
        function restoreLink() {
            if (!FILE_API) { return; }
            idb('get').then(function (h) {
                if (!h || typeof h.queryPermission !== 'function') { return; }
                return h.queryPermission({ mode: 'readwrite' }).then(function (p) {
                    if (p === 'granted') { return adoptHandle(h, false); }
                    pendingHandle = h;
                    renderLayoutMenu();
                    notify('Your layouts file ' + h.name + ' is linked. Allow the tool to use it again?', 'Reopen', function () {
                        h.requestPermission({ mode: 'readwrite' }).then(function (p2) {
                            if (p2 === 'granted') { return adoptHandle(h, true); }
                            notify('The file stays linked, but the tool cannot use it until you allow it.');
                        }).catch(function (err) { notify('The file could not be reopened: ' + err.message); });
                    });
                });
            }).catch(function () { });
        }

        /* === State plumbing ============================================== */

        var writeTimer = null;
        function commit() {
            var s = stateString(st);
            if (ownUrl) {
                clearTimeout(writeTimer);
                writeTimer = setTimeout(function () {
                    history.replaceState(history.state, '', location.pathname + (s ? '?' + s : '') + location.hash);
                }, 250);
            }
            if (opts.changed) { opts.changed(s); }
        }

        /* === The layout editor ===========================================
           The editor works on a copy, the draft. While it is open the form
           on the left shows the draft, so its fields take test values and
           the barcode is the draft's; nothing reaches the library, the
           address or a link until Save. New starts an empty draft under an
           identifier no layout has; Edit starts from the layout on show, or
           from a copy of it when it is a demonstration. */

        var editorLayout = null;      /* the draft */
        var editorEditingId = null;   /* the saved layout the draft replaces, if any */
        var editorHeading = '';
        var editorIdAuto = false;     /* a new layout's identifier follows its name until typed */
        var editorOpen = new Set();   /* the draft's fields whose settings are showing */
        var formWidth = 0;            /* the form column's preferred width while editing */
        var EDITOR_TYPES = [['fixed', 'Fixed value'], ['number', 'Number'], ['decimal', 'Decimal'], ['text', 'Text'], ['date', 'Date'], ['enum', 'Enumeration'], ['check', 'Check digit']];

        function activeLayout() { return editorLayout || (st.layout ? findLayout(st.layout) : null); }

        function slug(s) { return String(s || '').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '') || 'layout'; }
        function unusedLayoutId(base) {
            var id = base, i = 2;
            while (findLayout(id) && id !== editorEditingId) { id = base + '-' + i++; }
            return id;
        }

        /* The engine's messages name the layout "layout"; in the editor the
           reader already knows which layout. */
        function tidyLayoutError(msg) {
            var s = String(msg).replace(/^layout:? /, '');
            return s.charAt(0).toUpperCase() + s.slice(1);
        }

        function editorDefaultField() {
            var id = 'field', i = 2;
            while (editorLayout.fields.some(function (f) { return f.id === id; })) { id = 'field-' + i++; }
            return { id: id, name: 'New field', type: 'number', length: 4, color: 'gray' };
        }

        function fieldSummary(f) {
            var t = EDITOR_TYPES.filter(function (x) { return x[0] === f.type; })[0], d = '';
            switch (f.type) {
                case 'fixed': d = (Array.isArray(f.values) ? f.values : []).join(' or '); break;
                case 'number': d = f.length ? f.length + ' digits' : ''; break;
                case 'decimal': d = f.length ? f.length + ' digits, ' + (f.decimals || 0) + ' after the point' : ''; break;
                case 'text': d = f.length ? f.length + ' characters' : f.maxLength ? 'up to ' + f.maxLength + ' characters' : ''; break;
                case 'date': d = (f.format || '').toUpperCase(); break;
                case 'enum': var k = Object.keys(f.values || {}).length; d = k + (k === 1 ? ' code' : ' codes'); break;
                case 'check': d = (B.checks[f.algorithm] || {}).name || f.algorithm || ''; break;
            }
            if (f.ai) { d += (d ? ', ' : '') + 'AI (' + f.ai + ')'; }
            return (t ? t[1] : f.type) + (d ? ': ' + d : '');
        }

        function editorFieldRow(f, i) {
            var count = editorLayout.fields.length;
            var fid = function (key) { return 'bt-ef-' + n + '-' + i + '-' + key; };
            var attrs = function (key) { return ' id="' + fid(key) + '" data-editor-field="' + key + '" data-index="' + i + '"'; };
            var group = function (key, label, control, help) {
                return '<div class="form-group"><label class="form-label" for="' + fid(key) + '">' + label + '</label>' + control + (help ? '<p class="form-help">' + help + '</p>' : '') + '</div>';
            };
            var input = function (key, label, value, extra, help) {
                var field = '<input class="form-input"' + attrs(key) + ' value="' + esc(value == null ? '' : value) + '" autocomplete="off" spellcheck="false"' + (extra || '') + ' />';
                /* A count is PUDL's number field (0.74.0), with its minus and plus keys. */
                if (/type="number"/.test(extra || '')) { field = '<span class="number-field">' + field + '</span>'; }
                return group(key, label, field, help);
            };
            var select = function (key, label, choices, current) {
                return group(key, label, '<span class="form-select-wrap"><select class="form-select"' + attrs(key) + '>' + choices.map(function (c) {
                    return '<option value="' + esc(c[0]) + '"' + (c[0] === current ? ' selected' : '') + '>' + esc(c[1]) + '</option>';
                }).join('') + '</select></span>');
            };
            var textarea = function (key, label, value, help) {
                return group(key, label, '<textarea class="form-textarea" rows="2"' + attrs(key) + ' spellcheck="false">' + esc(value) + '</textarea>', help);
            };
            var colors = B.layouts.colors.map(function (c) { return [c, c.charAt(0).toUpperCase() + c.slice(1)]; });
            var body = '<div class="bt-editor-grid">' +
                input('name', 'Name', f.name) + input('id', 'Identifier', f.id) +
                select('type', 'Type', EDITOR_TYPES, f.type) + select('color', 'Color', colors, f.color || 'gray') + '</div>';
            if (f.type === 'fixed') {
                body += textarea('values', 'Allowed values', (Array.isArray(f.values) ? f.values : []).join('\n'), 'One per line, all the same length.');
            } else if (f.type === 'enum') {
                body += textarea('enum', 'Codes', Object.keys(f.values || {}).map(function (k) { return k + '=' + f.values[k]; }).join('\n'), 'One per line, as code=meaning. Every code the same length.');
            } else if (f.type === 'number') {
                body += '<div class="bt-editor-grid">' + input('length', 'Digits', f.length, ' type="number" min="1"') +
                    select('pad', 'Shorter values', [['zeroes', 'Pad with zeroes'], ['none', 'Refuse']], f.pad === 'none' ? 'none' : 'zeroes') + '</div>';
            } else if (f.type === 'decimal') {
                body += '<div class="bt-editor-grid">' + input('length', 'Digits', f.length, ' type="number" min="1"') +
                    input('decimals', 'After the point', f.decimals, ' type="number" min="0"') +
                    input('prefix', 'Shown before', f.prefix, ' placeholder="$"') + input('suffix', 'Shown after', f.suffix, ' placeholder=" kg"') + '</div>';
            } else if (f.type === 'text') {
                body += '<div class="bt-editor-grid">' + input('length', 'Exact length', f.length, ' type="number" min="1"') +
                    input('maxLength', 'Maximum length', f.maxLength, ' type="number" min="1"') + '</div>' +
                    '<p class="form-help">Give one or the other. Only the last field may vary in length, except in GS1-128.</p>';
            } else if (f.type === 'date') {
                body += input('format', 'Format', f.format, ' placeholder="yymmdd"', 'Built from dd, mm, yy and yyyy.');
            } else if (f.type === 'check') {
                var covered = f.over || editorLayout.fields.slice(0, i).filter(function (g) { return g.type !== 'check'; }).map(function (g) { return g.id; });
                body += select('algorithm', 'Algorithm', Object.keys(B.checks).map(function (k) { return [k, B.checks[k].name || k]; }), f.algorithm) +
                    '<fieldset class="bt-editor-checks"><legend class="form-label">Computed over</legend>' +
                    editorLayout.fields.map(function (g, j) {
                        return j === i || g.type === 'check' ? '' : '<label class="check"><input type="checkbox" data-editor-field="over" data-index="' + i + '" value="' + esc(g.id) + '"' +
                            (covered.indexOf(g.id) >= 0 ? ' checked' : '') + ' /> <span data-cover-label="' + esc(g.id) + '">' + esc(g.name || g.id) + '</span></label>';
                    }).join('') + '</fieldset>';
            }
            if (editorLayout.symbology === 'gs1-128') {
                body += input('ai', 'Application Identifier', f.ai, ' placeholder="01"', 'Starts a new element string. Leave empty to continue the one before.');
            }
            body += '<div class="bt-ef-actions">' +
                '<button type="button" class="btn btn-sm" data-action="editor-up" data-index="' + i + '"' + (i ? '' : ' disabled') + '>Move up</button>' +
                '<button type="button" class="btn btn-sm" data-action="editor-down" data-index="' + i + '"' + (i + 1 < count ? '' : ' disabled') + '>Move down</button>' +
                '<button type="button" class="btn btn-sm btn-danger" data-action="editor-delete" data-index="' + i + '">Delete field</button></div>';
            return '<li class="bt-editor-field" data-color="' + esc(f.color || 'gray') + '" data-editor-row="' + i + '">' +
                '<details data-index="' + i + '"' + (editorOpen.has(f) ? ' open' : '') + '>' +
                '<summary><span class="bt-ef-name" data-role="ef-name">' + esc((i + 1) + '. ' + (f.name || f.id || 'Unnamed field')) + '</span>' +
                '<span class="bt-ef-meta" data-role="ef-meta">' + esc(fieldSummary(f)) + '</span></summary>' +
                '<div class="bt-ef-body">' + body + '</div></details></li>';
        }

        /* Brings one row's summary, color and the check boxes that name it
           up to date, without rebuilding the row the reader is typing in. */
        function refreshFieldRow(i) {
            var f = editorLayout.fields[i], row = el.editorFields.querySelector('[data-editor-row="' + i + '"]');
            if (!f || !row) { return; }
            row.setAttribute('data-color', f.color || 'gray');
            row.querySelector('[data-role="ef-name"]').textContent = (i + 1) + '. ' + (f.name || f.id || 'Unnamed field');
            row.querySelector('[data-role="ef-meta"]').textContent = fieldSummary(f);
            el.editorFields.querySelectorAll('[data-cover-label="' + CSS.escape(f.id) + '"]').forEach(function (s) { s.textContent = f.name || f.id; });
        }

        function renderEditor() {
            if (!editorLayout) { return; }
            el.editorTitle.textContent = editorHeading;
            q('[data-editor="name"]').value = editorLayout.name || '';
            q('[data-editor="id"]').value = editorLayout.id || '';
            q('[data-editor="sym"]').value = editorLayout.symbology || 'ean13';
            q('[data-editor="description"]').value = editorLayout.description || '';
            q('[data-editor="explain"]').value = editorLayout.explain || '';
            el.editorFields.innerHTML = editorLayout.fields.map(editorFieldRow).join('');
            if (window.pudlFields) { window.pudlFields.enhance(el.editorFields); }
            el.editorEmpty.hidden = editorLayout.fields.length > 0;
            updateEditorPreview();
        }

        function readEditor() {
            if (!editorLayout) { return; }
            editorLayout.name = q('[data-editor="name"]').value;
            editorLayout.id = q('[data-editor="id"]').value.trim();
            editorLayout.symbology = q('[data-editor="sym"]').value;
            editorLayout.description = q('[data-editor="description"]').value;
            editorLayout.explain = q('[data-editor="explain"]').value;
            var renames = {};
            editorLayout.fields.forEach(function (f, i) {
                var previousId = f.id;
                el.editorFields.querySelectorAll('[data-index="' + i + '"][data-editor-field]').forEach(function (input) {
                    var key = input.getAttribute('data-editor-field'), value = input.value;
                    if (key === 'over') {
                        if (!f.over) { f.over = []; }
                        if (input.checked) { if (f.over.indexOf(value) < 0) { f.over.push(value); } }
                        else { f.over = f.over.filter(function (id) { return id !== value; }); }
                    }
                    else if (key === 'values') { f.values = value.split(/\r?\n/).map(function (v) { return v.trim(); }).filter(Boolean); }
                    else if (key === 'enum') {
                        f.values = {};
                        value.split(/\r?\n/).forEach(function (line) { var p = line.split('='); if (p[0].trim() && p.length > 1) { f.values[p[0].trim()] = p.slice(1).join('=').trim(); } });
                    }
                    else if (key === 'length' || key === 'maxLength' || key === 'decimals') { if (value === '') { delete f[key]; } else { f[key] = +value; } }
                    else if (key === 'ai' || key === 'prefix' || key === 'suffix') { if (value === '') { delete f[key]; } else { f[key] = value; } }
                    else if (key === 'pad') { if (value === 'none') { f.pad = 'none'; } else { delete f.pad; } }
                    else { f[key] = key === 'id' ? value.trim() : value; }
                });
                if (previousId !== f.id) { renames[previousId] = f.id; }
            });
            /* A renamed field keeps its test value and its place in the
               check digits that cover it. */
            Object.keys(renames).forEach(function (from) {
                var to = renames[from];
                editorLayout.fields.forEach(function (f) { if (f.over) { f.over = f.over.map(function (id) { return id === from ? to : id; }); } });
                if (Object.prototype.hasOwnProperty.call(editorLayout.sample, from)) { editorLayout.sample[to] = editorLayout.sample[from]; delete editorLayout.sample[from]; }
                el.editorFields.querySelectorAll('[data-editor-field="over"]').forEach(function (cb) { if (cb.value === from) { cb.value = to; } });
                el.editorFields.querySelectorAll('[data-cover-label]').forEach(function (s) { if (s.getAttribute('data-cover-label') === from) { s.setAttribute('data-cover-label', to); } });
            });
        }

        function updateEditorPreview() {
            buildForm(); update();
        }

        /* A field that changes type keeps only what every type has. */
        function changeEditorType(index, type) {
            var old = editorLayout.fields[index];
            var f = { id: old.id, name: old.name, type: type, color: old.color };
            if (old.ai) { f.ai = old.ai; }
            if (type === 'fixed') { f.values = ['0']; }
            else if (type === 'enum') { f.values = { '0': 'Option' }; }
            else if (type === 'date') { f.format = 'yymmdd'; }
            else if (type === 'check') { f.algorithm = Object.keys(B.checks)[0]; }
            else if (type === 'text') { f.maxLength = 20; }
            else if (type === 'decimal') { f.length = 5; f.decimals = 2; }
            else { f.length = 4; }
            editorLayout.fields[index] = f;
            if (editorOpen.delete(old)) { editorOpen.add(f); }
            delete editorLayout.sample[f.id];
        }

        function openEditor(L) {
            /* The menu can be used from Read, but the draft is shown in Make. */
            if (st.mode !== 'make') { setMode('make'); commit(); }
            if (L) {
                editorLayout = JSON.parse(JSON.stringify(L));
                editorLayout.sample = Object.assign({}, L.sample || {}, st.layout === L.id ? st.fields : {});
                if (isDemo(L.id)) {
                    editorEditingId = null;
                    editorLayout.id = unusedLayoutId(L.id.replace(/^demo-/, 'my-'));
                    editorLayout.name += ' (copy)';
                    editorHeading = 'Copy of ' + L.name;
                } else {
                    editorEditingId = L.id;
                    editorHeading = 'Edit layout';
                }
                editorIdAuto = false;
            } else {
                editorEditingId = null;
                editorLayout = { id: unusedLayoutId('new-layout'), name: 'New layout', symbology: st.sym, description: '', explain: '', sample: {}, fields: [] };
                editorHeading = 'New layout';
                editorIdAuto = true;
            }
            editorOpen = new Set();
            el.editorErrors.hidden = true;
            /* The form keeps the width it has now; the editor is added
               beside it rather than taking width from it. */
            formWidth = root.getBoundingClientRect().width;
            root.style.setProperty('--bt-form-w', formWidth + 'px');
            root.classList.add('bt-editing'); el.editor.hidden = false;
            renderEditor();
            el.editorBody.scrollTop = 0;
            var name = q('[data-editor="name"]');
            name.focus();
            if (!L) { name.select(); }
        }

        function closeEditor(saved) {
            if (!editorLayout) { return; }
            editorLayout = null; editorEditingId = null; editorOpen = new Set();
            root.classList.remove('bt-editing'); el.editor.hidden = true;
            root.style.removeProperty('--bt-form-w');
            if (!saved) { buildForm(); update(); setMode(st.mode); focusLayout(); }
        }

        function saveEditor() {
            readEditor();
            var errs = B.layouts.validate(editorLayout).map(tidyLayoutError);
            var other = findLayout(editorLayout.id);
            if (other && editorLayout.id !== editorEditingId) {
                errs.unshift(isDemo(other.id)
                    ? 'The identifier "' + editorLayout.id + '" belongs to a demonstration layout. Choose another.'
                    : 'The layout "' + other.name + '" already uses the identifier "' + editorLayout.id + '". Choose another.');
            }
            if (errs.length) {
                /* Open the fields the problems name, so each is in view. */
                errs.forEach(function (e) { var m = /^Field (\d+)/.exec(e); if (m && editorLayout.fields[m[1] - 1]) { editorOpen.add(editorLayout.fields[m[1] - 1]); } });
                renderEditor();
                el.editorErrors.innerHTML = '<ul>' + errs.map(function (e) { return '<li>' + esc(e) + '</li>'; }).join('') + '</ul>';
                el.editorErrors.hidden = false;
                el.editorBody.scrollTop = 0;
                return;
            }
            library = library.filter(function (x) { return x.id !== editorLayout.id && x.id !== editorEditingId; });
            library.push(editorLayout); saveLibrary(library); el.editorErrors.hidden = true;
            var id = editorLayout.id; closeEditor(true); selectLayout(id); focusLayout();
        }

        function onEditorToggle(e) {
            var d = e.target;
            if (!editorLayout || d.tagName !== 'DETAILS' || !el.editorFields.contains(d)) { return; }
            var f = editorLayout.fields[+d.getAttribute('data-index')];
            if (f) { if (d.open) { editorOpen.add(f); } else { editorOpen.delete(f); } }
        }

        /* === Layout menu =================================================
           The Layout menu only chooses a layout; what is done with layouts
           is in the commands below it. */

        /* The toolbar's Layout menu (commandTable) is drawn from the layouts
           as it opens; what changes them says so here. */
        function renderLayoutMenu() { commandsChanged(); }
        function commandsChanged() { if (opts.commandsChanged) { opts.commandsChanged(); } }
        /* Back to the Layout menu's button after the editor closes, or to
           the tool when the toolbar has folded it away. */
        function focusLayout() {
            var b = root.querySelector('.bt-toolbar [data-command="layout"]');
            if (b && b.getClientRects().length && !b.disabled) { b.focus(); } else { root.focus({ preventScroll: true }); }
        }
        function layoutItems() {
            function row(d) {
                return { id: 'layout-' + d.id, label: d.name, badge: (B.symbologies[d.symbology] || {}).name || d.symbology, choice: 'bt-layout', value: d.id,
                    checked: st.layout === d.id, run: function () { selectLayout(d.id); } };
            }
            var items = [{ id: 'layout-none', label: 'No Layout (Free Data)', choice: 'bt-layout', value: '', checked: !st.layout, run: function () { selectLayout(''); } },
                { heading: 'Demonstrations' }].concat(DEMOS.map(row));
            if (library.length) {
                items.push({ heading: 'Your layouts (' + (linked ? 'in ' + linked.name : 'in ' + Lib.where()) + ')' });
                items = items.concat(library.map(row));
            }
            return items;
        }
        function symbologyItems() {
            var items = [];
            SYM_GROUPS.forEach(function (g) {
                items.push({ heading: g[0] });
                g[1].forEach(function (id) {
                    items.push({ id: 'sym-' + id, label: B.symbologies[id].name, choice: 'bt-sym', value: id, checked: st.sym === id, run: function () { chooseSym(id); } });
                });
            });
            return items;
        }
        function chooseSym(id) {
            st.sym = id; st.opts = {};
            st.data = SAMPLE_DATA[st.sym] || '';
            buildForm(); update(); commit();
        }
        function copyLink() {
            var base = opts.pageUrl || location.pathname;
            var url = new URL(base, location.origin);
            url.search = stateString(st);
            (navigator.clipboard ? navigator.clipboard.writeText(url.href) : Promise.reject()).then(function () {
                if (window.pudlToast && window.pudlToast.show) { window.pudlToast.show('The link is copied.', 'positive'); } else { notify('The link is copied.'); }
            }, function () { notify(url.href); });
        }

        /* Every command the toolbar and an agent reach (PUDL's command
           table, 0.68.1). The layout commands of the menus below are theirs
           alone, since they are built from the layout on show. While a
           layout is being edited the editor's Cancel and Save are the way
           out, so the rest wait. */
        function commandTable() {
            var L = activeLayout(), make = st.mode === 'make', busy = !!editorLayout, wait = 'Finish editing the layout first';
            var makeOnly = function () { return !make; };
            return [
                { id: 'mode-make', label: 'Make', choice: 'bt-mode', choiceLabel: 'Mode', value: 'make', checked: make, disabled: busy, reason: wait, run: function () { setMode('make'); commit(); } },
                { id: 'mode-read', label: 'Read', choice: 'bt-mode', choiceLabel: 'Mode', value: 'read', checked: !make, disabled: busy, reason: wait, run: function () { setMode('read'); commit(); } },
                { id: 'symbology', label: 'Symbology', current: B.symbologies[L ? L.symbology : st.sym].name, hidden: makeOnly,
                  disabled: !!L, reason: 'The layout sets the symbology', items: symbologyItems },
                { id: 'layout', label: 'Layout', hidden: makeOnly, disabled: busy, reason: wait,
                  current: busy ? (editorLayout.name || 'Untitled') + ' (draft)' : L ? L.name : 'No Layout', items: layoutItems },
                { id: 'svg', label: 'Save SVG…', glyph: 'download', hidden: makeOnly, disabled: busy || !current, reason: busy ? wait : 'There is no barcode to save',
                  run: function () { act('svg'); } },
                { id: 'png', label: 'Save PNG…', glyph: 'image', hidden: makeOnly, disabled: busy || !current, reason: busy ? wait : 'There is no barcode to save',
                  run: function () { act('png'); } },
                { id: 'link', label: 'Copy Link', glyph: 'link', hidden: makeOnly, disabled: busy, reason: wait, run: copyLink },
                { id: 'help', label: 'Help', glyph: 'info', run: function () { el.helpDialog.showModal(); } }
            ];
        }

        /* === Commands ====================================================
           What the tool does with layouts, as distinct from choosing one.
           On a page with PUDL's menu bar they are the Barcode Tool's menu
           there, from menus(); on a page without one, such as a page framed
           in a window, they are PUDL's window menu or Commands menu, from
           commands(), which PUDL ignores while a menu bar is on the page.
           They are built afresh each time a menu opens, so their names are
           always those of the layout on show. While a layout is being
           edited the editor's own Cancel and Save are the only way out, so
           the commands are off. */
        function menus() {
            var L = st.layout ? findLayout(st.layout) : null, demo = L && isDemo(L.id), busy = !!editorLayout;
            var cmd = function (label, run, off) { return { label: label, run: run, disabled: busy || !!off }; };
            var file = [
                cmd('Open layouts…', openLayouts),
                cmd('Save this layout as…', saveLayoutAs, !L),
                cmd('Save all layouts as…', exportLayouts)
            ];
            /* A linked file is a different thing from opening and saving:
               the library kept in step with a file on the reader's disk. */
            if (FILE_API) {
                file.push('-');
                if (linked || pendingHandle) { file.push(cmd('Unlink the layouts file ' + (linked || pendingHandle).name, unlink)); }
                else { file.push(cmd('Create a linked layouts file…', linkNew), cmd('Link an existing layouts file…', linkExisting)); }
            }
            return {
                titles: [
                    { label: 'Barcode Tool', items: host().identity ? host().identity(root) : [] },
                    /* File comes first after the tool's own name, as it
                       does in every desktop application. */
                    { id: 'file', label: 'File', items: file },
                    {
                        label: 'Layout', items: [
                            cmd('New layout…', function () { openEditor(null); }),
                            cmd(L ? (demo ? 'Edit a copy of ' : 'Edit ') + L.name + '…' : 'Edit the layout…', function () { openEditor(L); }, !L),
                            '-',
                            cmd('New layout from JSON…', function () { openJson(null); }),
                            cmd(demo ? 'Copy this layout as JSON…' : 'Edit this layout as JSON…', function () { openJson(L); }, !L),
                            '-',
                            { label: 'Remove this layout…', run: askRemove, danger: true, disabled: busy || !L || demo }
                        ]
                    }
                ], into: { help: [{ label: 'Barcode Tool help', run: function () { el.helpDialog.showModal(); } }] }
            };
        }

        /* The same commands as one list, for PUDL's window menu on a page
           with no menu bar; those that are off are left out, as before. */
        function commands() {
            if (editorLayout) { return []; }
            var out = [];
            menus().titles.slice(1).forEach(function (t) {
                t.items.forEach(function (it) { if (it && it.run && !it.disabled) { out.push({ label: it.label, run: it.run }); } });
            });
            return out;
        }

        function saveLayoutAs() {
            var cur = findLayout(st.layout);
            if (!cur) { return; }
            var copy = JSON.parse(JSON.stringify(cur));
            /* A demonstration saves as a copy under its own id, so it
               imports as a layout of your own. */
            if (isDemo(copy.id)) { copy.id = copy.id.replace(/^demo-/, 'my-'); copy.name += ' (copy)'; }
            saveFile(copy.id + '.json', 'Save this layout as', new Blob([libraryFile([copy])], { type: 'application/json' }));
        }

        /* Everything the menu lists, demonstrations included; opening the
           file again skips those. */
        function exportLayouts() {
            saveFile('all-layouts.json', 'Save all layouts as', new Blob([libraryFile(DEMOS.concat(library))], { type: 'application/json' }));
        }

        function askRemove() {
            var L = findLayout(st.layout);
            if (!L || isDemo(L.id)) { return; }
            el.removeText.textContent = 'Remove "' + L.name + '" from your layouts? Links that use it will no longer show its fields.' +
                (linked ? ' It is also removed from ' + linked.name + '.' : '');
            el.removeDialog.showModal();
        }

        function removeLayout() {
            el.removeDialog.close();
            library = library.filter(function (L) { return L.id !== st.layout; });
            saveLibrary(library);
            selectLayout('');
        }

        function selectLayout(id) {
            var L = id ? findLayout(id) : null;
            st.layout = L ? L.id : '';
            if (L) {
                st.sym = L.symbology;
                st.fields = {};
                if (L.sample) { Object.keys(L.sample).forEach(function (k) { st.fields[k] = L.sample[k]; }); }
                st.opts = Object.assign({}, L.options || {});
            } else {
                st.opts = {};
                if (st.data == null || st.data === '') { st.data = SAMPLE_DATA[st.sym] || ''; }
            }
            buildForm();
            update();
            commit();
        }

        /* === The make form =============================================== */

        function buildSymOptions() {
            var L = activeLayout(), sym = L ? L.symbology : st.sym;
            var def = B.symbologies[sym], html = '';
            var options = L ? L.options || {} : st.opts;
            var locked = !!L;
            (def.options || []).forEach(function (o) {
                if (o === 'check') {
                    html += '<label class="check"><input type="checkbox" data-opt="check"' + (options.check ? ' checked' : '') + (locked ? ' disabled' : '') + ' /> ' +
                        (sym === 'code39' ? 'Modulo 43 check character' : sym === 'codabar' ? 'Modulo 16 check character' : 'Add a check digit') + '</label>';
                } else if (o === 'bearer') {
                    html += '<label class="check"><input type="checkbox" data-opt="bearer"' + (options.bearer !== '0' ? ' checked' : '') + (locked ? ' disabled' : '') + ' /> Bearer bars</label>';
                } else if (o === 'start' || o === 'stop') {
                    var v = (options[o] || 'A').toUpperCase();
                    html += '<label class="bt-inline">' + (o === 'start' ? 'Start' : 'Stop') + ' <span class="form-select-wrap"><select class="form-select" data-opt="' + o + '"' + (locked ? ' disabled' : '') + '>' +
                        ['A', 'B', 'C', 'D'].map(function (c) { return '<option' + (c === v ? ' selected' : '') + '>' + c + '</option>'; }).join('') + '</select></span></label>';
                } else if (o === 'ecc') {
                    var lv = (options.ecc || 'M').toUpperCase();
                    html += '<label class="bt-inline">Error correction <span class="form-select-wrap"><select class="form-select" data-opt="ecc"' + (locked ? ' disabled' : '') + '>' +
                        ECC_LEVELS.map(function (e) { return '<option value="' + e[0] + '"' + (e[0] === lv ? ' selected' : '') + '>' + e[1] + '</option>'; }).join('') + '</select></span></label>';
                }
            });
            el.symopts.innerHTML = html;
            el.symopts.hidden = !html;
        }

        function buildForm() {
            var L = activeLayout(), sym = L ? L.symbology : st.sym;
            el.free.hidden = !!L;
            el.fields.hidden = !L;
            el.colorsFlag.hidden = !L;
            el.layoutDesc.hidden = !(L && L.description);
            el.layoutDesc.textContent = L && L.description ? L.description : '';
            if (!editorLayout && st.layout && !L) {
                notify('This link uses the layout "' + st.layout + '", which is not in your layouts. Import it to see its fields.');
                st.layout = '';
            }
            if (!L) {
                el.data.value = st.data || '';
                el.help.textContent = B.symbologies[sym].help;
            } else {
                var html = '';
                L.fields.forEach(function (f) {
                    var color = f.color || 'gray';
                    var len = f.type === 'enum' && (!f.values || !Object.keys(f.values).length) ? null : B.layouts.fieldLength(f);
                    var input;
                    if (f.type === 'check') {
                        input = '<output class="bt-computed" data-field-out="' + esc(f.id) + '"></output>';
                    } else if (f.type === 'fixed' && Array.isArray(f.values) && f.values.length === 1) {
                        input = '<output class="bt-computed" data-field-out="' + esc(f.id) + '">' + esc(f.values[0]) + '</output>';
                    } else if (f.type === 'fixed' || f.type === 'enum') {
                        var opts = f.type === 'fixed'
                            ? (Array.isArray(f.values) ? f.values : []).map(function (v) { return '<option value="' + esc(v) + '">' + esc(v) + '</option>'; })
                            : Object.keys(f.values || {}).map(function (k) { return '<option value="' + esc(k) + '">' + esc(k) + ': ' + esc(f.values[k]) + '</option>'; });
                        input = '<span class="form-select-wrap"><select class="form-select" data-field="' + esc(f.id) + '" id="bt-f-' + n + '-' + esc(f.id) + '">' + opts.join('') + '</select></span>';
                    } else {
                        var ph = f.type === 'date' ? f.format : f.type === 'decimal' ? (f.decimals ? '0.' + '0'.repeat(f.decimals) : '0') : '';
                        var size = Math.max(4, Math.min(24, (len || f.maxLength || 8) + 2));
                        input = '<input class="form-input" data-field="' + esc(f.id) + '" id="bt-f-' + n + '-' + esc(f.id) + '" autocomplete="off" spellcheck="false" size="' + size + '" placeholder="' + esc(ph) + '" />';
                    }
                    html += '<div class="bt-field" data-color="' + esc(color) + '" data-field-box="' + esc(f.id) + '">' +
                        '<label class="bt-field-name" for="bt-f-' + n + '-' + esc(f.id) + '">' + esc(f.name) + ' <span class="bt-pos" data-field-pos="' + esc(f.id) + '"></span></label>' +
                        input +
                        '<span class="bt-field-note" data-field-note="' + esc(f.id) + '"></span>' +
                        '</div>';
                });
                el.fields.innerHTML = html;
                var values = editorLayout ? editorLayout.sample || {} : st.fields;
                L.fields.forEach(function (f) {
                    var inp = el.fields.querySelector('[data-field="' + CSS.escape(f.id) + '"]');
                    if (inp) { inp.value = values[f.id] != null ? values[f.id] : (inp.tagName === 'SELECT' ? inp.value : ''); }
                });
            }
            buildSymOptions();
            /* A matrix symbol has no text line and no check characters to
               mark; its structure is the finder patterns. */
            var matrix = B.symbologies[sym].family === 'matrix';
            root.querySelectorAll('[data-linear-only]').forEach(function (l) { l.hidden = matrix; });
            q('[data-role="structure-label"]').textContent = matrix ? 'Finder patterns' : 'Guards, start and stop';
            renderLayoutMenu();
            root.querySelectorAll('[data-flag]').forEach(function (cb) { cb.checked = !!st.flags[cb.getAttribute('data-flag')]; cb.disabled = !!editorLayout; });
            root.querySelectorAll('[data-opt]').forEach(function (input) { if (editorLayout) { input.disabled = true; } });
            el.mm.value = st.mm; el.mm.disabled = !!editorLayout;
        }

        /* === Encoding and drawing ======================================== */

        function symOpts(opts) {
            opts = opts || {};
            return {
                check: opts.check === '1' || opts.check === true || opts.check === 'true',
                bearer: opts.bearer !== '0',
                start: opts.start, stop: opts.stop, ecc: opts.ecc
            };
        }

        function update() {
            /* The toolbar draws next frame, after this has said whether
               there is a barcode to save. */
            commandsChanged();
            var L = activeLayout(), sym = L ? L.symbology : st.sym;
            var values = editorLayout ? editorLayout.sample || {} : st.fields;
            var input, composed = null, hriOverride;
            currentBands = []; currentColors = [];
            el.legend.hidden = true; el.explain.hidden = true;
            if (editorLayout) {
                var errors = B.layouts.validate(editorLayout);
                if (!editorLayout.fields.length || errors.length) {
                    el.status.textContent = editorLayout.fields.length ? tidyLayoutError(errors[0]) : 'Add a field to start the layout.';
                    el.status.classList.toggle('bt-status-error', editorLayout.fields.length > 0);
                    current = null; clearCanvas(); return;
                }
            }
            if (L) {
                composed = B.layouts.compose(L, values);
                var pos = 0;
                composed.spans.forEach(function (sp) {
                    var posEl = el.fields.querySelector('[data-field-pos="' + CSS.escape(sp.id) + '"]');
                    if (posEl) { posEl.textContent = sp.to > sp.from ? (sp.to - sp.from === 1 ? 'position ' + (sp.from + 1) : 'positions ' + (sp.from + 1) + '–' + sp.to) : ''; }
                });
                L.fields.forEach(function (f) {
                    var r = composed.fields[f.id];
                    var note = el.fields.querySelector('[data-field-note="' + CSS.escape(f.id) + '"]');
                    var inp = el.fields.querySelector('[data-field="' + CSS.escape(f.id) + '"]');
                    var out = el.fields.querySelector('[data-field-out="' + CSS.escape(f.id) + '"]');
                    if (out && f.type === 'check') { out.textContent = r.error ? '…' : r.raw; }
                    if (inp) { inp.setAttribute('aria-invalid', r.error ? 'true' : 'false'); }
                    if (note) {
                        /* The note says something the input does not: an
                           error, a meaning, a formatted date, or the padded
                           form actually encoded. */
                        var typed = values[f.id] == null ? '' : String(values[f.id]).trim();
                        var text = '';
                        if (r.error) { text = r.error; }
                        else if (r.meaning) { text = r.meaning; }
                        else if (f.type === 'date') { text = r.display; }
                        else if (f.type !== 'fixed' && f.type !== 'check' && r.raw !== typed) { text = 'Encoded as ' + r.raw; }
                        note.textContent = text;
                        note.classList.toggle('bt-note-error', !!r.error);
                    }
                });
                input = composed.input;
                if (!composed.ok) {
                    el.status.textContent = 'Fill in the fields to see the barcode.';
                    el.status.classList.add('bt-status-error');
                    current = null; clearCanvas();
                    return;
                }
            } else {
                input = st.data || '';
            }

            var r = B.encode(sym, input, symOpts(L ? L.options : st.opts));
            if (!L) {
                el.data.setAttribute('aria-invalid', r.ok ? 'false' : 'true');
                el.error.hidden = r.ok;
                el.error.innerHTML = r.ok ? '' : esc(r.error) + (r.fix ? ' <button type="button" class="btn" data-action="fix" data-fix="' + esc(r.fix) + '">Use ' + esc(r.fix) + '</button>' : '');
            }
            if (!r.ok) {
                el.status.textContent = L ? r.error : '';
                el.status.classList.toggle('bt-status-error', !!L);
                clearCanvas();
                current = null;
                return;
            }
            current = r.symbol;
            if (L) {
                hriOverride = B.layouts.hri(L, composed.fields, r.symbol.hri);
                if (hriOverride !== r.symbol.hri) {
                    current = Object.assign({}, r.symbol, { hri: hriOverride, hriMap: null, textMode: hriOverride == null ? 'center' : (r.symbol.textMode === 'ean' && hriOverride === r.symbol.hri ? 'ean' : 'center') });
                }
                if (st.flags.colors) { colorFields(L, composed, r.symbol); }
                renderLegend(L, composed);
                var ex = B.layouts.explain(L, composed.fields);
                el.explain.textContent = ex;
                el.explain.hidden = !ex;
            }
            el.status.classList.remove('bt-status-error');
            el.status.textContent = statusLine(r);
            draw();
        }

        function statusLine(r) {
            var parts = [];
            if (r.check != null) { parts.push((r.computed === false ? 'Check digit ' + r.check + ' verified.' : 'Check digit ' + r.check + ' computed.')); }
            if (r.expanded) { parts.push('Expands to UPC-A ' + r.expanded + '.'); }
            if (r.symbol && r.symbol.symbology === 'ean13') {
                var name = B.gs1.prefixName(r.symbol.data);
                if (name) { parts.push('GS1 prefix ' + r.symbol.data.slice(0, 3) + ': ' + name + '.'); }
            }
            if (r.elements) { parts.push(r.elements.map(function (e) { return '(' + e.ai + ') ' + e.info.name; }).join(', ') + '.'); }
            if (r.version) { parts.push('Version ' + r.version + ', ' + r.symbol.size + ' by ' + r.symbol.size + ' modules, error correction level ' + r.ecc + '.'); }
            return parts.join(' ');
        }

        function colorFields(L, composed, sym) {
            composed.spans.forEach(function (sp) {
                var f = null;
                for (var i = 0; i < L.fields.length; i++) { if (L.fields[i].id === sp.id) { f = L.fields[i]; } }
                var color = sp.ai ? B.palette.gray : B.palette[(f && f.color) || 'gray'];
                var x0 = Infinity, x1 = -Infinity;
                for (var k = sp.from; k < sp.to; k++) {
                    currentColors[k] = color;
                    var c = sym.chars[k];
                    if (c && c.x0 != null) { x0 = Math.min(x0, c.x0); x1 = Math.max(x1, c.x1); }
                }
                if (x1 > x0) { currentBands.push({ x0: x0, x1: x1, color: color }); }
            });
        }

        function renderLegend(L, composed) {
            var html = '';
            composed.spans.forEach(function (sp) {
                if (sp.ai) { return; }
                var f = L.fields.filter(function (x) { return x.id === sp.id; })[0];
                var r = composed.fields[sp.id];
                var shown = r.meaning ? r.display + ' (' + r.meaning + ')' : r.display;
                html += '<li data-color="' + esc(f.color || 'gray') + '"><span class="bt-swatch" aria-hidden="true"></span>' +
                    '<span class="bt-legend-name">' + esc(f.name) + '</span> ' +
                    '<span class="bt-pos">' + (sp.to - sp.from === 1 ? 'position ' + (sp.from + 1) : 'positions ' + (sp.from + 1) + '–' + sp.to) + '</span> ' +
                    '<span class="bt-legend-value num">' + esc(shown) + '</span></li>';
            });
            el.legend.innerHTML = html;
            el.legend.hidden = !html;
        }

        function drawOptions(forExport) {
            var annotate = !forExport || st.flags.annotate;
            var bands = annotate ? B.roleBands(current, { checks: st.flags.checks, structure: st.flags.structure }) : [];
            var colors = [];
            if (annotate) {
                bands = currentBands.concat(bands);
                colors = currentColors.slice();
                if (st.flags.checks) { current.chars.forEach(function (c, i) { if (c.role === 'check') { colors[i] = B.roleColors.check; } }); }
            }
            return { showText: !!st.flags.text, bands: bands, charColors: colors };
        }

        function clearCanvas() {
            el.canvas.width = 1; el.canvas.height = 1;
            el.canvas.style.width = '0px'; el.canvas.style.height = '0px';
        }

        function drawSymbol(symbol, o) {
            var g = B.geometry(symbol, o);
            var dpr = window.devicePixelRatio || 1;
            var avail = el.well.clientWidth - 24;
            if (avail <= 0) { return; }
            /* The symbol fills the width it has, but never at less than two
               screen pixels a module: below that, bars one and two modules
               wide look alike and the text is too small to read. A wide
               symbol at that size is wider than the well, which then widens
               a window sized by its content, or scrolls where it cannot. */
            var fit = Math.floor(avail * dpr / g.width);
            var px = Math.max(Math.ceil(2 * dpr), Math.min(Math.floor((symbol.matrix ? 8 : 4) * dpr), fit));
            o.px = px; o.cssScale = dpr;
            B.render(el.canvas, symbol, o);
            el.canvas.setAttribute('aria-label', B.symbologies[symbol.symbology].name + ' barcode encoding ' + (symbol.hri || symbol.data));
            /* A draft that turns wider than the form, such as one switched
               to GS1-128, widens the form's column to hold it, as the
               window would if the editor were closed. It never narrows it,
               so the editor does not move about while the draft changes. */
            if (editorLayout) {
                var wanted = Math.ceil(el.canvas.getBoundingClientRect().width + el.well.offsetWidth - avail);
                if (wanted > formWidth) {
                    formWidth = wanted;
                    root.style.setProperty('--bt-form-w', formWidth + 'px');
                }
            }
        }

        function draw() {
            if (current) { drawSymbol(current, drawOptions(false)); }
        }

        /* === Read mode =================================================== */

        function renderRead() {
            var s = el.scan.value.trim();
            st.scan = s;
            if (!s) { el.results.innerHTML = ''; return; }
            var html = '';
            var matches = [];
            allLayouts().forEach(function (L) {
                if (B.layouts.validate(L).length) { return; }
                var m = B.layouts.interpret(L, s);
                if (m) { matches.push(m); }
            });
            matches.sort(function (a, b) { return a.issues.length - b.issues.length; });
            matches.forEach(function (m) {
                var L = m.layout, c = m.composed;
                html += '<div class="card bt-match">' +
                    '<h4 class="bt-match-title">' + esc(L.name) + ' <span class="bt-menu-sym">' + esc(B.symbologies[L.symbology].name) + '</span></h4>' +
                    (m.issues.length ? '<div class="notice warn">' + m.issues.map(esc).join('<br />') + '</div>' : '') +
                    '<div class="data-table-wrap"><table class="data-table"><thead><tr><th scope="col">Field</th><th scope="col">Positions</th><th scope="col">Encoded</th><th scope="col">Meaning</th></tr></thead><tbody>';
                c.spans.forEach(function (sp) {
                    if (sp.ai) { return; }
                    var f = L.fields.filter(function (x) { return x.id === sp.id; })[0];
                    var r = c.fields[sp.id], raw = m.values[sp.id];
                    html += '<tr data-color="' + esc(f.color || 'gray') + '"><td><span class="bt-swatch" aria-hidden="true"></span>' + esc(f.name) + '</td>' +
                        '<td class="num">' + (sp.from + 1) + (sp.to - sp.from > 1 ? '–' + sp.to : '') + '</td>' +
                        '<td class="num">' + esc(raw) + '</td>' +
                        '<td>' + esc(r.error ? r.error : (r.meaning || r.display)) + '</td></tr>';
                });
                html += '</tbody></table></div>';
                var ex = B.layouts.explain(L, c.fields);
                if (ex) { html += '<p class="bt-explain">' + esc(ex) + '</p>'; }
                html += '<button type="button" class="btn" data-action="open-layout" data-layout="' + esc(L.id) + '" data-values="' + esc(JSON.stringify(m.values)) + '">Open in Make</button></div>';
            });
            var ids = B.identify(s);
            if (ids.length) {
                html += '<div class="card bt-match"><h4 class="bt-match-title">' + (matches.length ? 'Also, as a plain symbol' : 'As a plain symbol') + '</h4><ul class="bt-ident">';
                ids.forEach(function (d) {
                    if (d.elements) {
                        html += '<li><strong>' + esc(d.title) + '</strong><ul>' + d.elements.map(function (e) {
                            return '<li><span class="num">(' + esc(e.ai) + ')</span> ' + esc(e.name) + ': <span class="num">' + esc(e.shown) + '</span></li>';
                        }).join('') + '</ul></li>';
                    } else {
                        html += '<li><strong>' + esc(d.title) + '</strong>: ' + (d.problem ? esc(d.problem) : (d.valid ? 'valid.' : 'not valid.') + (d.note ? ' ' + esc(d.note) : '')) + '</li>';
                    }
                });
                html += '</ul></div>';
            }
            if (!matches.length && !ids.length) {
                html = '<p class="form-help">No layout fits this value, and it is not a standard retail symbol. Import the layout it was made with, or check its length.</p>';
            }
            el.results.innerHTML = html;
        }

        function setMode(mode) {
            if (mode === 'read' && editorLayout) { closeEditor(); }
            st.mode = mode;
            el.make.hidden = mode !== 'make';
            el.read.hidden = mode !== 'read';
            commandsChanged();
            if (mode === 'read') { el.scan.value = st.scan || ''; renderRead(); }
            else { draw(); }
        }

        /* === JSON authoring and the library ============================== */

        var editingId = null;
        function openJson(L) {
            editingId = L && !isDemo(L.id) ? L.id : null;
            var obj = L ? JSON.parse(JSON.stringify(L)) : {
                id: 'my-layout', name: 'My layout', symbology: 'ean13', explain: '',
                fields: [{ id: 'prefix', name: 'Prefix', type: 'fixed', values: ['20'], color: 'blue' }, { id: 'item', name: 'Item', type: 'number', length: 10, color: 'gray' }]
            };
            if (L && isDemo(L.id)) { obj.id = L.id.replace(/^demo-/, 'my-'); }
            el.json.value = JSON.stringify(obj, null, 2);
            el.jsonErrors.hidden = true;
            el.jsonFile.hidden = !canEditFile();
            el.dialog.showModal();
        }

        /* On this site the library is also a file, and whichever applet
           the site has for opening files can edit it whole. The tool asks
           through PUDL's requests (0.27.0) and offers it only when one
           answers; under an older PUDL, which has no requests, it offers
           nothing. */
        function canEditFile() { return !!Lib.path && !!window.pudlApplets.can && window.pudlApplets.can('open', 'file'); }
        function editFile() {
            el.dialog.close();
            if (!window.pudlApplets.request || !window.pudlApplets.request('open', { path: Lib.path, kind: 'file' }, root)) {
                notify('Nothing on this page can open the layouts file.');
            }
        }

        function saveJson() {
            var obj;
            try { obj = JSON.parse(el.json.value); }
            catch (err) { showJsonErrors(['This is not valid JSON: ' + err.message]); return; }
            var errs = B.layouts.validate(obj);
            if (!errs.length && isDemo(obj.id)) { errs.push('The id "' + obj.id + '" belongs to a demonstration layout; choose another.'); }
            if (errs.length) { showJsonErrors(errs); return; }
            library = library.filter(function (x) { return x.id !== obj.id && x.id !== editingId; });
            library.push(obj);
            saveLibrary(library);
            el.dialog.close();
            selectLayout(obj.id);
        }

        function showJsonErrors(errs) {
            el.jsonErrors.innerHTML = errs.map(function (e) { return '<li>' + esc(e) + '</li>'; }).join('');
            el.jsonErrors.hidden = false;
        }

        /* Adds the layouts in a file's text to the library. */
        function importText(text, name) {
            var obj;
            try { obj = JSON.parse(text); }
            catch (err) { notify(name + ' is not valid JSON.'); return; }
            var res = B.layouts.validateFile(obj);
            if (!res.ok) { notify('Nothing imported from ' + name + '. ' + res.errors.slice(0, 3).join(' ') + (res.errors.length > 3 ? ' (and ' + (res.errors.length - 3) + ' more)' : '')); return; }
            var m = mergeLayouts(res.layouts);
            saveLibrary(library);
            renderLayoutMenu();
            notify('Added ' + m.added + ' layout' + (m.added === 1 ? '' : 's') + ' from ' + name +
                (m.skipped ? ', skipping ' + m.skipped + ' demonstration layout' + (m.skipped === 1 ? '' : 's') + ' the tool already has' : '') +
                '. They are kept in ' + Lib.where() + (linked ? ' and ' + linked.name + '.' : '.'));
        }

        /* === Open and Save as ============================================
           The host's own dialogs (pudlHost.fs.open and save), where it has
           them: files go to and come from wherever it keeps them, and the
           reader's computer. Without them, Open takes a file from the
           computer and Save as downloads. */

        var lastDir = '~';
        function remember(path) { if (path) { lastDir = path.slice(0, path.lastIndexOf('/')) || '/'; } }
        function ownLibrary(path) { return Lib.path && path === Lib.path ? path + ' is this tool\'s own library, which it already has.' : null; }

        function openLayouts() {
            var f = hostFs();
            if (!f || !f.open) { el.chooser.click(); return; }
            f.open({ title: 'Open layouts', accept: ['.json'], start: lastDir, host: root, check: ownLibrary }).then(function (got) {
                if (!got) { return; }
                remember(got.path);
                importText(got.text, got.name);
            }, function (err) { notify('The file could not be opened: ' + (err && err.message || err) + '.'); });
        }

        function saveFile(name, title, blob) {
            var f = hostFs();
            if (!f || !f.save) { download(name, blob); return; }
            f.save({ title: title, name: name, blob: blob, start: lastDir, host: root,
                check: function (path) { return Lib.path && path === Lib.path ? path + ' is this tool\'s own library; use Open layouts to add to it instead.' : null; }
            }).then(function (got) {
                if (!got) { return; }
                if (got.download) { download(got.download, blob); return; }
                remember(got.path);
                notify('Saved ' + got.path + '.');
            }, function (err) { notify('Not saved: ' + (err && err.message || err) + '.'); });
        }

        function download(name, blob) {
            var a = document.createElement('a');
            a.href = URL.createObjectURL(blob);
            a.download = name;
            document.body.appendChild(a);
            a.click();
            setTimeout(function () { URL.revokeObjectURL(a.href); a.remove(); }, 1000);
        }

        function fileBase() {
            var s = (current && (current.data || '')) || 'barcode';
            return (st.sym + '-' + s).replace(/[^A-Za-z0-9-]+/g, '_').slice(0, 60);
        }

        /* === Wiring ====================================================== */

        function onClick(e) {
            var t = e.target.closest('[data-action]');
            if (!t || !root.contains(t)) { return; }
            var action = t.getAttribute('data-action');
            switch (action) {
                case 'notice-close': el.notice.hidden = true; break;
                case 'help-close': el.helpDialog.close(); break;
                case 'editor-cancel': closeEditor(); break;
                case 'editor-save': saveEditor(); break;
                case 'editor-add-field': {
                    readEditor();
                    var added = editorDefaultField();
                    editorLayout.fields.push(added); editorOpen.add(added);
                    renderEditor();
                    var addedName = q('#bt-ef-' + n + '-' + (editorLayout.fields.length - 1) + '-name');
                    if (addedName) { addedName.focus(); addedName.select(); }
                    break;
                }
                case 'editor-delete': {
                    readEditor();
                    var gone = editorLayout.fields.splice(+t.getAttribute('data-index'), 1)[0];
                    editorOpen.delete(gone);
                    delete editorLayout.sample[gone.id];
                    editorLayout.fields.forEach(function (f) { if (f.over) { f.over = f.over.filter(function (id) { return id !== gone.id; }); } });
                    renderEditor();
                    q('[data-action="editor-add-field"]').focus();
                    break;
                }
                case 'editor-up':
                case 'editor-down': {
                    readEditor();
                    var from = +t.getAttribute('data-index'), to = from + (action === 'editor-up' ? -1 : 1);
                    if (to < 0 || to >= editorLayout.fields.length) { break; }
                    editorLayout.fields.splice(to, 0, editorLayout.fields.splice(from, 1)[0]);
                    renderEditor();
                    var again = q('[data-action="' + action + '"][data-index="' + to + '"]');
                    if (again && again.disabled) { again = q('[data-action="' + (action === 'editor-up' ? 'editor-down' : 'editor-up') + '"][data-index="' + to + '"]'); }
                    if (again) { again.focus(); }
                    break;
                }
                case 'fix': st.data = t.getAttribute('data-fix'); el.data.value = st.data; update(); commit(); break;
                case 'json-cancel': el.dialog.close(); break;
                case 'edit-file': e.preventDefault(); editFile(); break;
                case 'json-save': saveJson(); break;
                case 'remove-cancel': el.removeDialog.close(); break;
                case 'remove-confirm': removeLayout(); break;
                case 'open-layout': {
                    var vals = JSON.parse(t.getAttribute('data-values'));
                    var L = findLayout(t.getAttribute('data-layout'));
                    st.layout = L.id; st.sym = L.symbology; st.opts = Object.assign({}, L.options || {});
                    st.fields = {};
                    L.fields.forEach(function (f) { if (f.type !== 'check') { st.fields[f.id] = vals[f.id]; } });
                    buildForm(); setMode('make'); update(); commit();
                    break;
                }
            }
        }

        /* Save SVG and Save PNG, sized for printing at the module width
           chosen under the barcode. */
        function act(kind) {
            if (!current) { return; }
            if (kind === 'svg') {
                var o = drawOptions(true); o.moduleMM = +st.mm;
                saveFile(fileBase() + '.svg', 'Save SVG', new Blob([B.toSVG(current, o)], { type: 'image/svg+xml' }));
                return;
            }
            var c = document.createElement('canvas'), po = drawOptions(true);
            po.px = Math.max(1, Math.round(+st.mm / 25.4 * 300));
            B.render(c, current, po);
            c.toBlob(function (blob) { saveFile(fileBase() + '.png', 'Save PNG', blob); }, 'image/png');
        }

        function onInput(e) {
            var t = e.target;
            /* Typing in the editor updates the draft and the form beside it,
               and leaves the editor's own rows alone so focus stays put. */
            if (editorLayout && el.editor.contains(t) && (t.hasAttribute('data-editor') || t.hasAttribute('data-editor-field'))) {
                readEditor(); el.editorErrors.hidden = true;
                var key = t.getAttribute('data-editor');
                if (key === 'id') { editorIdAuto = false; }
                if (key === 'name' && editorIdAuto) { editorLayout.id = unusedLayoutId(slug(t.value)); q('[data-editor="id"]').value = editorLayout.id; }
                if (t.hasAttribute('data-editor-field')) { refreshFieldRow(+t.getAttribute('data-index')); }
                updateEditorPreview(); return;
            }
            if (t === el.data) { st.data = t.value; update(); commit(); return; }
            if (t === el.scan) { renderRead(); commit(); return; }
            if (t.hasAttribute('data-field')) {
                var id = t.getAttribute('data-field');
                if (editorLayout) { editorLayout.sample[id] = t.value; update(); }
                else { st.fields[id] = t.value; update(); commit(); }
                return;
            }
        }

        function onChange(e) {
            var t = e.target;
            /* Open layouts on a host without a file dialog of its own. */
            if (t === el.chooser) {
                var picked = t.files && t.files[0];
                t.value = '';
                if (picked) { picked.text().then(function (text) { importText(text, picked.name); }, function (err) { notify(picked.name + ' could not be read: ' + err.message); }); }
                return;
            }
            /* Only a new type or symbology changes which settings a field
               has, so only those rebuild the rows. */
            if (editorLayout && el.editor.contains(t)) {
                if (t.getAttribute('data-editor-field') === 'type') {
                    var i = +t.getAttribute('data-index');
                    readEditor(); changeEditorType(i, t.value); renderEditor();
                    var typeSelect = q('#bt-ef-' + n + '-' + i + '-type');
                    if (typeSelect) { typeSelect.focus(); }
                } else if (t.getAttribute('data-editor') === 'sym') {
                    readEditor(); renderEditor();
                }
                return;
            }
            if (t === el.mm) { st.mm = t.value; commit(); return; }
            if (t.hasAttribute('data-flag')) { st.flags[t.getAttribute('data-flag')] = t.checked; update(); commit(); return; }
            if (t.hasAttribute('data-opt')) {
                var k = t.getAttribute('data-opt');
                st.opts[k] = t.type === 'checkbox' ? (t.checked ? '1' : '0') : t.value;
                update(); commit();
                return;
            }
            if (t.hasAttribute('data-field') && t.tagName === 'SELECT') { onInput(e); }
        }

        root.addEventListener('click', onClick);
        root.addEventListener('input', onInput);
        root.addEventListener('change', onChange);
        /* toggle does not bubble, so it is caught on the way down. */
        root.addEventListener('toggle', onEditorToggle, true);

        var ro = window.ResizeObserver ? new ResizeObserver(function () { if (st.mode === 'make') { draw(); } }) : null;
        if (ro) { ro.observe(el.well); }
        var onTheme = function () { draw(); };
        document.addEventListener('pudl:theme-change', onTheme);

        instance.state = function () { return stateString(st); };
        instance.commands = commands;
        instance.menus = menus;
        instance.commandTable = commandTable;
        /* The menu bar was drawn while the engine loaded, from commands()
           alone; now that the menus are here, it is drawn again. */
        if (window.pudlMenubar) { window.pudlMenubar.refresh(); }
        instance.setState = function (s) {
            if (editorLayout) { closeEditor(true); }
            st = parseState(s || '');
            fillDefaults();
            buildForm(); update(); setMode(st.mode);
            commit();
        };
        instance.cleanup = function () {
            clearTimeout(writeTimer);
            if (ro) { ro.disconnect(); }
            document.removeEventListener('pudl:theme-change', onTheme);
            stopWatching();
            root.removeEventListener('click', onClick);
            root.removeEventListener('input', onInput);
            root.removeEventListener('change', onChange);
            root.removeEventListener('toggle', onEditorToggle, true);
            if (el.dialog.open) { el.dialog.close(); }
            if (el.removeDialog.open) { el.removeDialog.close(); }
        };

        el.noticeAction.addEventListener('click', function () {
            var h = noticeHandler;
            el.notice.hidden = true;
            if (h) { h(); }
        });

        buildForm();
        update();
        setMode(st.mode);
        restoreLink();
        if (got.error) { notify(got.error); }
    }

    window.pudlApplets.register('barcodes', {
        init: function (root, opts) {
            var inst = init(root, opts);
            return {
                state: function () { return inst.state ? inst.state() : ''; },
                setState: function (s) { if (inst.setState) { inst.setState(s); } },
                /* PUDL looks for commands() and menus() as soon as the tool
                   is running, while the engine may still be loading, so
                   both are always here; until the tool is ready, menus()
                   gives nothing and the menu bar falls back to commands(). */
                commands: function () { return inst.commands ? inst.commands() : []; },
                menus: function () { return inst.menus ? inst.menus() : null; },
                /* The toolbar (PUDL 0.68.1) is drawn at once into the slot
                   init made, and its commands arrive with the tool. */
                commandTable: function () { return inst.commandTable ? inst.commandTable() : []; },
                toolbars: function () {
                    return [{ label: 'Barcode Tool', groups: [
                        { label: 'Mode', glyph: 'gear', priority: 3, items: [{ choice: 'bt-mode' }] },
                        { label: 'Barcode', glyph: 'list', priority: 2, items: ['symbology', 'layout'] },
                        { label: 'Save', glyph: 'download', priority: 1, items: ['svg', 'png', 'link'] },
                        { glyph: 'info', priority: 4, end: true, items: ['help'] }
                    ] }];
                },
                destroy: function () { inst.destroy(); }
            };
        }
    });
})();
