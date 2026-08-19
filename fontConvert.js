// Pure JS/Canvas implementation of fontconvert_sdcard.py
// Ported to run entirely in the browser using opentype.js.
import opentype from 'https://cdn.jsdelivr.net/npm/opentype.js@1.3.4/dist/opentype.module.js';
import { sanitizeFamilyName } from './fontBuilder.js';

export function parseFont(buffer) {
	return opentype.parse(buffer);
}

const STYLE_NAMES = { 0: "regular", 1: "bold", 2: "italic", 3: "bolditalic" };

// --- Unicode interval presets ---
const BASE_INTERVALS = [[0x0000, 0x007F], [0x2000, 0x206F]];

const DEFAULT_INTERVALS = [
	[0x0080, 0x00FF], [0x0100, 0x017F],
	[0x01A0, 0x01A1], [0x01AF, 0x01B0], [0x01C4, 0x021F],
	[0x0300, 0x036F], [0x0400, 0x04FF], [0x1EA0, 0x1EF9],
	[0x20A0, 0x20CF], [0x2070, 0x209F], [0x2190, 0x21FF],
	[0x2200, 0x22FF], [0xFB00, 0xFB06]
];

export const INTERVAL_PRESETS_MAP = {
	"base": BASE_INTERVALS,
	"default": DEFAULT_INTERVALS,
	"latin-ext": [[0x0020, 0x007E], [0x0080, 0x00FF], [0x0100, 0x024F],
	[0x1E00, 0x1EFF], [0x2000, 0x206F], [0xFB00, 0xFB06]],
	"greek": [[0x0370, 0x03FF], [0x1F00, 0x1FFF]],
	"cyrillic": [[0x0400, 0x04FF], [0x0500, 0x052F]],
	"hebrew": [[0x0590, 0x05FF], [0xFB1D, 0xFB4F]],
	"arabic": [[0x0600, 0x06FF], [0x0750, 0x077F], [0x08A0, 0x08FF], [0xFB50, 0xFDF9], [0xFE70, 0xFEFF]],
	"georgian": [[0x10A0, 0x10FF], [0x2D00, 0x2D2F]],
	"armenian": [[0x0530, 0x058F]],
	"ethiopic": [[0x1200, 0x137F], [0x1380, 0x139F], [0x2D80, 0x2DDF]],
	"vietnamese": [[0x01A0, 0x01B0], [0x1EA0, 0x1EF9]],
	"cjk-sc": [[0x3000, 0x303F], [0x4E00, 0x9FFF],
	[0xF900, 0xFAFF], [0xFF00, 0xFFEF]],
	"cjk-tc": [[0x3000, 0x303F], [0x3100, 0x312F], [0x31A0, 0x31BF],
	[0x3400, 0x4DBF], [0x4E00, 0x9FFF],
	[0xF900, 0xFAFF], [0xFF00, 0xFFEF]],
	"cjk-jp": [[0x3000, 0x303F], [0x3040, 0x309F], [0x30A0, 0x30FF],
	[0x4E00, 0x9FFF], [0xF900, 0xFAFF], [0xFF00, 0xFFEF]],
	"hangul": [[0xAC00, 0xD7AF], [0x1100, 0x11FF], [0x3130, 0x318F]],
	"cherokee": [[0x13A0, 0x13FF], [0xAB70, 0xABBF]],
	"tifinagh": [[0x2D30, 0x2D7F]],
	"thai": [[0x0E00, 0x0E7F]],
	"bengali": [[0x0964, 0x0965], [0x0980, 0x09FF]],
	"symbols": [[0x2070, 0x209F], [0x20A0, 0x20CF], [0x2150, 0x218F],
	[0x2190, 0x21FF], [0x2200, 0x22FF], [0x2500, 0x257F],
	[0x25A0, 0x25FF], [0x2600, 0x26FF], [0x2700, 0x27BF]],
	"reading": DEFAULT_INTERVALS.concat([
		[0x0180, 0x019F], [0x01A2, 0x01AE], [0x01B1, 0x01C3],
		[0x0220, 0x024F], [0x0370, 0x03FF], [0x1E00, 0x1E9F],
		[0x1EFA, 0x1EFF], [0x2150, 0x218F], [0x2500, 0x257F],
		[0x25A0, 0x25FF], [0x2600, 0x26FF], [0x2700, 0x27BF],
		[0x2900, 0x29FF], [0x2E00, 0x2E7F], [0x3000, 0x303F]]),
	"ipa-chars": [[0x0250, 0x02AF], [0x02B0, 0x02FF]],
};

