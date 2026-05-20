import react from '@vitejs/plugin-react';
import { defineConfig } from 'vite';

export default defineConfig({
    base: './',
    plugins: [react()],
    server: {
        port: Number(process.env.ADMIN_PORT ?? 7333),
    },
});
