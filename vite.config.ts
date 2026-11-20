import tailwindcss from '@tailwindcss/vite';
import react from '@vitejs/plugin-react';
import fs from 'fs';
import path from 'path';
import {defineConfig} from 'vite';

function normalizeBasePath(raw?: string): string {
  const trimmed = (raw ?? '').trim();
  if (!trimmed || trimmed === '/') {
    return '/';
  }
  const withLeading = trimmed.startsWith('/') ? trimmed : `/${trimmed}`;
  return withLeading.endsWith('/') ? withLeading : `${withLeading}/`;
}

function resolveBasePath(): string {
  // 1. Explicit override (used automatically by GitHub Actions workflow, or set VITE_BASE_PATH=/nama-repo/ locally)
  if (process.env.VITE_BASE_PATH !== undefined) {
    return normalizeBasePath(process.env.VITE_BASE_PATH);
  }

  // 2. Auto-detect repository subpath in GitHub Actions CI when GITHUB_REPOSITORY="owner/repo"
  const ghRepo = process.env.GITHUB_REPOSITORY;
  if (ghRepo && ghRepo.includes('/')) {
    const [owner, repo] = ghRepo.split('/');
    if (repo.toLowerCase() === `${owner.toLowerCase()}.github.io`) {
      return '/';
    }
    return normalizeBasePath(repo);
  }

  // 3. Default '/' untuk dev/preview. Jika build manual untuk GitHub Pages tanpa env var,
  //    ubah '/' di bawah menjadi '/NAMA-REPO-ANDA/'
  return '/';
}

export default defineConfig(() => {
  return {
    base: resolveBasePath(),
    plugins: [
      react(),
      tailwindcss(),
      // Copies src/assets into dist/ and duplicates index.html to 404.html for GitHub Pages fallback.
      {
        name: 'copy-unbundled-src-assets',
        apply: 'build',
        closeBundle(error?: Error): void {
          if (error) {
            return;
          }
          const distDir = path.resolve(__dirname, 'dist');
          const srcAssets = path.resolve(__dirname, 'src/assets');
          const distAssets = path.resolve(distDir, 'src/assets');
          if (fs.existsSync(distDir) && fs.existsSync(srcAssets)) {
            fs.cpSync(srcAssets, distAssets, {recursive: true, force: true});
          }
          const indexHtml = path.resolve(distDir, 'index.html');
          const notFoundHtml = path.resolve(distDir, '404.html');
          if (fs.existsSync(indexHtml)) {
            fs.copyFileSync(indexHtml, notFoundHtml);
          }
        },
      },
    ],
    resolve: {
      alias: {
        '@': path.resolve(__dirname, '.'),
      },
    },
    server: {
      // HMR is disabled in AI Studio via DISABLE_HMR env var.
      // Do not modify—file watching is disabled to prevent flickering during agent edits.
      hmr: process.env.DISABLE_HMR !== 'true',
      // Disable file watching when DISABLE_HMR is true to save CPU during agent edits.
      watch: process.env.DISABLE_HMR === 'true' ? null : {},
    },
  };
});
