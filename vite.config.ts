import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';
import basicSsl from '@vitejs/plugin-basic-ssl';

// `npm run dev:https` serves over HTTPS with a self-signed certificate so a phone on the same
// Wi-Fi can open the camera (browsers only allow camera access on HTTPS or localhost).
export default defineConfig(({ mode }) => ({
  plugins: [react(), tailwindcss(), ...(mode === 'https' ? [basicSsl()] : [])],
  worker: { format: 'es' },
  server: {
    proxy: {
      '/api': { target: 'http://localhost:8787', changeOrigin: true },
    },
  },
  // Pre-bundle the analyser worker's dependencies up front, so the first visit doesn't trigger a dev-server reload.
  optimizeDeps: { exclude: ['@huggingface/transformers'], include: ['@gutenye/ocr-common', '@gutenye/ocr-common/splitIntoLineImages', 'onnxruntime-web/webgpu'] },
}));