export function resolveIntervals(presetsStr) {
	const allIntervals = [];
	const tokens = ['base'];

	if (presetsStr) {
		presetsStr.split(',').forEach(p => {
			const trimmed = p.trim().toLowerCase();
			if (trimmed) tokens.push(trimmed);
		});
	}

	const hexRangePattern = /^\(0x([0-9a-fA-F]+)-0x([0-9a-fA-F]+)\)$/;

	tokens.forEach(token => {
		const match = hexRangePattern.exec(token);
		if (match) {
			const start = parseInt(match[1], 16);
			const end = parseInt(match[2], 16);
			if (!isNaN(start) && !isNaN(end) && start <= end && end <= 0x10FFFF) {
				allIntervals.push([start, end]);
			}
		} else if (INTERVAL_PRESETS_MAP[token]) {
			allIntervals.push(...INTERVAL_PRESETS_MAP[token]);
		}
	});

	// Always add replacement character
	allIntervals.push([0xFFFD, 0xFFFD]);

	// Sort and merge overlapping/adjacent intervals
	allIntervals.sort((a, b) => a[0] - b[0]);
	const merged = [];
	allIntervals.forEach(([start, end]) => {
		if (merged.length > 0 && start <= merged[merged.length - 1][1] + 1) {
			merged[merged.length - 1][1] = Math.max(merged[merged.length - 1][1], end);
		} else {
			merged.push([start, end]);
		}
	});

	return merged;
}

const STANDARD_LIGATURE_MAP = {
	'102,102': 0xFB00,       // ff
	'102,105': 0xFB01,       // fi
	'102,108': 0xFB02,       // fl
	'102,102,105': 0xFB03,   // ffi
	'102,102,108': 0xFB04,   // ffl
	'383,116': 0xFB05,       // long-s + t
	'115,116': 0xFB06        // st
};

// Convert character sequences to keys
function getLigKey(seq) {
	return seq.join(',');
}

export function extractLigatures(font, codepoints) {
	const indexToCp = {};
	if (font.tables.cmap && font.tables.cmap.glyphIndexMap) {
		for (const [cpStr, glyphIdx] of Object.entries(font.tables.cmap.glyphIndexMap)) {
			indexToCp[glyphIdx] = Number(cpStr);
		}
	} else {
		for (let index = 0; index < font.glyphs.length; index++) {
			const glyph = font.glyphs.get(index);
			if (glyph && glyph.unicode !== undefined) {
				indexToCp[index] = glyph.unicode;
			}
		}
	}

	const gsub = font.tables.gsub;
	const rawLigatures = {}; // seqString -> ligCp

	if (gsub && gsub.lookupList) {
		gsub.lookupList.forEach((lookup) => {
			// LookupType 4 = Ligature Substitution
			if (lookup.lookupType === 4 && lookup.subtables) {
				lookup.subtables.forEach((subtable) => {
					const coverage = subtable.coverage;
					const ligatureSets = subtable.ligatureSets;
					if (!coverage || !ligatureSets) return;

					const firstGlyphs = coverage.glyphs;
					for (let i = 0; i < firstGlyphs.length; i++) {
						const firstGlyphIndex = firstGlyphs[i];
						const firstCp = indexToCp[firstGlyphIndex];
						if (firstCp === undefined) continue;

						const ligSet = ligatureSets[i];
						if (!ligSet) continue;

						ligSet.forEach((lig) => {
							const componentIndices = lig.components;
							const seq = [firstCp];
							let valid = true;

							for (let j = 0; j < componentIndices.length; j++) {
								const cp = indexToCp[componentIndices[j]];
								if (cp === undefined) {
									valid = false;
									break;
								}
								seq.push(cp);
							}

							if (!valid) return;

							const ligGlyphIndex = lig.ligGlyph;
							let ligCp = indexToCp[ligGlyphIndex];

							if (ligCp === undefined) {
								const key = getLigKey(seq);
								if (STANDARD_LIGATURE_MAP[key] !== undefined) {
									ligCp = STANDARD_LIGATURE_MAP[key];
								}
							}

							if (ligCp !== undefined) {
								rawLigatures[getLigKey(seq)] = ligCp;
							}
						});
					}
				});
			}
		});
	}

	const codepointsSet = new Set(codepoints);
	const filtered = {};

	for (const [seqStr, ligCp] of Object.entries(rawLigatures)) {
		if (!codepointsSet.has(ligCp) || ligCp > 0xFFFF) continue;
		const seq = seqStr.split(',').map(Number);
		if (seq.some(cp => cp > 0xFFFF)) continue;
		if (seq.every(cp => codepointsSet.has(cp))) {
			filtered[seqStr] = ligCp;
		}
	}

	const pairs = [];
	// Pass 1: 2-char ligatures
	for (const [seqStr, ligCp] of Object.entries(filtered)) {
		const seq = seqStr.split(',').map(Number);
		if (seq.length === 2) {
			const packed = (seq[0] << 16) | seq[1];
			pairs.push({ packed, ligCp });
		}
	}

	// Pass 2: 3+ char ligatures
	for (const [seqStr, ligCp] of Object.entries(filtered)) {
		const seq = seqStr.split(',').map(Number);
		if (seq.length < 3) continue;
		const prefix = seq.slice(0, -1).join(',');
		const lastCp = seq[seq.length - 1];
		if (filtered[prefix] !== undefined) {
			const intermediateCp = filtered[prefix];
			const packed = (intermediateCp << 16) | lastCp;
			pairs.push({ packed, ligCp });
		}
	}

	// Sort by packed key
	pairs.sort((a, b) => a.packed - b.packed);

	if (pairs.length > 255) {
		console.warn(`WARNING: ${pairs.length} ligatures exceeds uint8_t max (255), truncating`);
		return pairs.slice(0, 255);
	}

	return pairs;
}

