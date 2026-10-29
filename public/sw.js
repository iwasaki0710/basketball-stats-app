const CACHE = "courtvision-v4";
self.addEventListener("install", (event) => {
  event.waitUntil(
    (async () => {
      const cache = await caches.open(CACHE);
      await cache.addAll([
        "/",
        "/demo",
        "/icon.svg",
        "/manifest.webmanifest",
        "/demo.webmanifest",
      ]);
      const documents = await Promise.all(
        ["/", "/demo"].map((path) => cache.match(path)),
      );
      const html = (
        await Promise.all(documents.map((document) => document.text()))
      ).join("\n");
      const assets = [
        ...new Set(
          [
            ...html.matchAll(/(?:src|href)=["'](\/_next\/static\/[^"']+)["']/g),
          ].map((match) => match[1].replaceAll("&amp;", "&")),
        ),
      ];
      await cache.addAll(assets);
      await self.skipWaiting();
    })(),
  );
});
self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) =>
        Promise.all(
          keys
            .filter((key) => key.startsWith("courtvision-v") && key !== CACHE)
            .map((key) => caches.delete(key)),
        ),
      )
      .then(() => self.clients.claim()),
  );
});
self.addEventListener("fetch", (event) => {
  const url = new URL(event.request.url);
  if (
    event.request.method !== "GET" ||
    url.origin !== self.location.origin ||
    url.pathname.startsWith("/api") ||
    event.request.headers.has("RSC") ||
    url.searchParams.has("_rsc")
  )
    return;
  if (
    event.request.mode === "navigate" &&
    ["/", "/demo"].includes(url.pathname)
  ) {
    event.respondWith(
      fetch(event.request)
        .then((response) => {
          if (response.ok) {
            const copy = response.clone();
            event.waitUntil(
              caches.open(CACHE).then((cache) => cache.put(url.pathname, copy)),
            );
          }
          return response;
        })
        .catch(() =>
          caches
            .match(url.pathname)
            .then((response) => response || Response.error()),
        ),
    );
    return;
  }
  if (
    url.pathname.startsWith("/_next/static/") ||
    ["/icon.svg", "/manifest.webmanifest", "/demo.webmanifest"].includes(
      url.pathname,
    )
  ) {
    event.respondWith(
      caches.match(event.request).then(
        (cached) =>
          cached ||
          fetch(event.request).then((response) => {
            if (response.ok) {
              const copy = response.clone();
              event.waitUntil(
                caches
                  .open(CACHE)
                  .then((cache) => cache.put(event.request, copy)),
              );
            }
            return response;
          }),
      ),
    );
  }
});
