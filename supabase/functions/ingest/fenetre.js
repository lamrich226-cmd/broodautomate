// Le lecteur de relevés EVA-DTS (evadts-parser.js) est écrit pour le navigateur : il range ses fonctions dans « window.BA ».
// Ce petit fichier prépare ce même décor dans la fonction. Il doit être importé AVANT evadts-parser.js.
globalThis.window = globalThis;
globalThis.BA = globalThis.BA || {};
