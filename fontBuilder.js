// Font Builder helpers, ported from public/fonts.html inline scripts.
// Behavior is preserved verbatim.

const STYLE_PATTERNS = [
	{ style: 'bolditalic', re: /[-_ ]?(bold[-_ ]?italic|bold[-_ ]?oblique|bolditalic|boldoblique|BdIt|bi)$/i },
	{ style: 'bold', re: /[-_ ]?(bold|Bd)$/i },
	{ style: 'italic', re: /[-_ ]?(italic|It|oblique)$/i },
	{ style: 'regular', re: /[-_ ]?(regular|normal|book|roman|medium|Rg)$/i },
]

const EXTRA_WEIGHT_RE =
	/(thin|hairline|extra[-_ ]?light|ultra[-_ ]?light|light|medium|semi[-_ ]?bold|demi[-_ ]?bold|extra[-_ ]?bold|ultra[-_ ]?bold|black|heavy)[-_ ]?(italic|oblique)/i

function detectStyle(stem) {
	for (let i = 0; i < STYLE_PATTERNS.length; i++) {
		if (STYLE_PATTERNS[i].re.test(stem)) return STYLE_PATTERNS[i].style
	}
	return 'regular'
}

function extractFamily(stem) {
	for (let i = 0; i < STYLE_PATTERNS.length; i++) {
		stem = stem.replace(STYLE_PATTERNS[i].re, '')
	}
	return stem.replace(/[-_ ]+$/, '')
}

// Analyze a folder selection. Filters to .ttf/.otf, drops extra weights,
// groups by family, picks the family with the most detected styles.
export function analyzeFontFolder(fileList) {
	let files = Array.from(fileList || [])
	if (!files.length) return null

	files = files.filter((f) => /\.(ttf|otf)$/i.test(f.name))
	if (!files.length) return null

	files = files.filter((f) => {
		const stem = f.name.replace(/\.(ttf|otf)$/i, '')
		return !EXTRA_WEIGHT_RE.test(stem)
	})
	if (!files.length) return null

	const families = {}
	files.sort((a, b) => a.name.localeCompare(b.name))
	for (let i = 0; i < files.length; i++) {
		const stem = files[i].name.replace(/\.(ttf|otf)$/i, '')
		const fam = extractFamily(stem)
		if (!families[fam]) families[fam] = { files: [], styles: {} }
		const style = detectStyle(stem)
		families[fam].styles[style] = files[i]
		families[fam].files.push(files[i])
	}

	let bestFam = ''
	let bestCount = 0
	for (const fam in families) {
		const count = Object.keys(families[fam].styles).length
		if (count > bestCount) {
			bestCount = count
			bestFam = fam
		}
	}

	const result = { regular: null, bold: null, italic: null, bolditalic: null }
	if (families[bestFam]) {
		const styles = families[bestFam].styles
		result.regular = styles.regular || null
		result.bold = styles.bold || null
		result.italic = styles.italic || null
		result.bolditalic = styles.bolditalic || null
	}

	const otherFamilies = Object.keys(families).filter((f) => f !== bestFam)

	return { result, familyName: bestFam, otherFamilies }
}

// Set a file input's FileList programmatically
export function setFileInput(inputEl, file) {
	if (!inputEl || !file) return
	const dt = new DataTransfer()
	dt.items.add(file)
	inputEl.files = dt.files
}

export function sanitizeFamilyName(name) {
	return (name || 'CustomFont').replace(/[^A-Za-z0-9_-]+/g, '')
}

export function formatSize(bytes) {
	if (bytes < 1024) return bytes + ' B'
	if (bytes < 1024 * 1024) return (bytes / 1024).toFixed(1) + ' KB'
	return (bytes / 1024 / 1024).toFixed(2) + ' MB'
}

export const INTERVAL_PRESETS = [
	{ value: 'reading', label: 'Reading', note: '(Fiction)', defaultChecked: true },
	{ value: 'default', label: 'Default', note: '(CrossPoint)' },
	{ value: 'latin-ext', label: 'Latin Extended' },
	{ value: 'greek', label: 'Greek' },
	{ value: 'cyrillic', label: 'Cyrillic' },
	{ value: 'vietnamese', label: 'Vietnamese' },
	{ value: 'hebrew', label: 'Hebrew' },
	{ value: 'arabic', label: 'Arabic', note: '(Farsi, Urdu)' },
	{ value: 'armenian', label: 'Armenian' },
	{ value: 'georgian', label: 'Georgian' },
	{ value: 'ethiopic', label: 'Ethiopic' },
	{ value: 'cherokee', label: 'Cherokee' },
	{ value: 'tifinagh', label: 'Tifinagh' },
	{ value: 'bengali', label: 'Bengali' },
	{ value: 'thai', label: 'Thai' },
	{ value: 'hangul', label: 'Hangul', note: '(Korean)' },
	{ value: 'cjk-sc', label: 'Chinese', note: '(Simplified)' },
	{ value: 'cjk-tc', label: 'Chinese', note: '(Traditional)' },
	{ value: 'cjk-jp', label: 'Japanese' },
	{ value: 'symbols', label: 'Symbols & Arrows' },
	{ value: 'ipa-chars', label: 'IPA characters' },
]

export const CJK_PRESET_VALUES = ['hangul', 'cjk-sc', 'cjk-tc', 'cjk-jp']

export const DEFAULT_UI_SIZES = ['8', '10']

const CJK_BLOCKS = [
	[0x1100, 0x11ff],
	[0x2e80, 0x2fdf],
	[0x3000, 0x33ff],
	[0x3400, 0x4dbf],
	[0x4e00, 0x9fff],
	[0xa960, 0xa97f],
	[0xac00, 0xd7ff],
	[0xf900, 0xfaff],
	[0xfe30, 0xfe4f],
	[0xff00, 0xffef],
	[0x20000, 0x2ebef],
	[0x2f800, 0x2fa1f],
	[0x30000, 0x323af],
]

export function customIntervalsContainCjk(text) {
	const re = /0x([0-9a-f]+)\s*-\s*0x([0-9a-f]+)/gi
	let m
	while ((m = re.exec(text || '')) !== null) {
		const lo = parseInt(m[1], 16)
		const hi = parseInt(m[2], 16)
		if (isNaN(lo) || isNaN(hi)) continue
		for (const [blockLo, blockHi] of CJK_BLOCKS) {
			if (lo <= blockHi && hi >= blockLo) return true
		}
	}
	return false
}
