// Web Worker for offloading CPU-intensive font rasterization and compilation
import { buildFontPackage } from './fontConvert.js';

self.onmessage = async (e) => {
	const params = e.data;
	try {
		const builtFiles = await buildFontPackage({
			...params,
			onProgress: (p) => self.postMessage({ type: 'progress', data: p }),
			onLog: (l) => self.postMessage({ type: 'log', data: l })
		});
		self.postMessage({ type: 'done', builtFiles });
	} catch (err) {
		self.postMessage({ type: 'error', error: err.message || String(err) });
	}
};
