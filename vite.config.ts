import vue from '@vitejs/plugin-vue'
import { defineConfig } from 'vite'

// https://vite.dev/config/
export default defineConfig({
  optimizeDeps: {
    exclude: ['cubing']
  },
  build: {
    rollupOptions: {
      output: {
        manualChunks(id) {
          if (id.includes('node_modules/cubing')) return 'cubing'
        }
      }
    }
  },
  plugins: [vue({
      template: {
        compilerOptions: {
          isCustomElement: (tag) => tag.startsWith('twisty-')
        }
      }
    })
  ],
})
