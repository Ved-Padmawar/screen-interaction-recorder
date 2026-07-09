import { defineConfig, type UserConfig } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'
import { cpSync, copyFileSync, existsSync, mkdirSync } from 'node:fs'
import { resolve } from 'node:path'

const extensionFiles = ['manifest.json'] as const

function copyExtensionAssets() {
  return {
    name: 'copy-extension-assets',
    closeBundle() {
      const outDir = resolve(__dirname, 'dist')

      for (const file of extensionFiles) {
        copyFileSync(resolve(__dirname, file), resolve(outDir, file))
      }

      const iconsOutDir = resolve(outDir, 'icons')
      if (!existsSync(iconsOutDir)) mkdirSync(iconsOutDir, { recursive: true })
      cpSync(resolve(__dirname, 'icons'), iconsOutDir, { recursive: true })
    },
  }
}

/**
 * MV3 injects content scripts as classic scripts, so `contentScript.js` must be
 * a self-contained IIFE with no `import` statements. Sharing the main build pass
 * would let Rollup hoist common modules (domain/contracts) into a chunk the
 * content script could only reach via an ES import, which throws
 * "Cannot use import statement outside a module" at injection time. So it gets
 * its own pass. The extension pages and the background service worker are
 * modules and bundle normally.
 *
 * The content-script pass runs second and must not wipe the main pass's output.
 */
const contentScriptConfig: UserConfig = {
  build: {
    outDir: 'dist',
    emptyOutDir: false,
    minify: true,
    rollupOptions: {
      input: { contentScript: 'src/contentScript.ts' },
      output: {
        entryFileNames: '[name].js',
        format: 'iife',
      },
    },
  },
}

const extensionConfig: UserConfig = {
  plugins: [react(), tailwindcss(), copyExtensionAssets()],
  build: {
    rollupOptions: {
      input: {
        popup: 'popup.html',
        recordings: 'recordings.html',
        viewer: 'viewer.html',
        tooltipEditor: 'tooltip-editor.html',
        background: 'src/background.ts',
      },
      output: {
        entryFileNames: '[name].js',
        chunkFileNames: 'assets/[name]-[hash].js',
        assetFileNames: 'assets/[name]-[hash][extname]',
      },
    },
  },
}

export default defineConfig(({ mode }) => (mode === 'content-script' ? contentScriptConfig : extensionConfig))
