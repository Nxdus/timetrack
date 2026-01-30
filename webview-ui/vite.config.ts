import { defineConfig } from 'vite';
import tailwindcss from '@tailwindcss/vite';
import react from '@vitejs/plugin-react';
import path from 'path';

export default defineConfig({
	plugins: [react(), tailwindcss()],
	resolve: {
		alias: {
			'@': path.resolve(__dirname, './src')
		}
	},
	base: './',
	build: {
		outDir: path.resolve(__dirname, '../dist/webview'),
		emptyOutDir: true
	}
});