export function getFontKerningPairs(font) {
	const pairs = {};

	// 1. Parse legacy kern table if it exists
	if (font.tables.kern && font.tables.kern.subtables) {
		font.tables.kern.subtables.forEach(subtable => {
			if (subtable.coverage && subtable.coverage.crossStream) return;
			if (subtable.kerning) {
				for (const [key, val] of Object.entries(subtable.kerning)) {
					pairs[key] = val;
				}
			}
		});
	}

	// 2. Parse GPOS table if it exists
	const gpos = font.tables.gpos;
	if (gpos && gpos.lookupList) {
		gpos.lookupList.forEach(lookup => {
			// LookupType 2 is Pair Positioning
			if (lookup.lookupType === 2 && lookup.subtables) {
				lookup.subtables.forEach(subtable => {
					const coverage = subtable.coverage;
					if (!coverage || !coverage.glyphs) return;

					if (subtable.posFormat === 1) {
						// Format 1: Adjustments for glyph pairs
						const pairSets = subtable.pairSets;
						if (!pairSets) return;
						for (let i = 0; i < coverage.glyphs.length; i++) {
							const firstGlyphIdx = coverage.glyphs[i];
							const pairSet = pairSets[i];
							if (!pairSet) continue;
							pairSet.forEach(record => {
								const secondGlyphIdx = record.secondGlyph;
								let val = 0;
								if (record.value1 && record.value1.xAdvance) {
									val = record.value1.xAdvance;
								}
								if (val !== 0) {
									pairs[`${firstGlyphIdx},${secondGlyphIdx}`] = val;
								}
							});
						}
					} else if (subtable.posFormat === 2) {
						// Format 2: Class-based pair adjustments
						const classDef1 = subtable.classDef1;
						const classDef2 = subtable.classDef2;
						const classRecords = subtable.classRecords;
						if (!classRecords) return;

						const maxClass1 = classRecords.length;
						const maxClass2 = classRecords[0] ? classRecords[0].class2Records.length : 0;

						const glyphsInClass1 = {};
						const glyphsInClass2 = {};
						for (let i = 0; i < maxClass1; i++) glyphsInClass1[i] = [];
						for (let i = 0; i < maxClass2; i++) glyphsInClass2[i] = [];

						const totalGlyphs = font.glyphs.length;
						for (let idx = 0; idx < totalGlyphs; idx++) {
							let c1 = 0;
							if (classDef1 && classDef1.classDefs) {
								c1 = classDef1.classDefs[idx] || 0;
							}
							if (c1 < maxClass1) {
								glyphsInClass1[c1].push(idx);
							}

							let c2 = 0;
							if (classDef2 && classDef2.classDefs) {
								c2 = classDef2.classDefs[idx] || 0;
							}
							if (c2 < maxClass2) {
								glyphsInClass2[c2].push(idx);
							}
						}

						for (let c1 = 0; c1 < maxClass1; c1++) {
							const leftGlyphs = glyphsInClass1[c1];
							if (leftGlyphs.length === 0) continue;
							const class1Rec = classRecords[c1];
							if (!class1Rec || !class1Rec.class2Records) continue;

							for (let c2 = 0; c2 < maxClass2; c2++) {
								const rightGlyphs = glyphsInClass2[c2];
								if (rightGlyphs.length === 0) continue;
								const class2Rec = class1Rec.class2Records[c2];
								if (!class2Rec) continue;

								let val = 0;
								if (class2Rec.value1 && class2Rec.value1.xAdvance) {
									val = class2Rec.value1.xAdvance;
								}
								if (val !== 0) {
									leftGlyphs.forEach(lg => {
										rightGlyphs.forEach(rg => {
											pairs[`${lg},${rg}`] = val;
										});
									});
								}
							}
						}
					}
				});
			}
		});
	}

	return pairs;
}

