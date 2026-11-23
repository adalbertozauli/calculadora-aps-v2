/* =====================================================================
   SERVICE WORKER – faz a Calculadora APS 2.0 funcionar SEM INTERNET.

   Igual à versão 1 (network-first, 4 s de espera), com dois cuidados novos,
   porque a 2.0 fica no MESMO domínio da versão 1 (adalbertozauli.github.io):
   - As cópias usam o prefixo "calculadora-aps-v2-" e, ao atualizar, só apagamos
     cópias com esse prefixo. Assim a 2.0 nunca apaga a cópia da versão 1.
   - O sw.js da versão 1 apaga TODAS as cópias com outro nome quando ele se
     atualiza (inclusive a da 2.0). Por isso a página pede "garantir-copia"
     sempre que abre: se faltar algum arquivo, ele é guardado de novo.

   Para manutenção: acrescentou ou renomeou arquivos? Atualize ARQUIVOS e
   troque o número da VERSAO (ex.: v1 → v2).
   ===================================================================== */

const PREFIXO = "calculadora-aps-v2-";
const VERSAO = PREFIXO + "v1";

const ARQUIVOS = [
  "./",
  "index.html",
  "calculadora-aps.html",
  "manifest.webmanifest",
  "icones/apple-touch-icon.png",
  "icones/icone-192.png",
  "icones/icone-512.png",
  "icones/icone-maskable-512.png"
];

const ESPERA_MAXIMA_MS = 4000;

self.addEventListener("install", function (evento) {
  evento.waitUntil(caches.open(VERSAO).then(function (cache) { return cache.addAll(ARQUIVOS); }));
  self.skipWaiting();
});

self.addEventListener("activate", function (evento) {
  evento.waitUntil(
    caches.keys().then(function (nomes) {
      return Promise.all(nomes
        .filter(function (nome) { return nome.indexOf(PREFIXO) === 0 && nome !== VERSAO; })
        .map(function (nome) { return caches.delete(nome); }));
    }).then(function () { return self.clients.claim(); })
  );
});

// Refaz a cópia só dos arquivos que estiverem faltando
function garantirCopia() {
  return caches.open(VERSAO).then(function (cache) {
    return Promise.all(ARQUIVOS.map(function (arquivo) {
      return cache.match(arquivo).then(function (achado) {
        if (achado) return;
        return fetch(arquivo).then(function (r) { if (r.ok) return cache.put(arquivo, r); }).catch(function () {});
      });
    }));
  });
}

self.addEventListener("message", function (evento) {
  if (evento.data === "garantir-copia") evento.waitUntil(garantirCopia());
});

self.addEventListener("fetch", function (evento) {
  const pedido = evento.request;
  if (pedido.method !== "GET" || new URL(pedido.url).origin !== self.location.origin) return;

  evento.respondWith(
    buscarNaInternet(pedido)
      .then(function (resposta) {
        if (resposta && resposta.ok) {
          const copia = resposta.clone();
          caches.open(VERSAO).then(function (cache) { cache.put(pedido, copia); });
        }
        return resposta;
      })
      .catch(function () {
        return caches.match(pedido, { ignoreSearch: true, cacheName: VERSAO }).then(function (guardado) {
          if (guardado) return guardado;
          if (pedido.mode === "navigate") return caches.match("calculadora-aps.html", { cacheName: VERSAO });
          return Response.error();
        });
      })
  );
});

function buscarNaInternet(pedido) {
  return new Promise(function (resolver, rejeitar) {
    const relogio = setTimeout(function () { rejeitar(new Error("demorou")); }, ESPERA_MAXIMA_MS);
    fetch(pedido).then(
      function (r) { clearTimeout(relogio); resolver(r); },
      function (e) { clearTimeout(relogio); rejeitar(e); }
    );
  });
}
