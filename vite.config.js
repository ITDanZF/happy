const path = require('node:path');
const { defineConfig } = require('vite');

module.exports = defineConfig(({ mode }) => {
    const isProduction = mode === 'production';

    return {
        resolve: {
            alias: {
                '@': path.resolve(__dirname, 'src'),
            },
        },
        server: {
            host: true,
            open: true,
        },
        build: {
            sourcemap: !isProduction,
            target: 'es2020',
            cssCodeSplit: false,
            rollupOptions: {
                output: {
                    // 关闭 code splitting，保证产物只有一个 JS bundle，方便完全内联进 HTML。
                    inlineDynamicImports: true,
                    manualChunks: undefined,
                },
            },
        },
    };
});