export function extractKerning(font, codepoints, scale) {
	const kernMap = {};

	// 1. Build a map of glyphIndex -> codepoints (alphabetic range to prevent overflow)
	const indexToCps = {};
	codepoints.forEach(cp => {
		if (cp > 0xFFFF) return; // SMP not supported in kern codepoints
		const glyph = font.charToGlyph(String.fromCodePoint(cp));
		if (glyph && glyph.index > 0) {
			indexToCps[glyph.index] = indexToCps[glyph.index] || [];
			indexToCps[glyph.index].push(cp);
		}
	});

	// 2. Extract raw pairs directly from tables in O(M) time (instant)
	const rawPairs = getFontKerningPairs(font);

	// 3. Scale and populate kernMap for codepoints that are built
	for (const [key, val] of Object.entries(rawPairs)) {
		const [lg, rg] = key.split(',').map(Number);
		const leftCps = indexToCps[lg];
		const rightCps = indexToCps[rg];
		if (leftCps && rightCps) {
			const adjust = Math.max(-128, Math.min(127, Math.round(val * scale * 16)));
			if (adjust !== 0) {
				leftCps.forEach(lcp => {
					rightCps.forEach(rcp => {
						kernMap[`${lcp},${rcp}`] = adjust;
					});
				});
			}
		}
	}

	return kernMap;
}

export function deriveKernClasses(kernMap) {
	if (!kernMap || Object.keys(kernMap).length === 0) {
		return {
			kernLeftClasses: [],
			kernRightClasses: [],
			kernMatrix: [],
			kernLeftClassCount: 0,
			kernRightClassCount: 0
		};
	}

	const allLeftCps = new Set();
	const allRightCps = new Set();
	for (const key of Object.keys(kernMap)) {
		const [lcp, rcp] = key.split(',').map(Number);
		allLeftCps.add(lcp);
		allRightCps.add(rcp);
	}
	const sortedLeftCps = Array.from(allLeftCps).sort((a, b) => a - b);
	const sortedRightCps = Array.from(allRightCps).sort((a, b) => a - b);

	// Group left codepoints by identical adjustment row
	const leftProfileToClass = {};
	const leftClassMap = {};
	let leftClassId = 1;
	for (const lcp of sortedLeftCps) {
		const row = sortedRightCps.map(rcp => kernMap[`${lcp},${rcp}`] || 0).join(',');
		if (!leftProfileToClass[row]) {
			leftProfileToClass[row] = leftClassId;
			leftClassId++;
		}
		leftClassMap[lcp] = leftProfileToClass[row];
	}

	// Group right codepoints by identical adjustment column
	const rightProfileToClass = {};
	const rightClassMap = {};
	let rightClassId = 1;
	for (const rcp of sortedRightCps) {
		const col = sortedLeftCps.map(lcp => kernMap[`${lcp},${rcp}`] || 0).join(',');
		if (!rightProfileToClass[col]) {
			rightProfileToClass[col] = rightClassId;
			rightClassId++;
		}
		rightClassMap[rcp] = rightProfileToClass[col];
	}

	const kernLeftClassCount = leftClassId - 1;
	const kernRightClassCount = rightClassId - 1;

	if (kernLeftClassCount > 255 || kernRightClassCount > 255) {
		console.warn("WARNING: kerning class count exceeds uint8_t range, dropping kerning");
		return {
			kernLeftClasses: [],
			kernRightClasses: [],
			kernMatrix: [],
			kernLeftClassCount: 0,
			kernRightClassCount: 0
		};
	}

	const kernMatrix = new Int8Array(kernLeftClassCount * kernRightClassCount);
	for (const key of Object.keys(kernMap)) {
		const [lcp, rcp] = key.split(',').map(Number);
		const adjust = kernMap[key];
		const lc = leftClassMap[lcp] - 1;
		const rc = rightClassMap[rcp] - 1;
		kernMatrix[lc * kernRightClassCount + rc] = adjust;
	}

	const kernLeftClasses = Object.entries(leftClassMap)
		.map(([cp, cls]) => [Number(cp), cls])
		.sort((a, b) => a[0] - b[0]);

	const kernRightClasses = Object.entries(rightClassMap)
		.map(([cp, cls]) => [Number(cp), cls])
		.sort((a, b) => a[0] - b[0]);

	return {
		kernLeftClasses,
		kernRightClasses,
		kernMatrix,
		kernLeftClassCount,
		kernRightClassCount
	};
}

