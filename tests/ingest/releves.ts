// Relevés EVA-DTS INVENTÉS pour les essais de ventes et de ruptures (aucune donnée réelle)
// sels = ventes CUMULÉES par sélection, par exemple { 11: 10, 21: 6 } ; prix 1,40 € ; sans ligne G85 (texte non contrôlé = accepté)
export const releve = (sels: Record<number, number>, extra: string[] = []): string => {
  const n = Object.entries(sels).map(([s, v]) => [Number(s), v] as [number, number]);
  const tot = n.reduce((a, [, v]) => a + v, 0);
  return ["DXS*FAS000000001*VA*V1/6*1", "ST*001*0001", "ID1*FAS000000001* FASTER     *0091* !\"f*+120*", "ID5*261201*0930",
    "VA1*" + tot * 140 + "*" + tot + "*0*7*0**0",
    ...n.flatMap(([s, v]) => ["PA1*" + s + "*140*1100*0**1**0*99", "PA2*" + v + "*" + v * 140 + "*7"]),
    ...n.map(([s, v]) => "LA1*0*" + s + "*140*7*" + v), ...extra, "SE*20*001*0001", "DXE*1*1"].join("\r\n") + "\r\n";
};
