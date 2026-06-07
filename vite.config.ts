import { defineConfig } from "vite";
import react from "@vitejs/plugin-react-swc";
import path from "path";
import { VitePWA } from "vite-plugin-pwa";
import { createHash } from "crypto";



const createBuildId = (mode: string) => {
  const explicit = process.env.VITE_APP_BUILD_ID || process.env.COMMIT_SHA || process.env.VERCEL_GIT_COMMIT_SHA;
  if (explicit) return explicit.slice(0, 40);
  return `${mode}-${Date.now()}-${createHash("sha1").update(`${mode}-${Date.now()}`).digest("hex").slice(0, 10)}`;
};

const appVersionPlugin = (buildId: string) => ({
  name: "amehnities-app-version",
  configureServer(server: any) {
    server.middlewares.use("/version.json", (_req: any, res: any) => {
      res.setHeader("Content-Type", "application/json");
      res.setHeader("Cache-Control", "no-store, no-cache, must-revalidate, max-age=0");
      res.end(JSON.stringify({ buildId, generatedAt: new Date().toISOString() }));
    });
  },
  generateBundle(this: any) {
    this.emitFile({
      type: "asset",
      fileName: "version.json",
      source: JSON.stringify({ buildId, generatedAt: new Date().toISOString() }),
    });
  },
});

// https://vitejs.dev/config/
export default defineConfig(({ mode }) => {
  const buildId = createBuildId(mode);

  return ({
  server: {
    host: "::",
    port: 8080,
  },
  define: {
    __APP_BUILD_ID__: JSON.stringify(buildId),
    // Fallback Supabase env vars so the published build never renders a
    // blank page if the managed .env (which is gitignored on this stack)
    // isn't present at build time. import.meta.env values from a real .env
    // still take precedence because Vite loads them before these defines
    // are applied to undefined references.
    "import.meta.env.VITE_SUPABASE_URL": JSON.stringify(
      process.env.VITE_SUPABASE_URL || "https://vhuixgcjmrmfowzrulac.supabase.co"
    ),
    "import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY": JSON.stringify(
      process.env.VITE_SUPABASE_PUBLISHABLE_KEY ||
        "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InZodWl4Z2NqbXJtZm93enJ1bGFjIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NjcyMDEyNzksImV4cCI6MjA4Mjc3NzI3OX0.mKN7lvoLNdh7zZD8-m2O4qoUZ71tBmnXRzFR6fN0Uf0"
    ),
    "import.meta.env.VITE_SUPABASE_PROJECT_ID": JSON.stringify(
      process.env.VITE_SUPABASE_PROJECT_ID || "vhuixgcjmrmfowzrulac"
    ),
  },
  plugins: [
    react(),
    appVersionPlugin(buildId),
    VitePWA({

      registerType: "autoUpdate",
      devOptions: { enabled: false },
      includeAssets: ["favicon.ico", "favicon.png", "pwa-icon-192.png", "pwa-icon-512.png", "pwa-maskable-512.png", "apple-touch-icon.png"],
      manifest: {
        name: "Amehnities - Data Collection Platform",
        short_name: "Amehnities",
        description: "Professional data collection and monitoring platform for public health and developmental projects.",
        theme_color: "#1E3A8A",
        background_color: "#f5f7fa",
        display: "standalone",
        orientation: "portrait",
        scope: "/",
        start_url: "/",
        icons: [
          {
            src: "pwa-icon-192.png",
            sizes: "192x192",
            type: "image/png",
            purpose: "any",
          },
          {
            src: "pwa-icon-512.png",
            sizes: "512x512",
            type: "image/png",
            purpose: "any",
          },
          {
            src: "pwa-maskable-512.png",
            sizes: "512x512",
            type: "image/png",
            purpose: "maskable",
          },
        ],
      },
      workbox: {
        // IMPORTANT: do NOT precache html — that locks users to a stale shell.
        // HTML is fetched fresh via the NetworkFirst runtime handler below.
        globPatterns: ["**/*.{js,css,ico,png,svg,woff2}"],
        globIgnores: ["**/index.html", "index.html"],
        maximumFileSizeToCacheInBytes: 16 * 1024 * 1024, // 16 MiB
        navigateFallbackDenylist: [/^\/~oauth/],
        // Always activate the new service worker immediately and take control
        // of all open tabs so users never see a stale (e.g. old green-bg) build.
        skipWaiting: true,
        clientsClaim: true,
        cleanupOutdatedCaches: true,
        navigateFallback: "index.html",
        runtimeCaching: [
          {
            // Always fetch fresh HTML so new builds (e.g. without the old
            // green background) display immediately on next navigation.
            urlPattern: ({ request }: any) => request.mode === "navigate",
            handler: "NetworkFirst",
            options: {
              cacheName: "html-cache",
              networkTimeoutSeconds: 3,
              expiration: { maxEntries: 10 },
            },
          },
          {
            urlPattern: /^https:\/\/fonts\.googleapis\.com\/.*/i,
            handler: "CacheFirst",
            options: {
              cacheName: "google-fonts-cache",
              expiration: { maxEntries: 10, maxAgeSeconds: 60 * 60 * 24 * 365 },
              cacheableResponse: { statuses: [0, 200] },
            },
          },
          {
            urlPattern: /^https:\/\/fonts\.gstatic\.com\/.*/i,
            handler: "CacheFirst",
            options: {
              cacheName: "gstatic-fonts-cache",
              expiration: { maxEntries: 10, maxAgeSeconds: 60 * 60 * 24 * 365 },
              cacheableResponse: { statuses: [0, 200] },
            },
          },
        ],
      },
    }),
  ].filter(Boolean),
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "./src"),
    },
    dedupe: ["react", "react-dom", "react/jsx-runtime"],
  },
  });
});
