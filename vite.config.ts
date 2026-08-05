/// <reference types="vitest/config" />
import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';

// BASE_PATH lets the GitHub Pages workflow serve the app from /<repo>/.
export default defineConfig({
	base: process.env.BASE_PATH ?? '/',
	plugins: [react(), tailwindcss()],
	worker: {
		format: 'es',
	},
	build: {
		chunkSizeWarningLimit: 1500,
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
				statements: 63,
				branches: 68,
				functions: 66,
				lines: 63,
			},
		},
	},
});
