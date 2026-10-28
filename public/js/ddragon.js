const BASE = "https://ddragon.leagueoflegends.com";
const LOCALE = "en_US";
const SHARD_ICONS = "https://raw.communitydragon.org/latest/plugins/rcp-be-lol-game-data/global/default/v1/perk-images/statmods";

/** Stat shards are not part of Data Dragon's runesReforged.json. */
const SHARD_ROWS = [
  [
    shard(5008, "Adaptive Force", "AF", "statmodsadaptiveforceicon.png"),
    shard(5005, "Attack Speed", "AS", "statmodsattackspeedicon.png"),
    shard(5007, "Ability Haste", "AH", "statmodscdrscalingicon.png"),
  ],
  [
    shard(5008, "Adaptive Force", "AF", "statmodsadaptiveforceicon.png"),
    shard(5010, "Move Speed", "MS", "statmodsmovementspeedicon.png"),
    shard(5001, "Health Scaling", "HP+", "statmodshealthplusicon.png"),
  ],
  [
    shard(5011, "Health", "HP", "statmodshealthscalingicon.png"),
    shard(5013, "Tenacity and Slow Resist", "TEN", "statmodstenacityicon.png"),
    shard(5001, "Health Scaling", "HP+", "statmodshealthplusicon.png"),
  ],
];

function shard(id, name, short, icon) {
  return { id, name, short, icon: `${SHARD_ICONS}/${icon}` };
}

async function fetchJson(url) {
  const res = await fetch(url);
  if (!res.ok) throw new Error(`Could not load ${url}`);
  return res.json();
}

export async function loadGameData() {
  const [version] = await fetchJson(`${BASE}/api/versions.json`);
  const cdn = `${BASE}/cdn/${version}`;
  const [championJson, runeJson, spellJson] = await Promise.all([
    fetchJson(`${cdn}/data/${LOCALE}/champion.json`),
    fetchJson(`${cdn}/data/${LOCALE}/runesReforged.json`),
    fetchJson(`${cdn}/data/${LOCALE}/summoner.json`),
  ]);

  const champions = Object.values(championJson.data)
    .map((c) => ({
      id: Number(c.key),
      alias: c.id,
      name: c.name,
      image: `${cdn}/img/champion/${c.image.full}`,
    }))
    .sort((a, b) => a.name.localeCompare(b.name));

  const spells = Object.values(spellJson.data)
    .map((spell) => ({
      id: Number(spell.key),
      name: spell.name,
      image: `${cdn}/img/spell/${spell.image.full}`,
      modes: spell.modes,
    }))
    .sort((a, b) => a.name.localeCompare(b.name));

  const styles = runeJson.map((style) => ({
    id: style.id,
    name: style.name,
    icon: `${BASE}/cdn/img/${style.icon}`,
    slots: style.slots.map((slot) =>
      slot.runes.map((rune) => ({
        id: rune.id,
        name: rune.name,
        icon: `${BASE}/cdn/img/${rune.icon}`,
        description: rune.shortDesc.replace(/<[^>]+>/g, ""),
      })),
    ),
  }));

  const perks = new Map();
  for (const style of styles) {
    for (const rune of style.slots.flat()) perks.set(rune.id, { ...rune, styleId: style.id });
  }
  for (const s of SHARD_ROWS.flat()) perks.set(s.id, s);

  return {
    version,
    champions,
    championsById: new Map(champions.map((c) => [c.id, c])),
    styles,
    stylesById: new Map(styles.map((s) => [s.id, s])),
    perks,
    shardRows: SHARD_ROWS,
    spells,
    spellsById: new Map(spells.map((s) => [s.id, s])),
  };
}
