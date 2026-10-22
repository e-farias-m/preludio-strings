// test-i18n-ui.js
// Renders every screen in Brazilian Portuguese and checks that the student
// never reads English. The translation layer swaps whole text nodes, so a
// leftover English sentence means the dictionary is missing an entry.

const fs = require('fs');
const path = require('path');

const read = f => fs.readFileSync(path.join(__dirname, 'js', f), 'utf8');

global.confirm = () => true;

function makeEl() {
  const el = {
    value: '', style: {}, dataset: {}, _text: '', _html: '',
    classList: { add() {}, remove() {}, contains() { return false; } },
    appendChild() {}, addEventListener() {}, focus() {}, remove() {},
    querySelector() { return null; }, querySelectorAll() { return []; },
    setAttribute() {}, hasAttribute() { return false; },
  };
  Object.defineProperty(el, 'textContent', {
    get() { return el._text; },
    set(v) { el._text = String(v); el._html = String(v); },
  });
  Object.defineProperty(el, 'innerHTML', {
    get() { return el._html; },
    set(v) { el._html = String(v); },
  });
  return el;
}
const document = {
  addEventListener() {},
  getElementById() { return makeEl(); },
  createElement() { return makeEl(); },
  body: makeEl(),
};
const store = { preludioStringsName: 'Test' };
const localStorage = {
  getItem(k) { return k in store ? store[k] : null; },
  setItem(k, v) { store[k] = String(v); },
  removeItem(k) { delete store[k]; },
};
const navigator = { mediaDevices: { getUserMedia: () => Promise.resolve({ getTracks: () => [] }) } };
class FakeMediaRecorder {
  constructor() { this.state = 'inactive'; }
  start() { this.state = 'recording'; }
  stop() { this.state = 'inactive'; if (this.onstop) this.onstop(); }
}
const URL = { createObjectURL: () => 'blob:fake', revokeObjectURL() {} };
const Blob = class {};
const Audio = class { play() { return Promise.resolve(); } };

const sandbox = new Function('document', 'localStorage', 'window', 'navigator', 'MediaRecorder', 'URL', 'Blob', 'Audio', `
${read('curriculum.js')}
${read('graphics.js')}
${read('i18n.js')}
${read('app.js')}
return {
  CURRICULUM, APP, TRANSLATIONS, BADGES, setLang, getLang, translateHtml,
  renderSelectScreen, renderSettingsScreen, renderTutorialScreen, renderMapScreen,
  renderFirstSoundScreen, renderLookupScreen, renderPracticeScreen, renderEarScreen,
  renderMetronomePanel, renderTunerPanel, renderToolWidget, renderReportScreen,
  renderDigestScreen, renderLessonScreen, renderPresentPhase, renderSongPresentPhase,
  renderWeakSpots, renderStudentCard, renderBadgeShelf, renderInstrumentGrid,
  renderPlanCard, getNoteLessons,
};`);
const api = sandbox(document, localStorage, {}, navigator, FakeMediaRecorder, URL, Blob, Audio);

let pass = 0;
let fail = 0;
const failures = [];
function check(cond, msg) {
  if (cond) { pass++; } else { fail++; failures.push(msg); }
}

// ── Build every screen ─────────────────────────────────────────────────────
// The language is switched first, so the screens carry the wording the app
// really shows; translateHtml then deals with whatever the markup built.
api.setLang('pt');

const screens = [];
function add(name, html) { if (typeof html === 'string' && html) screens.push({ name, html }); }

api.APP.instrumentId = 'violin';
api.APP.progress = { violin: { completed: { 'vl-1': { stars: 3 } }, xp: 300, mastery: {} } };
add('select', api.renderSelectScreen());
add('settings', api.renderSettingsScreen());
add('tutorial', api.renderTutorialScreen());
add('map', api.renderMapScreen());
add('first-sound', api.renderFirstSoundScreen());
add('lookup', api.renderLookupScreen());
add('practice', api.renderPracticeScreen());
add('ear', api.renderEarScreen());
add('metronome', api.renderMetronomePanel());
add('tuner', api.renderTunerPanel());
add('tool-widget', api.renderToolWidget());
add('report', api.renderReportScreen());
add('digest', api.renderDigestScreen());
add('student-card', api.renderStudentCard('Ana'));
add('badge-shelf', api.renderBadgeShelf());
add('instrument-grid', api.renderInstrumentGrid());
add('plan-card', api.renderPlanCard('violin'));
add('weak-spots', api.renderWeakSpots('violin'));

const notes = api.getNoteLessons('violin');
add('present', api.renderPresentPhase(api.CURRICULUM.violin, notes[0]));
const song = api.CURRICULUM.violin.lessons.find(l => l.type === 'song');
if (song) add('song-present', api.renderSongPresentPhase(api.CURRICULUM.violin, song));

