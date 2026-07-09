import { defineConfig } from 'vite'
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

export default defineConfig({
  plugins: [react(), tailwindcss(), copyExtensionAssets()],
  build: {
    rollupOptions: {
      input: {
        popup: 'popup.html',
        recordings: 'recordings.html',
        viewer: 'viewer.html',
        tooltipEditor: 'tooltip-editor.html',
        background: 'src/background.ts',
        contentScript: 'src/contentScript.ts',
      },
      output: {
        entryFileNames: '[name].js',
        chunkFileNames: 'assets/[name]-[hash].js',
        assetFileNames: 'assets/[name]-[hash][extname]',
      },
    },
  },
})
