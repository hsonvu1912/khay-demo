import { defineConfig, type Plugin } from 'vite';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';
import { fileURLToPath } from 'node:url';

// khay-demo — configurator khay chia ngăn kéo in 3D (demo local, port 5190).
// Alias '@' → src/ mirror convention của ngan-excel-demo/furniture-brand để
// giai đoạn B copy engine nguyên văn không phải sửa import.

// GitHub Pages chạy ở SUBPATH (/khay-demo/). theme.css tham chiếu font bằng
// đường dẫn tuyệt đối '/fonts/…' (asset public không được Vite rebase) →
// rewrite Ở BUILD-TIME theo base, giống pattern ngan-excel-demo.
const BASE = process.env.GHPAGES_BASE ?? '/';
function rebasePublicAssets(): Plugin {
  return {
    name: 'rebase-public-assets',
    apply: 'build',
    transform(code, id) {
      if (BASE === '/') return null;
      if (id.includes('node_modules')) return null;
      if (!/\.(ts|tsx|css)($|\?)/.test(id)) return null;
      if (!/["'`]\/fonts\//.test(code)) return null;
      return code.replace(/(["'`])\/fonts\//g, `$1${BASE}fonts/`);
    },
  };
}

export default defineConfig({
  base: BASE,
  plugins: [react(), tailwindcss(), rebasePublicAssets()],
  resolve: {
    alias: {
      '@': fileURLToPath(new URL('./src', import.meta.url)),
    },
    dedupe: ['three'],
  },
  server: { port: 5190, strictPort: true },
  appType: 'spa',
});