// Canvas-based glyph rasterization
export async function rasterizeStyle({
	font,
	size,
	intervals,
	styleId = 0,
	darkenAa = false,
	fallbackFonts = []
}) {
	const ppem = size * 150.0 / 72.0;
	const scale = ppem / font.unitsPerEm;

	// Resolve coverage: check primary font first, then fallback chain
	const codepoints = [];
	const codepointSources = {}; // cp -> index (0 = primary, 1+ = fallbacks)

	intervals.forEach(([start, end]) => {
		for (let cp = start; cp <= end; cp++) {
			let sourceIndex = -1;

			// Check primary
			const primaryGlyph = font.charToGlyph(String.fromCodePoint(cp));
			if (primaryGlyph && primaryGlyph.index > 0) {
				sourceIndex = 0;
			} else {
				// Check fallbacks
				for (let idx = 0; idx < fallbackFonts.length; idx++) {
					const fallbackGlyph = fallbackFonts[idx].charToGlyph(String.fromCodePoint(cp));
					if (fallbackGlyph && fallbackGlyph.index > 0) {
						sourceIndex = idx + 1;
						break;
					}
				}
			}

			if (sourceIndex !== -1) {
				codepoints.push(cp);
				codepointSources[cp] = sourceIndex;
			}
		}
	});

	const fontList = [font, ...fallbackFonts];

	// We need an offscreen canvas to render paths to pixels
	const canvas = typeof OffscreenCanvas !== 'undefined'
		? new OffscreenCanvas(1, 1)
		: document.createElement('canvas');
	const ctx = canvas.getContext('2d', { willReadFrequently: true });

	const allGlyphs = [];
	let totalBitmapSize = 0;

	const aaThresholds = darkenAa ? [3, 6, 10] : [4, 8, 12];

	for (let idx = 0; idx < codepoints.length; idx++) {
		const cp = codepoints[idx];

		// Yield execution every 100 glyphs to keep UI responsive and prevent browser freezing
		if (idx > 0 && idx % 100 === 0) {
			await new Promise(resolve => setTimeout(resolve, 0));
		}

		const srcIdx = codepointSources[cp];
		const targetFont = fontList[srcIdx];
		const glyph = targetFont.charToGlyph(String.fromCodePoint(cp));

		const xMin = glyph.xMin ?? 0;
		const yMin = glyph.yMin ?? 0;
		const xMax = glyph.xMax ?? 0;
		const yMax = glyph.yMax ?? 0;

		const gScale = ppem / targetFont.unitsPerEm;
		const left = Math.floor(xMin * gScale);
		const top = Math.ceil(yMax * gScale);
		const width = Math.ceil(xMax * gScale) - left;
		const height = top - Math.floor(yMin * gScale);
		const advanceX = Math.round(glyph.advanceWidth * gScale * 16); // 12.4 fixed point

		if (width <= 0 || height <= 0) {
			allGlyphs.push({
				glyphProps: {
					width: 0,
					height: 0,
					advanceX,
					left: 0,
					top: 0,
					dataLength: 0,
					dataOffset: totalBitmapSize,
					codePoint: cp
				},
				packed: new Uint8Array(0)
			});
			continue;
		}

		// Set canvas sizes
		canvas.width = width;
		canvas.height = height;

		ctx.clearRect(0, 0, width, height);
		ctx.fillStyle = '#ffffff';

		// Draw glyph path onto canvas. Since Canvas has Y down, top-left aligned:
		const path = glyph.getPath(-left, top, ppem);
		path.draw(ctx);

		const imgData = ctx.getImageData(0, 0, width, height);
		const data = imgData.data;

		// Pack into 2-bit grayscale
		const pixels2b = [];
		let px = 0;
		let count = 0;

		for (let y = 0; y < height; y++) {
			for (let x = 0; x < width; x++) {
				// Read alpha channel
				const a = data[(y * width + x) * 4 + 3];
				const val = Math.round(a / 17); // map 0..255 to 0..15

				let code = 0;
				if (val >= aaThresholds[2]) code = 3;
				else if (val >= aaThresholds[1]) code = 2;
				else if (val >= aaThresholds[0]) code = 1;

				px = (px << 2) | code;
				count++;

				if (count === 4) {
					pixels2b.push(px);
					px = 0;
					count = 0;
				}
			}
		}

		if (count > 0) {
			px = px << ((4 - count) * 2);
			pixels2b.push(px);
		}

		const packed = new Uint8Array(pixels2b);
		allGlyphs.push({
			glyphProps: {
				width,
				height,
				advanceX,
				left,
				top,
				dataLength: packed.length,
				dataOffset: totalBitmapSize,
				codePoint: cp
			},
			packed
		});

		totalBitmapSize += packed.length;
	}

	// Group into continuous active interval ranges (excluding missing characters)
	const activeIntervals = [];
	if (codepoints.length > 0) {
		let startCp = codepoints[0];
		let prevCp = codepoints[0];
		for (let i = 1; i < codepoints.length; i++) {
			const cp = codepoints[i];
			if (cp === prevCp + 1) {
				prevCp = cp;
			} else {
				activeIntervals.push([startCp, prevCp]);
				startCp = cp;
				prevCp = cp;
			}
		}
		activeIntervals.push([startCp, prevCp]);
	}

	// Calculate layout metrics
	const ascender = Math.ceil(font.tables.hhea.ascender * scale);
	const descender = Math.floor(font.tables.hhea.descender * scale);
	const advanceY = Math.ceil((font.tables.hhea.ascender - font.tables.hhea.descender + font.tables.hhea.lineGap) * scale);

	// Extract GPOS kerning and GSUB ligatures
	const kernMap = extractKerning(font, codepoints, scale);
	const derivedKern = deriveKernClasses(kernMap);
	const ligaturePairs = extractLigatures(font, codepoints);

	return {
		styleId,
		intervals: activeIntervals,
		allGlyphs,
		totalBitmapSize,
		advanceY,
		ascender,
		descender,
		...derivedKern,
		ligaturePairs
	};
}

