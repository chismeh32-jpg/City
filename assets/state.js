// Urbania — the saved game state: creation, loading, saving and replacing it.
import { pick, setStyle } from './buildings.js';
import { ELECTION_EVERY, FUNDS, HW_LEN, HW_Z, N, OLD_N, OLD_OFF, PLOTS, SAVE_KEY, initialTree } from './config.js';

/* ---------------------------------------------------------------- state */
function newState() {
  return {
    name: 'Villanueva', style: 'clasico', money: 60000, minutes: 7 * 60, day: 1, approval: 62, speed: 1,
    taxes: { res: 12, com: 12, off: 12, ind: 12 },
    funding: Object.fromEntries(FUNDS.map(([k]) => [k, 100])),
    party: null, laws: {}, nextElection: 1 + ELECTION_EVERY, terms: 0, history: [], rank: null, stats: [],
    loan: null, weather: 'sun', tutorial: 0, tutorialHidden: false, budgetSeen: false, best: 0,
    tiles: withHighway(Array.from({ length: N * N }, (_, i) => ({ t: 0, z: null, lv: 0, s: null, v: 0, tree: initialTree(i) }))),
    owned: startPlots(), disasters: true, trash: 0,
  };
}
// the motorway from the west edge of the map to the land the city starts with
function withHighway(tiles) {
  for (let x = 0; x < HW_LEN; x++) Object.assign(tiles[HW_Z * N + x], { t: 'road', av: 1, hw: 1, z: null, s: null, lv: 0, tree: false });
  return tiles;
}
// the four plots in the middle of the map
function startPlots() {
  const m = PLOTS / 2;
  return Array.from({ length: PLOTS * PLOTS }, (_, p) => (p % PLOTS === m - 1 || p % PLOTS === m) && (((p / PLOTS) | 0) === m - 1 || ((p / PLOTS) | 0) === m));
}
// a save from the small 44×44 map is placed in the middle of the big one
function upgradeTiles(old) {
  const tiles = Array.from({ length: N * N }, (_, i) => ({ t: 0, z: null, lv: 0, s: null, v: 0, tree: initialTree(i) }));
  old.forEach((T, k) => { tiles[(Math.floor(k / OLD_N) + OLD_OFF) * N + (k % OLD_N) + OLD_OFF] = T; });
  return tiles;
}
// returns a full state from saved data, or null if it is not a valid save
function fromSave(s) {
  if (!s || !Array.isArray(s.tiles)) return null;
  if (s.tiles.length === OLD_N * OLD_N) s = { ...s, tiles: upgradeTiles(s.tiles) };
  if (s.tiles.length !== N * N) return null;
  if (!Array.isArray(s.owned) || s.owned.length !== PLOTS * PLOTS) s = { ...s, owned: startPlots() };
  if (!s.tiles[HW_Z * N].hw) withHighway(s.tiles);
  const fresh = newState();
  // merge nested settings so saves from older versions pick up new budget lines
  return Object.assign(fresh, s, { funding: { ...fresh.funding, ...s.funding }, taxes: { ...fresh.taxes, ...s.taxes }, laws: { ...s.laws } });
}
function load() {
  try { return fromSave(JSON.parse(localStorage.getItem(SAVE_KEY))) || newState(); } catch { /* corrupt or unavailable storage */ }
  return newState();
}
function save() { try { localStorage.setItem(SAVE_KEY, JSON.stringify(S)); } catch { /* storage unavailable */ } }
let S = load();
function setState(next) { S = next; }
setStyle(S.style);

export { withHighway, startPlots, upgradeTiles, newState, fromSave, load, save, S, setState };
