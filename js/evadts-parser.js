// ============================================================
// BROODAUTOMATE — Parser EVA-DTS
// Lit les trames envoyées par la machine FAS
// Fonctionne aussi avec les trames du simulateur
// ============================================================

window.BA = window.BA || {};

BA.EvaDts = {
  parse(text) {
    const result = {
      machineId:    null,
      machineModel: null,
      va1:          null,
      selections:   [],
      events:       [],
      raw:          text
    };

    const lines = text
      .split(/\r?\n/)
      .map(l => l.trim())
      .filter(Boolean);

    let currentSelection = null;

    for (const line of lines) {
      const fields = line.split("*");
      const tag    = fields[0];

      switch (tag) {

        case "DXS":
          result.header = {
            sender:  fields[1],
            version: fields[3]
          };
          break;

        case "ID1":
          result.machineId    = fields[1];
          result.machineModel = fields[2];
          break;

        case "VA1":
          result.va1 = {
            valueTotal:       Number(fields[1]) / 100,
            countTotal:       Number(fields[2]),
            valueSinceReset:  Number(fields[3]) / 100,
            countSinceReset:  Number(fields[4])
          };
          break;

        case "PA1":
          currentSelection = {
            selection: Number(fields[1]),
            price:     Number(fields[2]) / 100,
            sold:      0,
            value:     0
          };
          result.selections.push(currentSelection);
          break;

        case "PA2":
          if (currentSelection) {
            currentSelection.sold  = Number(fields[1]);
            currentSelection.value = Number(fields[2]) / 100;
          }
          break;

        case "EA1":
          result.events.push({
            code:  fields[1],
            date:  fields[2],
            time:  fields[3],
            level: "error"
          });
          break;

        case "MA5":
          result.events.push({
            code:   fields[1],
            detail: fields[2],
            level:  "error"
          });
          break;

        default:
          break;
      }
    }

    return result;
  }
};