// Binary packer for .cpfont format
export function packStyleSections(sd) {
	// 1. Intervals
	// Each interval: start(4) + end(4) + offset(4) = 12 bytes
	const intervalsData = new Uint8Array(sd.intervals.length * 12);
	const intervalsView = new DataView(intervalsData.buffer);
	let offset = 0;
	sd.intervals.forEach(([start, end], idx) => {
		intervalsView.setUint32(idx * 12, start, true);
		intervalsView.setUint32(idx * 12 + 4, end, true);
		intervalsView.setUint32(idx * 12 + 8, offset, true);
		offset += end - start + 1;
	});

	// 2. Glyphs
	// EpdGlyph: width(1) + height(1) + advance_x(2) + left(2) + top(2) + data_length(2) + pad(2) + data_offset(4) = 16 bytes
	const glyphsData = new Uint8Array(sd.allGlyphs.length * 16);
	const glyphsView = new DataView(glyphsData.buffer);
	sd.allGlyphs.forEach(({ glyphProps }, idx) => {
		const o = idx * 16;
		glyphsView.setUint8(o, glyphProps.width);
		glyphsView.setUint8(o + 1, glyphProps.height);
		glyphsView.setUint16(o + 2, glyphProps.advanceX, true);
		glyphsView.setInt16(o + 4, glyphProps.left, true);
		glyphsView.setInt16(o + 6, glyphProps.top, true);
		glyphsView.setUint16(o + 8, glyphProps.dataLength, true);
		// bytes 10-11: 2-byte alignment pad
		glyphsView.setUint32(o + 12, glyphProps.dataOffset, true);
	});

	// 3. Kern Left
	// Each: cp(2) + class(1) = 3 bytes
	const kernLeftData = new Uint8Array(sd.kernLeftClasses.length * 3);
	const kernLeftView = new DataView(kernLeftData.buffer);
	sd.kernLeftClasses.forEach(([cp, cls], idx) => {
		kernLeftView.setUint16(idx * 3, cp, true);
		kernLeftView.setUint8(idx * 3 + 2, cls);
	});

	// 4. Kern Right
	// Each: cp(2) + class(1) = 3 bytes
	const kernRightData = new Uint8Array(sd.kernRightClasses.length * 3);
	const kernRightView = new DataView(kernRightData.buffer);
	sd.kernRightClasses.forEach(([cp, cls], idx) => {
		kernRightView.setUint16(idx * 3, cp, true);
		kernRightView.setUint8(idx * 3 + 2, cls);
	});

	// 5. Kern Matrix
	const kernMatrixData = new Int8Array(sd.kernMatrix);

	// 6. Ligatures
	// Each: packedPair(4) + ligCp(4) = 8 bytes
	const ligatureData = new Uint8Array(sd.ligaturePairs.length * 8);
	const ligatureView = new DataView(ligatureData.buffer);
	sd.ligaturePairs.forEach(({ packed, ligCp }, idx) => {
		ligatureView.setUint32(idx * 8, packed, true);
		ligatureView.setUint32(idx * 8 + 4, ligCp, true);
	});

	// 7. Bitmaps
	const bitmapData = new Uint8Array(sd.totalBitmapSize);
	let bitmapOffset = 0;
	sd.allGlyphs.forEach(({ packed }) => {
		bitmapData.set(packed, bitmapOffset);
		bitmapOffset += packed.length;
	});

	return {
		intervalsData,
		glyphsData,
		kernLeftData,
		kernRightData,
		kernMatrixData: new Uint8Array(kernMatrixData.buffer),
		ligatureData,
		bitmapData
	};
}

