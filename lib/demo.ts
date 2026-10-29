import { Game, Kind, Workspace, quarterStart } from "./model";
const names = [
  "藤井 悠真",
  "中村 陸",
  "高橋 蓮",
  "佐藤 大翔",
  "渡辺 颯太",
  "小林 海斗",
  "伊藤 湊",
  "山本 健太",
  "松本 翔",
  "加藤 直樹",
];
export function createDemo(): Workspace {
  const players = names.map((name, i) => ({
    id: `p${i + 1}`,
    name,
    number: [4, 7, 11, 15, 23, 2, 8, 12, 21, 32][i],
    position: (["PG", "SG", "SF", "PF", "C"] as const)[i % 5],
    year: [3, 2, 3, 4, 2, 1, 2, 1, 3, 4][i],
    height: [178, 183, 188, 193, 198, 175, 181, 186, 191, 201][i],
    season: "2026",
  }));
  let seed = 43;
  const random = () => {
    seed = (seed * 1664525 + 1013904223) >>> 0;
    return seed / 4294967296;
  };
  const opponents = [
    "東都大学",
    "城西学院大学",
    "南山大学",
    "関東工科大学",
    "北央大学",
    "明成大学",
    "武蔵野大学",
    "青葉学院大学",
  ];
  const games: Game[] = opponents.map((opponent, i) => {
    const g: Game = {
      id: `demo-game-${i}`,
      opponent,
      date: `2026-10-${String(3 + i * 3).padStart(2, "0")}T14:00`,
      venue: i % 2 ? "アウェーアリーナ" : "第一体育館",
      competition: "関東大学リーグ",
      season: "2026",
      home: i % 2 === 0,
      status: "finished",
      quarterSeconds: 600,
      quarters: 4,
      starters: players.slice(0, 5).map((p) => p.id),
      roster: players.map((p) => p.id),
      events: [],
      quarter: 4,
      remaining: 0,
    };
    let seq = 0;
    const push = (
      kind: Kind,
      playerId: string,
      q: number,
      t: number,
      x?: number,
      y?: number,
    ) =>
      g.events.push({
        id: `${g.id}-${seq++}`,
        kind,
        playerId,
        quarter: q,
        elapsed: quarterStart(g, q) + t,
        ...(x !== undefined ? { x, y } : {}),
      });
    for (let q = 1; q <= 4; q++)
      for (let t = 12; t < 595; t += 12 + Math.floor(random() * 10)) {
        const p = players[Math.floor(random() * 5)].id;
        const r = random();
        let kind: Kind;
        if (r < 0.14) kind = "2PM";
        else if (r < 0.25) kind = "2PX";
        else if (r < 0.32) kind = "3PM";
        else if (r < 0.44) kind = "3PX";
        else if (r < 0.48) kind = "FTM";
        else if (r < 0.5) kind = "FTX";
        else if (r < 0.66) kind = "OPP2";
        else if (r < 0.72) kind = "OPP3";
        else if (r < 0.75) kind = "OPPFT";
        else if (r < 0.82) kind = "DREB";
        else if (r < 0.86) kind = "OREB";
        else if (r < 0.91) kind = "AST";
        else if (r < 0.94) kind = "TOV";
        else if (r < 0.97) kind = "PF";
        else if (r < 0.99) kind = "STL";
        else kind = "BLK";
        const shot = kind.startsWith("2P") || kind.startsWith("3P");
        push(
          kind,
          kind.startsWith("OPP") ? "" : p,
          q,
          t,
          shot ? 8 + random() * 84 : undefined,
          shot ? 15 + random() * 75 : undefined,
        );
      }
    return g;
  });
  games.push({
    id: "next-game",
    opponent: "桜丘大学",
    date: "2026-11-01T14:00",
    venue: "国立代々木競技場 第二体育館",
    competition: "関東大学リーグ",
    season: "2026",
    home: true,
    status: "scheduled",
    quarterSeconds: 600,
    quarters: 4,
    starters: players.slice(0, 5).map((p) => p.id),
    roster: players.map((p) => p.id),
    events: [],
    quarter: 1,
    remaining: 600,
  });
  return {
    version: 1,
    teamName: "青山工科大学",
    season: "2026",
    players,
    games,
  };
}

export const demoStorageKey = "courtvision.workspace.demo.v1";
