// ============================================================
// BROODAUTOMATE v5.21 — Textes : carte SIM du boîtier (Digi / 1NCE) et programme complet à télécharger (FR / NL / EN)
// ============================================================

(function () {
  const D = BA.I18n.dicts;

  Object.assign(D.fr, {
    bx_sim: "Carte SIM",
    bx_sim_digi: "comme aujourd'hui (HTTPS)",
    bx_sim_1nce: "en plus, le boîtier écoute : « Lire maintenant » instantané par le Device Controller de 1NCE (à tester)",
    bx_add_note: "Choisis la carte SIM du boîtier. Une clé secrète est créée et Broodautomate te donne le programme complet du boîtier, prêt à téléverser (clé, carte SIM, mode 0 déjà écrits). Supabase ne garde que l'empreinte de la clé.",
    bx_key_ok: "C'est fait",
    bx_prog_title: "Programme du boîtier, prêt à téléverser",
    bx_prog_btn: "Télécharger le programme complet (.zip)",
    bx_prog_note: "Tout est déjà dedans : la clé de ce boîtier, la carte SIM (APN), le mode 0. Décompresse le fichier, ouvre broodautomate_lilygo.ino dans Arduino IDE et téléverse : rien à écrire.",
    bx_prog_wait: "Préparation…",
    bx_prog_done: "Téléchargé",
    bx_prog_done_note: "Fichier « {f} » téléchargé (carte {s}). Décompresse-le, ouvre broodautomate_lilygo.ino dans Arduino IDE (carte « ESP32 Dev Module »), puis Téléverser.",
    bx_prog_err: "Programme impossible à préparer : {e}",
    bx_key_manual: "Ou, à la main (ancienne méthode) : dans config.h, remplace la ligne DEVICE_KEY par celle-ci.",
    bx_key_once2: "La clé n'est montrée qu'une fois : télécharge le programme maintenant. Supabase ne garde que son empreinte. Si tu la perds : bouton 🔑 « Nouvelle clé ». Ne donne ce fichier à personne : il contient la clé.",
    bx_step4: "Arduino IDE : téléverser le programme dans le LILYGO, puis le brancher sur la machine. Le programme complet, déjà rempli, est donné quand tu ajoutes un boîtier."
  });
  Object.assign(D.nl, {
    bx_sim: "Simkaart",
    bx_sim_digi: "zoals nu (HTTPS)",
    bx_sim_1nce: "daarbij luistert de module: « Nu lezen » meteen via de Device Controller van 1NCE (te testen)",
    bx_add_note: "Kies de simkaart van de module. Er wordt een geheime sleutel gemaakt en Broodautomate geeft je het volledige programma van de module, klaar om te uploaden (sleutel, simkaart en modus 0 al ingevuld). Supabase bewaart alleen een vingerafdruk van de sleutel.",
    bx_key_ok: "Klaar",
    bx_prog_title: "Programma van de module, klaar om te uploaden",
    bx_prog_btn: "Volledig programma downloaden (.zip)",
    bx_prog_note: "Alles zit erin: de sleutel van deze module, de simkaart (APN), modus 0. Pak het bestand uit, open broodautomate_lilygo.ino in Arduino IDE en upload: niets te typen.",
    bx_prog_wait: "Voorbereiden…",
    bx_prog_done: "Gedownload",
    bx_prog_done_note: "Bestand « {f} » gedownload (kaart {s}). Pak het uit, open broodautomate_lilygo.ino in Arduino IDE (bord « ESP32 Dev Module ») en klik op Uploaden.",
    bx_prog_err: "Programma kon niet worden voorbereid: {e}",
    bx_key_manual: "Of met de hand (oude manier): vervang in config.h de regel DEVICE_KEY door deze.",
    bx_key_once2: "De sleutel wordt maar één keer getoond: download het programma nu. Supabase bewaart alleen een vingerafdruk. Kwijt? Knop 🔑 « Nieuwe sleutel ». Geef dit bestand aan niemand: de sleutel zit erin.",
    bx_step4: "Arduino IDE: het programma in de LILYGO laden, dan op de automaat aansluiten. Het volledige, ingevulde programma krijg je wanneer je een module toevoegt."
  });
  Object.assign(D.en, {
    bx_sim: "SIM card",
    bx_sim_digi: "as today (HTTPS)",
    bx_sim_1nce: "the box also listens: instant « Read now » through the 1NCE Device Controller (to be tested)",
    bx_add_note: "Choose the box's SIM card. A secret key is created and Broodautomate gives you the box's complete program, ready to upload (key, SIM card and mode 0 already filled in). Supabase only keeps the key's fingerprint.",
    bx_key_ok: "Done",
    bx_prog_title: "Box program, ready to upload",
    bx_prog_btn: "Download the complete program (.zip)",
    bx_prog_note: "Everything is inside: this box's key, the SIM card (APN), mode 0. Unzip the file, open broodautomate_lilygo.ino in Arduino IDE and upload: nothing to type.",
    bx_prog_wait: "Preparing…",
    bx_prog_done: "Downloaded",
    bx_prog_done_note: "File « {f} » downloaded ({s} card). Unzip it, open broodautomate_lilygo.ino in Arduino IDE (board « ESP32 Dev Module ») and click Upload.",
    bx_prog_err: "Could not prepare the program: {e}",
    bx_key_manual: "Or by hand (old way): in config.h, replace the DEVICE_KEY line with this one.",
    bx_key_once2: "The key is shown only once: download the program now. Supabase only keeps its fingerprint. Lost it? 🔑 « New key » button. Don't give this file to anyone: it contains the key.",
    bx_step4: "Arduino IDE: upload the program to the LILYGO, then plug it into the machine. The complete, filled-in program is given when you add a box."
  });
})();
