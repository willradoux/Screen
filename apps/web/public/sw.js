// Service worker do Screen. Faz o site ser instalável e abrir rápido.
// Regras: NUNCA guarda respostas da API nem do Socket.IO (dados sempre frescos e privados);
// guarda só os arquivos do próprio site, para abrir mesmo com internet ruim.
const CACHE = 'screem-shell-v1';
const SHELL = ['/', '/manifest.webmanifest', '/icon-192.png', '/icon-512.png'];

self.addEventListener('install', (event) => {
  event.waitUntil(caches.open(CACHE).then((c) => c.addAll(SHELL)));
  self.skipWaiting();
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) => Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k))))
      .then(() => self.clients.claim()),
  );
});

self.addEventListener('fetch', (event) => {
  const req = event.request;
  const url = new URL(req.url);
  // Outras origens (API, LiveKit, Discord) e métodos de escrita passam direto.
  if (req.method !== 'GET' || url.origin !== self.location.origin) return;

  // Navegação: rede primeiro; se estiver sem internet, mostra a casca do app.
  if (req.mode === 'navigate') {
    event.respondWith(fetch(req).catch(() => caches.match('/')));
    return;
  }

  // Arquivos com hash no nome (/assets/...) nunca mudam: cache primeiro.
  if (url.pathname.startsWith('/assets/')) {
    event.respondWith(
      caches.match(req).then(
        (hit) =>
          hit ||
          fetch(req).then((res) => {
            const copy = res.clone();
            void caches.open(CACHE).then((c) => c.put(req, copy));
            return res;
          }),
      ),
    );
  }
});
