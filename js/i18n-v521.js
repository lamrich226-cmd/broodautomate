// ============================================================
// BROODAUTOMATE v5.21 — Textes : carte SIM du boîtier (Digi / 1NCE) et programme complet à télécharger (FR / NL / EN)
// ============================================================

(function () {
  const D = BA.I18n.dicts;

  Object.assign(D.fr, {
    bx_sim: "Carte SIM",
    bx_sim_digi: "ancienne carte : envois en HTTPS (plus de data)",
    bx_sim_1nce: "tout passe en UDP : « Lire maintenant » instantané, très peu de data (conseillé)",
    bx_key_ok: "C'est fait",
    bx_prog_title: "Programme du boîtier, prêt à téléverser",
    bx_prog_btn: "Télécharger le programme complet (.zip)",
    bx_prog_wait: "Préparation…",
    bx_prog_done: "Téléchargé",
    bx_prog_done_note: "Fichier « {f} » téléchargé (carte {s}). Décompresse-le, ouvre broodautomate_lilygo.ino dans Arduino IDE (carte « ESP32 Dev Module »), puis Téléverser.",
    bx_prog_err: "Programme impossible à préparer : {e}",
    bx_key_once2: "La clé n'est montrée qu'une fois : télécharge le programme maintenant. Supabase ne garde que son empreinte. Si tu la perds : bouton 🔑 « Nouvelle clé ». Ne donne ce fichier à personne : il contient la clé.",
    });
  Object.assign(D.nl, {
    bx_sim: "Simkaart",
    bx_sim_digi: "oude kaart: verzenden via HTTPS (meer data)",
    bx_sim_1nce: "alles via UDP: « Nu lezen » meteen, heel weinig data (aangeraden)",
    bx_key_ok: "Klaar",
    bx_prog_title: "Programma van de module, klaar om te uploaden",
    bx_prog_btn: "Volledig programma downloaden (.zip)",
    bx_prog_wait: "Voorbereiden…",
    bx_prog_done: "Gedownload",
    bx_prog_done_note: "Bestand « {f} » gedownload (kaart {s}). Pak het uit, open broodautomate_lilygo.ino in Arduino IDE (bord « ESP32 Dev Module ») en klik op Uploaden.",
    bx_prog_err: "Programma kon niet worden voorbereid: {e}",
    bx_key_once2: "De sleutel wordt maar één keer getoond: download het programma nu. Supabase bewaart alleen een vingerafdruk. Kwijt? Knop 🔑 « Nieuwe sleutel ». Geef dit bestand aan niemand: de sleutel zit erin.",
    });
  Object.assign(D.en, {
    bx_sim: "SIM card",
    bx_sim_digi: "old card: sends over HTTPS (more data)",
    bx_sim_1nce: "everything over UDP: instant « Read now », very little data (recommended)",
    bx_key_ok: "Done",
    bx_prog_title: "Box program, ready to upload",
    bx_prog_btn: "Download the complete program (.zip)",
    bx_prog_wait: "Preparing…",
    bx_prog_done: "Downloaded",
    bx_prog_done_note: "File « {f} » downloaded ({s} card). Unzip it, open broodautomate_lilygo.ino in Arduino IDE (board « ESP32 Dev Module ») and click Upload.",
    bx_prog_err: "Could not prepare the program: {e}",
    bx_key_once2: "The key is shown only once: download the program now. Supabase only keeps its fingerprint. Lost it? 🔑 « New key » button. Don't give this file to anyone: it contains the key.",
    });
})();
