import { defineConfig } from 'vite';

export default defineConfig({
  // 优化依赖项，强制包含 mediapipe
  optimizeDeps: {
    include: ['@mediapipe/hands', '@mediapipe/drawing_utils']
  },
  build: {
    // 关闭压缩混淆，虽然文件会大一点，但能保证 MediaPipe 不报错
    minify: false, 
    commonjsOptions: {
      include: [/@mediapipe\/hands/, /@mediapipe\/drawing_utils/]
    }
  }
});

