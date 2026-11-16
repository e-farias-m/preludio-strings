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
  CURRICULUM, APP, TRANSLATIONS, NOTE_TO_SOLFEGE_PT, NOTE_TO_SOLFEGE_FR, BADGES, setLang, getLang, translateHtml,
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
// Each pass switches the language first, so the screens carry the wording the
// app really shows; translateHtml then deals with whatever the markup built.
api.setLang('pt');

function collectScreens() {
  const screens = [];
  const add = (name, html) => { if (typeof html === 'string' && html) screens.push({ name, html }); };

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
  return screens;
}

const notes = api.getNoteLessons('violin');

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

// A rendered word is safe when it appears somewhere in the language's
// dictionary (values only — keys stay English, so an unwrapped key used at
// render time still gets flagged). Note names come from the solfège map, and
// the names the tests inject are allow-listed.
function buildCorpus(lang, solfege) {
  const parts = Object.values(api.TRANSLATIONS[lang] || {}).map(v => String(v).toLowerCase());
  if (solfege) parts.push(...Object.values(solfege).map(v => String(v).toLowerCase()));
  // translateHtml's pattern fallbacks produce text that is not a dictionary
  // value ("Faltam 20 min…"); their output words are valid too.
  const patternSrc = (read('i18n.js').match(/var (?:PT|FR)_PATTERNS = \[[\s\S]*?\n\];/g) || []).join('\n').toLowerCase();
  parts.push(patternSrc);
  return parts.join(' · ');
}

const DYNAMIC_OK = new Set(['ana', 'test', 'bpm', 'undefined', 'largo', 'andante', 'moderato', 'allegro', 'presto']);

function looksEnglish(text, corpus) {
  const words = text.toLowerCase().match(/[a-zà-ÿ]{3,}/g) || [];
  if (!words.length) return false;
  return words.some(w => !DYNAMIC_OK.has(w) && !corpus.includes(w));
}

// ── Nothing is left in English ─────────────────────────────────────────────
for (const lang of ['pt', 'fr']) {
  const corpus = buildCorpus(lang, lang === 'pt' ? api.NOTE_TO_SOLFEGE_PT : (api.NOTE_TO_SOLFEGE_FR || null));
  api.setLang(lang);
  const screens = collectScreens();
  check(screens.length >= 18, `${lang}: every screen should be covered (got ${screens.length})`);
  const leftovers = new Map();
  for (const { name, html } of screens) {
    const out = api.translateHtml(html);
    for (const text of visibleTexts(out)) {
      if (!looksEnglish(text, corpus)) continue;
      if (!leftovers.has(text)) leftovers.set(text, new Set());
      leftovers.get(text).add(name);
    }
  }
  check(leftovers.size === 0,
    `${lang}: these lines are still English:\n    ${[...leftovers.keys()].map(t => JSON.stringify(t) + ' (' + [...leftovers.get(t)].join(',') + ')').join('\n    ')}`);
}
api.setLang('pt');

// ── Nothing is left in English ─────────────────────────────────────────────
// ── Dictionary completeness ────────────────────────────────────────────────
// Every literal t()/tFill() key in the app must exist in pt and fr, or that
// language silently falls back to English. Words that are spelled the same in
// both languages on purpose are allow-listed.
const appSrc = read('app.js') + '\n' + read('curriculum.js');
const keyRe = /(?:\b|\W)(?:t|tFill)\(\s*('(?:[^'\\]|\\.)*'|"(?:[^"\\]|\\.)*")/g;
const usedKeys = new Set();
let km;
while ((km = keyRe.exec(appSrc))) usedKeys.add(new Function(`return ${km[1]}`)());
const SAME_IN_BOTH = new Set(['XP', 'note', 'notes', 'Note', 'Badges', 'Minutes', 'Instruments', 'sprint', '{n} min', 'Hot Cross Buns', 'Merrily We Roll Along']);
for (const lang of ['pt', 'fr']) {
  const dict = api.TRANSLATIONS[lang] || {};
  const missing = [...usedKeys].filter(k => !Object.prototype.hasOwnProperty.call(dict, k));
  const untranslated = [...usedKeys].filter(k => Object.prototype.hasOwnProperty.call(dict, k) && dict[k] === k && !SAME_IN_BOTH.has(k));
  check(missing.length === 0, `${lang} dictionary is missing keys:\n    ${missing.map(k => JSON.stringify(k)).join('\n    ')}`);
  check(untranslated.length === 0, `${lang} dictionary leaves keys in English:\n    ${untranslated.map(k => JSON.stringify(k)).join('\n    ')}`);
}

check(api.getLang() === 'pt', 'the app can switch to Portuguese');

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