check(screens.length >= 18, `every screen should be covered (got ${screens.length})`);

// ── The text of a page ─────────────────────────────────────────────────────
function visibleTexts(html) {
  const out = [];
  const textRe = />([^<>]+)</g;
  let m;
  while ((m = textRe.exec(html))) {
    if (m[1].trim()) out.push(m[1].trim());
  }
  const attrRe = /\s(placeholder|title|aria-label|alt)="([^"]*)"/g;
  while ((m = attrRe.exec(html))) out.push(m[2]);
  return out;
}

// Words that mark an English sentence. Portuguese keeps a few of them
// ("nota", "são"), so a match alone is not a failure — the check below looks
// for a run of English words.
const ENGLISH_WORDS = new Set([
  'the', 'your', 'you', 'and', 'with', 'from', 'this', 'that', 'play', 'tap',
  'learn', 'sound', 'lesson', 'start', 'open', 'settings', 'progress', 'review',
  'record', 'listen', 'choose', 'every', 'before', 'after', 'first', 'next',
  'last', 'new', 'all', 'when', 'how', 'what', 'their', 'into', 'about',
  'here', 'there', 'more', 'good', 'ready', 'again', 'still', 'only', 'also',
  'than', 'then', 'them', 'these', 'those', 'where', 'while', 'does', 'make',
  'takes', 'give', 'turn', 'keep', 'help', 'show', 'see', 'try', 'use', 'now',
  'one', 'two', 'three', 'was', 'were', 'will', 'would', 'should', 'could',
  'have', 'has', 'had', 'been', 'being', 'does', 'done', 'going', 'want',
  'need', 'time', 'minute', 'day', 'week', 'note', 'notes', 'string', 'strings',
]);

function looksEnglish(text) {
  const words = text.toLowerCase().match(/[a-zà-ÿ']+/g) || [];
  if (words.length < 3) return false;
  let hits = 0;
  words.forEach(w => { if (ENGLISH_WORDS.has(w)) hits++; });
  return hits >= 3 && hits / words.length > 0.4;
}

// ── Nothing is left in English ─────────────────────────────────────────────
check(api.getLang() === 'pt', 'the app can switch to Portuguese');

const leftovers = new Map();
for (const { name, html } of screens) {
  const pt = api.translateHtml(html);
  for (const text of visibleTexts(pt)) {
    if (!looksEnglish(text)) continue;
    if (!leftovers.has(text)) leftovers.set(text, new Set());
    leftovers.get(text).add(name);
  }
}
check(leftovers.size === 0,
  `these lines are still English:\n    ${[...leftovers.keys()].map(t => JSON.stringify(t) + ' (' + [...leftovers.get(t)].join(',') + ')').join('\n    ')}`);

// ── The Portuguese really shows up ─────────────────────────────────────────
{
  const guide = api.translateHtml(api.renderFirstSoundScreen());
  check(guide.includes('Faça o seu primeiro som'), 'the first-sound guide is in Portuguese');
  check(guide.includes('Primeiro som · Violino'), 'the instrument name is in Portuguese');

  const lookup = api.translateHtml(api.renderLookupScreen());
  check(lookup.includes('Tabela de digitações · Violino'), 'the fingering chart is in Portuguese');
  check(lookup.includes('Seu dedo indicador'), 'the fingering legend is in Portuguese');

  const card = api.translateHtml(api.renderPresentPhase(api.CURRICULUM.violin, notes[0]));
  check(card.includes('Cartão de dedos'), 'the finger card is in Portuguese');
  check(card.includes('Número da corda'), 'the finger card labels are in Portuguese');
  check(card.includes('Corda G'), 'the finger card names the string');
  check(!card.includes('String number'), 'no English left in the finger card');

  const plan = api.translateHtml(api.renderPlanCard('violin'));
  check(plan.includes('O plano de hoje'), 'the plan card is in Portuguese');

  const report = api.translateHtml(api.renderReportScreen());
  check(report.includes('Relatório de prática'), 'the report is in Portuguese');
  check(report.includes('Insígnias'), 'the badge count is in Portuguese');

  const practice = api.translateHtml(api.renderPracticeScreen());
  check(practice.includes('Ginásio de dedos'), 'the practice screen is in Portuguese');
}

// ── Switching back restores the English ────────────────────────────────────
api.setLang('en');
const englishGuide = api.renderFirstSoundScreen();
check(englishGuide.includes('Make your first sound'), 'the English guide comes back');
check(englishGuide.includes('First sound · Violin'), 'the English instrument name comes back');
check(englishGuide.includes('Hold the instrument on your left shoulder'),
  'the English steps come back');
check(api.renderLookupScreen().includes('Your index finger'),
  'the English legend comes back');

if (failures.length) console.log(failures.join('\n'));
console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
