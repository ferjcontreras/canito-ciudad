import { defineConfig } from 'vite';
export default defineConfig({
    server: {
        port: 3001,
        open: true,
    },
    build: {
        rollupOptions: {
            input: {
                main: 'index.html', // Canito en la Ciudad
                zombies: 'zombies.html', // modo zombies (referencia / reuso)
            },
        },
    },
});
