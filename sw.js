// ============================================================
// BROODAUTOMATE v5.34.6 — Service worker : reçoit les notifications (Web Push) même appli fermée
// (iPhone « ajouté à l'écran d'accueil », ordinateur). Il ne garde AUCUNE page en cache : il n'y a pas de gestionnaire « fetch »,
// donc l'appli se charge et se met à jour exactement comme avant (voir js/maj.js).
// iPhone : chaque message reçu DOIT afficher une notification, sinon iOS retire l'abonnement au bout de quelques essais.
// ============================================================
self.addEventListener("install", () => self.skipWaiting());
self.addEventListener("activate", e => e.waitUntil(self.clients.claim()));

self.addEventListener("push", e => {
  let d = {};
  try { d = e.data ? e.data.json() : {}; } catch (_x) { try { d = { texte: e.data.text() }; } catch (_y) { d = {}; } }
  e.waitUntil(self.registration.showNotification(String(d.titre || "Broodautomate").slice(0, 120), {
    body: String(d.texte || "Nouvelle alerte").slice(0, 400),
    icon: "icons/icon-192.png",
    data: { vue: d.vue || "alerts", page: /^(index|operateur)\.html$/.test(d.page || "") ? d.page : "index.html" }
  }));
});

// Toucher la notification : ouvre l'appli sur la page Alertes (ou la ramène devant si elle est déjà ouverte)
self.addEventListener("notificationclick", e => {
  e.notification.close();
  const vue = (e.notification.data && e.notification.data.vue) || "alerts", page = (e.notification.data && e.notification.data.page) || "index.html";
  e.waitUntil(self.clients.matchAll({ type: "window", includeUncontrolled: true }).then(liste => {
    for (const c of liste) {
      if (c.focus) { try { c.postMessage({ ba: "aller", vue }); } catch (_x) { /* page fermée entre-temps */ } return c.focus(); }
    }
    return self.clients.openWindow ? self.clients.openWindow(page + "#" + vue) : undefined;
  }));
});