export async function generateCpfontMultistyle({
	styleFonts, // Map of styleId -> parsed Font
	size,
	intervals,
	darkenAa = false,
	fallbackStyleFonts = null
}) {
	const MAGIC = new TextEncoder().encode("CPFONT\x00\x00");
	const HEADER_SIZE = 32;
	const STYLE_TOC_ENTRY_SIZE = 32;
	const flags = 1; // 2-bit grayscale
	const styleCount = Object.keys(styleFonts).length;

	const rasterData = {};
	const packedSections = {};

	// Rasterize each style
	const sortedStyleIds = Object.keys(styleFonts).map(Number).sort((a, b) => a - b);
	for (const styleId of sortedStyleIds) {
		const font = styleFonts[styleId];
		const fallbackFonts = [];
		if (fallbackStyleFonts) {
			if (styleId !== 0 && fallbackStyleFonts[styleId]) {
				fallbackFonts.push(...fallbackStyleFonts[styleId]);
			}
			if (fallbackStyleFonts[0]) {
				fallbackFonts.push(...fallbackStyleFonts[0]);
			}
		}

		rasterData[styleId] = await rasterizeStyle({
			font,
			size,
			intervals,
			styleId,
			darkenAa,
			fallbackFonts
		});

		packedSections[styleId] = packStyleSections(rasterData[styleId]);
	}

	// Offsets
	const dataStart = HEADER_SIZE + styleCount * STYLE_TOC_ENTRY_SIZE;
	let currentOffset = dataStart;

	const styleOffsets = {};
	const styleSizes = {};
	sortedStyleIds.forEach((styleId) => {
		styleOffsets[styleId] = currentOffset;
		const sections = packedSections[styleId];
		const size = sections.intervalsData.length +
			sections.glyphsData.length +
			sections.kernLeftData.length +
			sections.kernRightData.length +
			sections.kernMatrixData.length +
			sections.ligatureData.length +
			sections.bitmapData.length;
		styleSizes[styleId] = size;
		currentOffset += size;
	});

	// Global Header: magic(8) + version(2) + flags(2) + styleCount(1) + reserved(19) = 32
	const header = new Uint8Array(HEADER_SIZE);
	header.set(MAGIC, 0);
	const headerView = new DataView(header.buffer);
	headerView.setUint16(8, 4, true); // CPFONT_VERSION = 4
	headerView.setUint16(10, flags, true);
	headerView.setUint8(12, styleCount);

	// TOC
	// Each entry: styleId(1) + pad(3) + intervalCount(4) + glyphCount(4) +
	//   advanceY(1) + ascender(2) + descender(2) + kernL(2) + kernR(2) +
	//   kernLCls(1) + kernRCls(1) + ligCount(1) + dataOffset(4) + reserved(4) = 32
	const tocData = new Uint8Array(styleCount * STYLE_TOC_ENTRY_SIZE);
	const tocView = new DataView(tocData.buffer);

	sortedStyleIds.forEach((styleId, idx) => {
		const sd = rasterData[styleId];
		if (sd.advanceY > 255) {
			throw new Error(`advanceY (${sd.advanceY}) exceeds uint8 range for style ${styleId} size ${size}`);
		}
		const o = idx * STYLE_TOC_ENTRY_SIZE;
		tocView.setUint8(o, styleId);
		// bytes 1-3: pad
		tocView.setUint32(o + 4, sd.intervals.length, true);
		tocView.setUint32(o + 8, sd.allGlyphs.length, true);
		tocView.setUint8(o + 12, sd.advanceY);
		tocView.setInt16(o + 13, sd.ascender, true);
		tocView.setInt16(o + 15, sd.descender, true);
		tocView.setUint16(o + 17, sd.kernLeftClasses.length, true);
		tocView.setUint16(o + 19, sd.kernRightClasses.length, true);
		tocView.setUint8(o + 21, sd.kernLeftClassCount);
		tocView.setUint8(o + 22, sd.kernRightClassCount);
		tocView.setUint8(o + 23, sd.ligaturePairs.length);
		tocView.setUint32(o + 24, styleOffsets[styleId], true);
		// bytes 28-31: reserved pad
	});

	// Merge everything into a single binary buffer
	const finalFile = new Uint8Array(currentOffset);
	finalFile.set(header, 0);
	finalFile.set(tocData, HEADER_SIZE);

	sortedStyleIds.forEach((styleId) => {
		const o = styleOffsets[styleId];
		const s = packedSections[styleId];

		finalFile.set(s.intervalsData, o);
		let shift = s.intervalsData.length;

		finalFile.set(s.glyphsData, o + shift);
		shift += s.glyphsData.length;

		finalFile.set(s.kernLeftData, o + shift);
		shift += s.kernLeftData.length;

		finalFile.set(s.kernRightData, o + shift);
		shift += s.kernRightData.length;

		finalFile.set(s.kernMatrixData, o + shift);
		shift += s.kernMatrixData.length;

		finalFile.set(s.ligatureData, o + shift);
		shift += s.ligatureData.length;

		finalFile.set(s.bitmapData, o + shift);
	});

	return finalFile;
}

