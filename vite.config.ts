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
	},
});
