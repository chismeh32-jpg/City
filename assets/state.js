// Urbania — the saved game state: creation, loading, saving and replacing it.
import { pick, setStyle } from './buildings.js';
import { ELECTION_EVERY, FUNDS, N, SAVE_KEY, initialTree } from './config.js';

/* ---------------------------------------------------------------- state */
function newState() {
  return {
    name: 'Villanueva', style: 'clasico', money: 60000, minutes: 7 * 60, day: 1, approval: 62, speed: 1,
    taxes: { res: 12, com: 12, off: 12, ind: 12 },
    funding: Object.fromEntries(FUNDS.map(([k]) => [k, 100])),
    party: null, laws: {}, nextElection: 1 + ELECTION_EVERY, terms: 0, history: [],
    loan: null, weather: 'sun', tutorial: 0, tutorialHidden: false, budgetSeen: false, best: 0,
    tiles: Array.from({ length: N * N }, (_, i) => ({ t: 0, z: null, lv: 0, s: null, v: 0, tree: initialTree(i) })),
  };
}
// returns a full state from saved data, or null if it is not a valid save
function fromSave(s) {
  if (!s || !Array.isArray(s.tiles) || s.tiles.length !== N * N) return null;
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

export { newState, fromSave, load, save, S, setState };
