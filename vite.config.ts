/// <reference types="vitest/config" />
import { defineConfig, type Plugin } from 'vite';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';

/**
 * Content-Security-Policy for the built app. The app is fully client-side, so
 * the strongest guarantee here is `connect-src 'self'` (plus local blob:/data:):
 * it forbids every cross-origin connection, backing the promise that user files
 * never leave the device. `'unsafe-inline'` is required for the pre-paint theme
 * script in index.html and for inline style attributes; `'wasm-unsafe-eval'`
 * lets pdf.js run its WebAssembly image decoders. It is injected only for the
 * production build so the Vite dev server (HMR websocket, injected scripts) is
 * left untouched.
 */
const CONTENT_SECURITY_POLICY = [
	"default-src 'self'",
	"script-src 'self' 'unsafe-inline' 'wasm-unsafe-eval'",
	"style-src 'self' 'unsafe-inline'",
	"img-src 'self' blob: data:",
	"font-src 'self' data:",
	"worker-src 'self' blob:",
	"connect-src 'self' blob: data:",
	"object-src 'none'",
	"base-uri 'self'",
	"form-action 'none'",
].join('; ');

function contentSecurityPolicy(): Plugin {
	return {
		name: 'pixelpress-csp',
		apply: 'build',
		transformIndexHtml() {
			return [
				{
					tag: 'meta',
					attrs: { 'http-equiv': 'Content-Security-Policy', content: CONTENT_SECURITY_POLICY },
					injectTo: 'head-prepend',
				},
			];
		},
	};
}

// BASE_PATH lets the GitHub Pages workflow serve the app from /<repo>/.
export default defineConfig({
	base: process.env.BASE_PATH ?? '/',
	plugins: [react(), tailwindcss(), contentSecurityPolicy()],
	worker: {
		format: 'es',
	},
	build: {
		rollupOptions: {
			output: {
				// pdf-lib is used by the eagerly-loaded Images → PDF view, so it
				// loads on first paint regardless; giving it its own chunk just lets
				// it cache independently of the app code. pdf.js is deliberately NOT
				// listed here: it is only reached through the dynamically-imported
				// PDF views, so leaving it in the automatic split keeps it out of the
				// initial download.
				manualChunks(id) {
					if (id.includes('node_modules/pdf-lib')) {
						return 'pdf-lib';
					}
					return undefined;
				},
			},
		},
	},
	test: {
		environment: 'jsdom',
		globals: true,
		setupFiles: ['./src/test/setup.ts'],
		include: ['src/**/*.{test,spec}.{ts,tsx}'],
		coverage: {
			provider: 'v8',
			reporter: ['text', 'text-summary', 'json-summary', 'lcov'],
			reportsDirectory: './coverage',
			include: ['src/lib/**/*.ts', '.github/scripts/**/*.mjs'],
			exclude: ['src/lib/types.ts', '**/*.d.ts', '**/*.d.mts'],
			// Thresholds sit just below current coverage so they act as a
			// ratchet against regressions. They are not a target: the remaining
			// gap is mostly download.ts and pdfToImages.ts, which need canvas
			// and the pdf.js worker and are verified in a real browser instead.
			thresholds: {
				statements: 67,
				branches: 74,
				functions: 70,
				lines: 67,
			},
		},
	},
});