// Helper to convert File / Blob / Uint8Array / ArrayBuffer to ArrayBuffer
async function toArrayBuffer(data) {
	if (!data) return null;
	if (data instanceof ArrayBuffer) return data;
	if (data.buffer instanceof ArrayBuffer) return data.buffer;
	if (data instanceof Blob || (typeof File !== 'undefined' && data instanceof File)) {
		return await data.arrayBuffer();
	}
	throw new Error('Unsupported buffer input format');
}

/**
 * High-level orchestration for building .cpfont files from raw file objects.
 * Handles reading buffers, parsing fonts via opentype, rasterizing sizes, and invoking callbacks.
 */
export async function buildFontPackage({
	familyName,
	primaryFiles,        // { 0: File|ArrayBuffer, 1: ..., 2: ..., 3: ... }
	fallbackFamilies = [], // [ { name, files: { 0: ..., 1: ..., 2: ..., 3: ... } }, ... ]
	presets = [],        // ['reading', 'ipa-chars'] or comma string
	customIntervalsStr = '',
	sizes = [12, 14, 16, 18],
	darkenAa = false,
	onProgress = () => { },
	onLog = () => { }
}) {
	const sanitizedName = sanitizeFamilyName(familyName);

	// 1. Resolve Unicode Intervals
	const presetStr = Array.isArray(presets) ? presets.join(',') : (presets || '');
	const fullIntervalList = presetStr + (customIntervalsStr ? (presetStr ? ',' : '') + customIntervalsStr : '');
	const resolvedRanges = resolveIntervals(fullIntervalList);

	onLog({
		message: `Resolved Unicode coverage: merged into ${resolvedRanges.length} continuous interval ranges.`,
		type: 'info'
	});

	// 2. Read raw buffers
	onProgress({ percent: 10, message: 'Reading font files into memory...' });
	onLog({ message: 'Reading font files into memory...', type: 'info' });

	const styleFontsRaw = {};
	if (primaryFiles[0]) styleFontsRaw[0] = await toArrayBuffer(primaryFiles[0]);
	if (primaryFiles[1]) styleFontsRaw[1] = await toArrayBuffer(primaryFiles[1]);
	if (primaryFiles[2]) styleFontsRaw[2] = await toArrayBuffer(primaryFiles[2]);
	if (primaryFiles[3]) styleFontsRaw[3] = await toArrayBuffer(primaryFiles[3]);

	if (!styleFontsRaw[0]) {
		throw new Error('Regular font file (style 0) is required.');
	}

	const fallbackStyleFontsRaw = {};
	for (const fam of fallbackFamilies) {
		for (let sid = 0; sid < 4; sid++) {
			if (fam.files && fam.files[sid]) {
				fallbackStyleFontsRaw[sid] = fallbackStyleFontsRaw[sid] || [];
				fallbackStyleFontsRaw[sid].push(await toArrayBuffer(fam.files[sid]));
			}
		}
	}

	// 3. Parse with opentype
	onProgress({ percent: 15, message: 'Parsing font OpenType tables...' });
	onLog({ message: 'Parsing font OpenType tables...', type: 'info' });

	const styleFonts = {};
	for (const [sid, buf] of Object.entries(styleFontsRaw)) {
		styleFonts[sid] = parseFont(buf);
	}

	const fallbackStyleFonts = {};
	for (const [sid, buffers] of Object.entries(fallbackStyleFontsRaw)) {
		fallbackStyleFonts[sid] = buffers.map(buf => parseFont(buf));
	}

	// 4. Build each size
	const builtFiles = [];
	const sortedSizes = Array.from(new Set(sizes)).map(Number).filter(n => !isNaN(n)).sort((a, b) => a - b);
	const totalSteps = sortedSizes.length;

	for (let i = 0; i < sortedSizes.length; i++) {
		const sz = sortedSizes[i];
		const stepPercent = 15 + Math.round((i / totalSteps) * 80);

		onProgress({
			percent: stepPercent,
			message: `Rasterizing size ${sz}pt...`
		});
		onLog({
			message: `Generating ${sanitizedName}_${sz}.cpfont...`,
			type: 'info'
		});

		const fileBinary = await generateCpfontMultistyle({
			styleFonts,
			size: sz,
			intervals: resolvedRanges,
			darkenAa,
			fallbackStyleFonts
		});

		const fileName = `${sanitizedName}_${sz}.cpfont`;
		builtFiles.push({
			name: fileName,
			data: fileBinary
		});

		onLog({
			message: `Successfully built ${fileName} (${(fileBinary.byteLength / 1024).toFixed(1)} KB)`,
			type: 'success'
		});
	}

	onProgress({ percent: 100, message: 'Done!' });
	onLog({ message: 'All font files compiled successfully!', type: 'success' });

	return builtFiles;
}

