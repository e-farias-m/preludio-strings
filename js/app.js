// i18n fallbacks for environments that load app.js without i18n.js (e.g. tests)
if (typeof t !== 'function') { var t = function(s){ return s; }; }
if (typeof initLang !== 'function') { var initLang = function(){}; }
if (typeof getLang !== 'function') { var getLang = function(){ return 'en'; }; }
if (typeof setLang !== 'function') { var setLang = function(){}; }
if (typeof TRANSLATIONS === 'undefined') { var TRANSLATIONS = { en:{}, pt:{} }; }
if (typeof LANG === 'undefined') { var LANG = 'en'; }

// app.js
// Application state machine and rendering for Preludio Strings.
// Single delegated click listener drives all interaction via data-action.

const APP = {
  screen: 'select',
  instrumentId: null,
  lessonIndex: 0,
  phase: 'present',
  quiz: null,
  // Mixed quiz set for note lessons: the note being taught plus prior notes.
  quizQueue: [],
  quizIndex: 0,
  play: { running: false, hasPlayed: false },
  progress: {},
  // Review session state
  reviewQueue: null,
  reviewIndex: 0,
  reviewCorrect: 0,
  reviewTotal: 0,
  // Song session state
  songNoteIndex: 0,
  // Overwritten with the persisted value once the speed helpers below are
  // defined; this literal is evaluated before them.
  songSpeed: 1,
  importedSong: null,
  // Imported song list
  importedSongs: null,
  // Audio playback state
  audioPlaybackTimeouts: [],
  playSequenceTimeouts: [],
  audioPlaybackAudio: null,
  // Whether the current lesson was already complete before this attempt
  completedBefore: false,
  // Timed practice sprint state (null when not in a sprint)
  sprint: null,
  sprintTimer: null,
  // Ear training (call & response) state
  ear: null,
  earTimers: [],
  // Practice tools
  metronome: null,
  tuner: null,
  // Listen & match (microphone pitch feedback) prototype state
  listen: null,
  // Motivation: streaks, minutes and badges
  motivation: null,
  sessionStart: null,
  // Microphone recording state
  recorder: null,
  recordingUrl: null,
  // Home screen: true while the user is choosing a different instrument
  pickingInstrument: false,
  // Home screen: true once the student hides the weekly progress card for this session
  digestDismissed: false,
  // Fingering-chart abbreviation currently being explained (TH, R, L), or null
  fingeringHelp: null,
  // Slide index while the per-instrument "how to use the app" tour is open
  tutorialIndex: 0,
  // Note/fingering chart: which note is selected, and where to return to
  lookupId: null,
  lookupReturn: 'map',
  // Floating metronome/tuner widget: whether it's expanded, and which tab shows
  toolsOpen: false,
  toolTab: 'metronome',
};

const STORAGE_KEY = 'preludioStringsProgress';
const NAME_KEY = 'preludioStringsName';
const THEME_KEY = 'preludioStringsTheme';
const INSTRUMENT_KEY = 'preludioStringsInstrument';
const TUTORIAL_KEY = 'preludioStringsTutorials';
const FIRST_SOUND_KEY = 'preludioStringsFirstSound';

// Practice speed: a single multiplier applied to every count-in and song, so
// the count-in always runs at the same tempo the song will. 100% = the song's
// own written tempo. Range 50%–150%, 10% steps, persisted across sessions.
const SONG_SPEED_KEY = 'preludioStringsSongSpeed';
const SPEED_MIN = 0.5;
const SPEED_MAX = 1.5;
const SPEED_STEP = 0.1;
function clampSpeed(v) {
  const n = Math.round((Number(v) || 1) / SPEED_STEP) * SPEED_STEP;
  return Math.max(SPEED_MIN, Math.min(SPEED_MAX, Number(n.toFixed(2))));
}
function getSavedSpeed() {
  try { return clampSpeed(localStorage.getItem(SONG_SPEED_KEY)); }
  catch (e) { return 1; }
}
function setSavedSpeed(v) {
  // localStorage may be unavailable (private mode); the in-memory APP value
  // still drives playback, so a failure here is harmless.
  try { localStorage.setItem(SONG_SPEED_KEY, String(v)); } catch (e) {}
}
// Milliseconds per beat at the current practice speed, given the song's own
// written tempo (baseBpm). The single source of truth for count-in and song.
function msPerBeatAt(baseBpm, speed) {
  const bpm = (Number(baseBpm) || 100) * (speed || 1);
  return 60000 / bpm;
}
// APP is defined above these helpers, so the persisted speed is loaded here.
APP.songSpeed = getSavedSpeed();

function getStudentName() { return localStorage.getItem(NAME_KEY) || ''; }
function setStudentName(name) { localStorage.setItem(NAME_KEY, name); }

// Instruments whose "how to use the app" tour the student has already seen.
function getTutorialSeen(id) {
  let seen = [];
  try { seen = JSON.parse(localStorage.getItem(TUTORIAL_KEY) || '[]'); } catch (e) {}
  return Array.isArray(seen) && seen.indexOf(id) !== -1;
}
function markTutorialSeen(id) {
  if (getTutorialSeen(id)) return;
  let seen = [];
  try { seen = JSON.parse(localStorage.getItem(TUTORIAL_KEY) || '[]'); } catch (e) {}
  if (!Array.isArray(seen)) seen = [];
  seen.push(id);
  localStorage.setItem(TUTORIAL_KEY, JSON.stringify(seen));
}

// Instruments where the student has opened the "make your first sound" guide.
function getFirstSoundSeenMap() {
  try { return JSON.parse(localStorage.getItem(FIRST_SOUND_KEY) || '{}') || {}; }
  catch (e) { return {}; }
}
function getFirstSoundSeen(instrumentId) { return !!getFirstSoundSeenMap()[instrumentId]; }
function markFirstSoundSeen(instrumentId) {
  const seen = getFirstSoundSeenMap();
  seen[instrumentId] = true;
  localStorage.setItem(FIRST_SOUND_KEY, JSON.stringify(seen));
}

// Last instrument the student opened — lets the home screen focus on one
// instrument instead of the full set until they ask to switch.
function getSavedInstrument() { return localStorage.getItem(INSTRUMENT_KEY) || ''; }
function setSavedInstrument(id) { localStorage.setItem(INSTRUMENT_KEY, id); }
function clearSavedInstrument() { localStorage.removeItem(INSTRUMENT_KEY); }

// ── THEME ──────────────────────────────────────────────────────────────────
function getTheme() { return localStorage.getItem(THEME_KEY) || 'light'; }
function applyTheme(theme) {
  if (typeof document !== 'undefined' && document.documentElement) {
    document.documentElement.setAttribute('data-theme', theme);
    const meta = document.querySelector && document.querySelector('meta[name="theme-color"]');
    if (meta) meta.setAttribute('content', theme === 'light' ? '#F5F4FB' : '#0E0D1C');
  }
}
function setTheme(theme) {
  localStorage.setItem(THEME_KEY, theme);
  applyTheme(theme);
}
function toggleTheme() { setTheme(getTheme() === 'light' ? 'dark' : 'light'); }

// Instrument accents resolve to theme-aware CSS variables so noteheads and
// pressed keys stay legible on both dark and light diagram panels.
function instAccent(inst) { return `var(--accent-${inst.id})`; }

// The fingering diagram for the instrument at hand. String instruments also
// need the instrument's string names, so they travel with the call.
function fingeringSvg(inst, lesson, size, accent) {
  return Graphics.fingeringSVG(inst.fingeringType, lesson.fingeringState, accent || instAccent(inst), size, { stringNames: inst.stringNames });
}

// Lesson text is stored as a template plus its values, so the translation
// layer can swap the template first and fill it in afterwards.
function lessonText(lesson, key = 'description') {
  if (!lesson) return '';
  const tmpl = lesson[key + 'Tmpl'];
  if (tmpl) return tFill(tmpl, lesson.vars || {});
  return t(lesson[key] || '');
}

// The finger card. The fingerboard picture shows where the finger goes; this
// spells the same thing out in words — which string, which finger, which
// position — for students who are still reading names as well as pictures.
const FINGER_CARD_LABELS = [
  ['String', '{name} string'],
  ['String number', 'String {n}'],
  ['Finger', 'Finger {n}'],
  ['Position', '1st position'],
];

function stringFingerCard(inst, lesson) {
  if (!inst || inst.family !== 'strings' || !lesson) return '';
  const fs = lesson.fingeringState || {};
  const stringNo = Math.min(Math.max(parseInt(fs.string, 10) || 1, 1), 4);
  const fingerNo = Math.min(Math.max(parseInt(fs.finger, 10) || 0, 0), 4);
  const name = (inst.stringNames || [])[stringNo - 1] || '';
  const values = [
    { name },
    { n: stringNo },
    { n: fingerNo === 0 ? t('Open string') : fingerNo },
    {},
  ];
  const rows = FINGER_CARD_LABELS.map(([label, template], i) => {
    const value = template === 'Finger {n}' && fingerNo === 0
      ? t('Open string')
      : tFill(template, values[i]);
    return `<div class="finger-card-row"><span class="finger-card-key">${escapeHtml(t(label))}</span><span class="finger-card-val">${escapeHtml(value)}</span></div>`;
  }).join('');
  return `<div class="finger-card"><div class="finger-card-title">${escapeHtml(t('Finger card'))}</div>${rows}</div>`;
}

function escapeHtml(str) {
  const d = document.createElement('div');
  d.textContent = str;
  return d.innerHTML;
}

// ── QUIZ TYPES ────────────────────────────────────────────────────────────
const QUIZ_TYPES = {
  FINGERING_TO_NOTE: 'fingering-to-note',   // See fingering, pick note name
  NOTE_TO_FINGERING: 'note-to-fingering',   // See note name, pick fingering
  STAFF_TO_NOTE: 'staff-to-note',           // See note on staff, pick note name
  NOTE_TO_STAFF: 'note-to-staff',           // See note name, pick staff position
};

// ── TIMED PRACTICE SPRINTS ─────────────────────────────────────────────────
const SPRINT_SECONDS = 30;
const SPRINT_MODES = {
  SIGHT: 'sight',    // See a note on the staff, name it
  FINGER: 'finger',  // See a note name, pick its fingering
};

// ── MASTERY LEVELS ────────────────────────────────────────────────────────
function getMasteryLevel(correctCount) {
  if (correctCount >= 6) return 'mastered';
  if (correctCount >= 3) return 'practiced';
  if (correctCount >= 1) return 'learning';
  return 'new';
}

function getMasteryColor(level) {
  return { new: 'var(--mastery-new)', learning: 'var(--mastery-learning)', practiced: 'var(--mastery-practiced)', mastered: 'var(--mastery-mastered)' }[level] || 'var(--mastery-new)';
}

function getMasteryLabel(level) {
  return { new: 'New', learning: 'Learning', practiced: 'Practiced', mastered: 'Mastered' }[level] || 'New';
}

// ── PROGRESS PERSISTENCE ───────────────────────────────────────────────────
function loadProgress() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    APP.progress = raw ? JSON.parse(raw) : {};
  } catch (e) {
    APP.progress = {};
  }
  // Migrate legacy data where `completed[id]` was a boolean instead of the
  // current `{ stars }` shape, so star rendering never sees a boolean.
  Object.values(APP.progress).forEach(prog => {
    if (!prog || !prog.completed) return;
    Object.keys(prog.completed).forEach(id => {
      const v = prog.completed[id];
      if (v === true) prog.completed[id] = { stars: 0 };
      else if (!v) delete prog.completed[id];
    });
  });
}

function saveProgress() {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(APP.progress));
  } catch (e) { /* storage unavailable — fail silently */ }
}

function getInstrumentProgress(instrumentId) {
  if (!APP.progress[instrumentId]) {
    APP.progress[instrumentId] = { completed: {}, xp: 0, mastery: {} };
  }
  if (!APP.progress[instrumentId].mastery) {
    APP.progress[instrumentId].mastery = {};
  }
  if (!APP.progress[instrumentId].sprints) {
    APP.progress[instrumentId].sprints = {};
  }
  return APP.progress[instrumentId];
}

function getNoteMastery(instrumentId, noteId) {
  const prog = getInstrumentProgress(instrumentId);
  return prog.mastery[noteId] || 0;
}

function addNoteMastery(instrumentId, noteId, amount = 1) {
  const prog = getInstrumentProgress(instrumentId);
  prog.mastery[noteId] = (prog.mastery[noteId] || 0) + amount;
  saveProgress();
}

// Personal best for a sprint mode is stored per instrument.
function getSprintBest(instrumentId, mode) {
  const prog = getInstrumentProgress(instrumentId);
  return (prog.sprints && prog.sprints[mode]) || 0;
}

// Saves a new best if `score` beats it. Returns true when a record was set.
function setSprintBest(instrumentId, mode, score) {
  const prog = getInstrumentProgress(instrumentId);
  if (!prog.sprints) prog.sprints = {};
  if (score > (prog.sprints[mode] || 0)) {
    prog.sprints[mode] = score;
    saveProgress();
    return true;
  }
  return false;
}

// ── ADAPTIVE PRACTICE PLAN ─────────────────────────────────────────────────
// Every answered question updates a per-note skill record. The daily plan is
// regenerated from these skills, prioritising notes with low accuracy and
// notes that have not been seen for a while (a light spaced-repetition model).
function getSkill(instrumentId, noteId) {
  const prog = getInstrumentProgress(instrumentId);
  if (!prog.skills) prog.skills = {};
  if (!prog.skills[noteId]) {
    // Existing students predate skills tracking; seed from quiz mastery so
    // their accuracy history isn't lost.
    const mastery = prog.mastery[noteId] || 0;
    prog.skills[noteId] = { correct: mastery, wrong: 0, streak: 0, lastSeen: 0 };
  }
  return prog.skills[noteId];
}

function recordSkill(instrumentId, noteId, correct) {
  const s = getSkill(instrumentId, noteId);
  if (correct) { s.correct++; s.streak = (s.streak || 0) + 1; }
  else { s.wrong++; s.streak = 0; }
  s.lastSeen = Date.now();
  saveProgress();
  return s;
}

function noteWeakness(instrumentId, noteId, now = Date.now()) {
  const s = getSkill(instrumentId, noteId);
  const attempts = s.correct + s.wrong;
  const accuracy = attempts ? s.correct / attempts : 0.5;
  const days = s.lastSeen ? (now - s.lastSeen) / 86400000 : 7;
  const overdue = Math.min(days, 7) / 7;
  return (1 - accuracy) * 0.7 + overdue * 0.3;
}

// Accuracy for display; null until the note has actually been attempted.
function getNoteAccuracy(instrumentId, noteId) {
  const s = getSkill(instrumentId, noteId);
  const attempts = s.correct + s.wrong;
  return { attempts, accuracy: attempts ? s.correct / attempts : null };
}

// The learned notes most in need of work, weakest first.
function getWeakestNotes(instrumentId, count = 3) {
  const now = Date.now();
  return getLearnedNotes(instrumentId)
    .map(l => ({
      lesson: l,
      weakness: noteWeakness(instrumentId, l.id, now),
      ...getNoteAccuracy(instrumentId, l.id),
    }))
    .sort((a, b) => b.weakness - a.weakness)
    .slice(0, count);
}

// Weighted pick that biases drills toward weaker notes without ever ignoring
// the others (every note keeps a small floor weight).
function pickWeightedNote(instrumentId, pool) {
  if (!pool.length) return null;
  const now = Date.now();
  const weights = pool.map(l => 0.2 + noteWeakness(instrumentId, l.id, now));
  const total = weights.reduce((a, b) => a + b, 0);
  let r = Math.random() * total;
  for (let i = 0; i < pool.length; i++) {
    r -= weights[i];
    if (r <= 0) return pool[i];
  }
  return pool[pool.length - 1];
}

function generatePlan(instrumentId, now = Date.now()) {
  const learned = getLearnedNotes(instrumentId);
  const items = [];
  if (learned.length === 0) return { date: todayKey(new Date(now)), items };

  const ranked = learned
    .map(l => ({ l, w: noteWeakness(instrumentId, l.id, now) }))
    .sort((a, b) => b.w - a.w);

  ranked.slice(0, learned.length >= 3 ? 2 : 1).forEach(({ l, w }) => {
    items.push({
      id: 'note:' + l.id,
      type: 'note',
      targetId: l.id,
      reason: w >= 0.55 ? 'Shaky — needs review' : 'Keep it fresh',
    });
  });

  if (learned.length >= 2) {
    const sight = getSprintBest(instrumentId, SPRINT_MODES.SIGHT);
    const finger = getSprintBest(instrumentId, SPRINT_MODES.FINGER);
    const mode = finger <= sight ? SPRINT_MODES.FINGER : SPRINT_MODES.SIGHT;
    items.push({ id: 'sprint:' + mode, type: 'sprint', mode, reason: 'Build speed' });
  }

  const inst = getInstrument(instrumentId);
  const prog = getInstrumentProgress(instrumentId);
  const songs = inst.lessons.filter(s =>
    isSongLesson(s) && isLessonUnlocked(instrumentId, CURRICULUM[instrumentId].lessons.indexOf(s)));
  const song = songs.find(s => !prog.completed[s.id]) || songs[0];
  if (song) {
    items.push({ id: 'song:' + song.id, type: 'song', targetId: song.id, reason: 'Apply your notes' });
  }

  return { date: todayKey(new Date(now)), items };
}

// Today's plan is generated once and then persists for the day, so checkboxes
// and ordering stay stable across visits.
function getTodayPlan(instrumentId, now = Date.now()) {
  const prog = getInstrumentProgress(instrumentId);
  const key = todayKey(new Date(now));
  if (!prog.plan || prog.plan.date !== key) {
    prog.plan = generatePlan(instrumentId, now);
    saveProgress();
  }
  return prog.plan;
}

function isPlanComplete(instrumentId) {
  const prog = getInstrumentProgress(instrumentId);
  const items = prog.plan && prog.plan.items;
  return !!items && items.length > 0 && items.every(i => i.done);
}

// Marks matching plan items done; when the whole plan is finished, awards bonus
// XP and records it for the plan badge.
function markPlanItemDone(instrumentId, type, target) {
  const prog = APP.progress[instrumentId];
  if (!prog || !prog.plan || !prog.plan.items) return;
  let changed = false;
  prog.plan.items.forEach(it => {
    if (it.done) return;
    const matches = it.type === type &&
      (it.type === 'sprint' ? it.mode === target : it.targetId === target);
    if (matches) { it.done = true; changed = true; }
  });
  if (!changed) return;
  saveProgress();
  if (prog.plan.items.every(i => i.done) && !prog.plan.completed) {
    completePlan(instrumentId);
  }
}

function completePlan(instrumentId) {
  const prog = getInstrumentProgress(instrumentId);
  if (!prog.plan || prog.plan.completed) return;
  prog.plan.completed = true;
  const bonus = 20;
  prog.xp += bonus;
  const m = getMotivation();
  m.plansCompleted = (m.plansCompleted || 0) + 1;
  saveMotivation();
  saveProgress();
  evaluateBadges({ toast: true });
  showToast(tFill('{icon} Plan complete! +{bonus} XP', { icon: '\u{1F389}', bonus }));
}

// ── EAR TRAINING (CALL & RESPONSE) ─────────────────────────────────────────
// The app plays a short phrase ("call"); the student taps the notes they heard,
// in order ("response"). Phrases are drawn toward weak notes and each answer
// feeds back into the same skill records used by the adaptive plan.
const EAR_NOTE_GAP_MS = 620;

function earPhraseLength(instrumentId) {
  return getLearnedNotes(instrumentId).length >= 5 ? 4 : 3;
}

function buildEarPhrase(instrumentId, length) {
  const learned = getLearnedNotes(instrumentId);
  if (learned.length < 2) return [];
  const count = length || earPhraseLength(instrumentId);
  const phrase = [];
  for (let i = 0; i < count; i++) {
    // Avoid repeating the previous note so the phrase stays melodic.
    let pool = phrase.length ? learned.filter(l => l.id !== phrase[phrase.length - 1]) : learned;
    if (!pool.length) pool = learned;
    const pick = pickWeightedNote(instrumentId, pool);
    phrase.push(pick.id);
  }
  return phrase;
}

function gradeEarResponse(phraseIds, picks) {
  return phraseIds.map((id, i) => picks[i] === id);
}

function earScore(graded) {
  return graded ? graded.filter(Boolean).length : 0;
}

function startEarRound(instrumentId, length) {
  const phrase = buildEarPhrase(instrumentId, length);
  if (!phrase.length) { APP.ear = null; return null; }
  APP.ear = { phrase, picks: [], graded: null, finished: false };
  return APP.ear;
}

function submitEarPick(instrumentId, noteId) {
  const e = APP.ear;
  if (!e || e.finished) return null;
  e.picks.push(noteId);
  if (e.picks.length >= e.phrase.length) {
    e.graded = gradeEarResponse(e.phrase, e.picks);
    e.finished = true;
    finishEarRound(instrumentId);
  }
  return e;
}

function finishEarRound(instrumentId) {
  const e = APP.ear;
  if (!e || !e.graded) return null;
  const total = e.phrase.length;
  const correct = earScore(e.graded);
  const perfect = correct === total && total >= 3;
  const xp = correct * 5 + (perfect ? 5 : 0);
  const prog = getInstrumentProgress(instrumentId);
  prog.xp += xp;
  prog.earBest = Math.max(prog.earBest || 0, correct);
  e.phrase.forEach((id, i) => recordSkill(instrumentId, id, e.picks[i] === id));
  if (perfect) {
    const m = getMotivation();
    m.earPerfects = (m.earPerfects || 0) + 1;
    saveMotivation();
  }
  saveProgress();
  evaluateBadges({ toast: true });
  return { correct, total, perfect, xp };
}

// ── METRONOME ──────────────────────────────────────────────────────────────
const MIN_BPM = 30;
const MAX_BPM = 220;
const TIME_SIGNATURES = [2, 3, 4, 6];

function clampBpm(bpm) {
  return Math.max(MIN_BPM, Math.min(MAX_BPM, Math.round(bpm)));
}

function bpmToIntervalMs(bpm) {
  return Math.round(60000 / clampBpm(bpm));
}

const METRONOME_SUBDIVISIONS = [
  { value: 1, label: 'Beats' },
  { value: 2, label: '8ths' },
  { value: 3, label: 'Triplets' },
  { value: 4, label: '16ths' },
];
const TEMPO_PRESETS = [
  { bpm: 60, label: 'Largo' },
  { bpm: 80, label: 'Andante' },
  { bpm: 100, label: 'Moderato' },
  { bpm: 120, label: 'Allegro' },
  { bpm: 160, label: 'Presto' },
];
const METRONOME_SOUNDS = [
  { value: 'click', label: 'Click' },
  { value: 'wood', label: 'Wood' },
  { value: 'beep', label: 'Beep' },
];
const METRONOME_DEFAULT_VOLUME = 0.8;

function createMetronome(bpm = 80, beatsPerBar = 4) {
  return {
    bpm: clampBpm(bpm),
    beatsPerBar,
    beat: -1,
    subTick: 0,
    subdivision: 1,
    countIn: false,
    countInLeft: 0,
    volume: METRONOME_DEFAULT_VOLUME,
    sound: 'click',
    running: false,
    timerId: null,
    taps: [],
  };
}

// Time between sub-ticks: the beat interval split by the subdivision count.
function bpmToTickMs(bpm, subdivision = 1) {
  const subs = Math.max(1, subdivision || 1);
  return Math.round(60000 / (clampBpm(bpm) * subs));
}

// Advance one tick. Main beats step the bar (accenting the downbeat); the ticks
// in between are subdivisions that only play, unaccented. Reuses advanceMetronome
// so the beat/wrap rules stay in one place.
function metronomeTick(metro) {
  const subs = Math.max(1, metro.subdivision || 1);
  if (metro.beat < 0 || metro.subTick >= subs - 1) {
    const { beat, accent } = advanceMetronome(metro);
    metro.subTick = 0;
    return { beat, sub: 0, isBeat: true, accent };
  }
  metro.subTick += 1;
  return { beat: metro.beat, sub: metro.subTick, isBeat: false, accent: false };
}

// Volume/sound for a click; subdivisions play a touch softer than the beat.
function metronomeClickOpts(metro, isSub = false) {
  const base = metro && typeof metro.volume === 'number' ? metro.volume : METRONOME_DEFAULT_VOLUME;
  return { volume: Math.max(0, Math.min(1, base * (isSub ? 0.7 : 1))), sound: (metro && metro.sound) || 'click' };
}

// Advances one beat, wrapping at the bar line. Returns the beat that just fired
// plus whether it lands on the downbeat (which gets the accented click).
function advanceMetronome(metro) {
  const bpb = Math.max(1, metro.beatsPerBar || 4);
  metro.beat = (metro.beat + 1) % bpb;
  return { beat: metro.beat, accent: metro.beat === 0 };
}

// Average gap of the most recent taps -> BPM. Null until there are two taps.
function tapTempo(taps) {
  if (taps.length < 2) return null;
  const recent = taps.slice(-6);
  const spans = [];
  for (let i = 1; i < recent.length; i++) spans.push(recent[i] - recent[i - 1]);
  const avg = spans.reduce((a, b) => a + b, 0) / spans.length;
  if (avg <= 0) return null;
  return clampBpm(60000 / avg);
}

// ── TUNER ──────────────────────────────────────────────────────────────────
// Pitch detection over a time-domain buffer. Returns the detected frequency in
// Hz, or -1 when the signal is too weak or not periodic enough to call.
//
// Normalised square difference (McLeod) is used rather than raw
// autocorrelation: dividing each lag by the overlapping energy keeps the
// reading stable across quiet and loud playing, and taking the first strong
// peak avoids the octave errors raw correlation makes on harmonic-rich tones.
function detectPitch(buffer, sampleRate) {
  if (!buffer || buffer.length < 2 || !sampleRate) return -1;
  const size = buffer.length;

  let peak = 0;
  let energy = 0;
  for (let i = 0; i < size; i++) {
    const v = buffer[i];
    const a = v < 0 ? -v : v;
    if (a > peak) peak = a;
    energy += v * v;
  }
  // Gate on the signal's own level so a normal-volume mic still registers,
  // while pure silence and the noise floor do not.
  if (peak < 0.02 || Math.sqrt(energy / size) < 0.01) return -1;

  const minLag = Math.max(2, Math.floor(sampleRate / 2000));
  const maxLag = Math.min(size - 2, Math.ceil(sampleRate / 40));
  if (maxLag <= minLag) return -1;

  // Prefix energy turns the normalisation denominator into an O(1) lookup.
  const prefix = new Float64Array(size + 1);
  for (let i = 0; i < size; i++) prefix[i + 1] = prefix[i] + buffer[i] * buffer[i];
  const total = prefix[size];

  const nsdf = new Float32Array(maxLag + 1);
  let bestVal = 0;
  for (let lag = minLag; lag <= maxLag; lag++) {
    const denom = prefix[size - lag] + (total - prefix[lag]);
    let sum = 0;
    for (let i = 0; i < size - lag; i++) sum += buffer[i] * buffer[i + lag];
    const value = denom > 0 ? (2 * sum) / denom : 0;
    nsdf[lag] = value;
    if (value > bestVal) bestVal = value;
  }
  if (bestVal < 0.5) return -1; // too aperiodic to be a played note

  // The lowest-lag strong peak is the fundamental; equal later peaks are its
  // octaves, so prefer the first one within reach of the strongest.
  const threshold = bestVal * 0.9;
  let chosen = -1;
  for (let lag = minLag + 1; lag < maxLag; lag++) {
    if (nsdf[lag] >= nsdf[lag - 1] && nsdf[lag] > nsdf[lag + 1] && nsdf[lag] >= threshold) {
      chosen = lag;
      break;
    }
  }
  if (chosen < 0) return -1;

  // Parabolic interpolation for sub-sample precision, so cents stay steady.
  const y0 = nsdf[chosen - 1];
  const y1 = nsdf[chosen];
  const y2 = nsdf[chosen + 1];
  const curve = y0 - 2 * y1 + y2;
  const shift = curve !== 0 ? (y0 - y2) / (2 * curve) : 0;
  const period = chosen + Math.max(-1, Math.min(1, shift));
  if (period <= 0) return -1;

  const freq = sampleRate / period;
  if (freq < 40 || freq > 2000) return -1;
  return freq;
}

// Nearest expected note, measured in cents. Positive = sharp, negative = flat.
function freqToNoteInfo(freq, noteLessons) {
  if (!freq || freq <= 0 || !noteLessons.length) return null;
  let best = null;
  noteLessons.forEach(n => {
    if (!n.freq) return;
    const cents = 1200 * Math.log2(freq / n.freq);
    if (best === null || Math.abs(cents) < Math.abs(best.cents)) best = { note: n, cents };
  });
  return best;
}

function centsLabel(cents) {
  const r = Math.round(cents);
  if (Math.abs(r) <= 3) return 'in tune';
  return (r > 0 ? '+' : '') + r + ' cents ' + (r > 0 ? 'sharp' : 'flat');
}

function noteDisplayName(name) {
  if (typeof name !== 'string') return name;
  return name.replace(/[0-9]/g, '');
}

// ── TEACHER / PARENT PRACTICE REPORT ───────────────────────────────────────
// A shareable summary of what a student has learned, how strong each note is,
// and which notes to watch. Built from the same progress + skill records the
// rest of the app uses, so it never drifts out of sync.
function getInstrumentReport(instrumentId) {
  const inst = getInstrument(instrumentId);
  const prog = getInstrumentProgress(instrumentId);
  const noteLessons = getNoteLessons(instrumentId);
  const songLessons = inst.lessons.filter(isSongLesson);
  const learned = getLearnedNotes(instrumentId);
  const mastery = { new: 0, learning: 0, practiced: 0, mastered: 0 };
  learned.forEach(l => { mastery[getMasteryLevel(getNoteMastery(instrumentId, l.id))]++; });
  const weak = getWeakestNotes(instrumentId, 3)
    .filter(w => w.attempts > 0)
    .map(w => ({ name: noteDisplayName(t(w.lesson.noteName)), accuracy: Math.round((w.accuracy || 0) * 100) }));
  return {
    id: instrumentId,
    name: t(inst.name),
    shortName: inst.shortName,
    xp: prog.xp || 0,
    notesLearned: learned.length,
    notesTotal: noteLessons.length,
    songsCompleted: songLessons.filter(s => prog.completed[s.id]).length,
    songsTotal: songLessons.length,
    mastery,
    weak,
  };
}

function buildPracticeReport(name, now = new Date()) {
  const instruments = INSTRUMENT_ORDER
    .map(id => getInstrumentReport(id))
    .filter(r => r.notesLearned > 0 || r.songsCompleted > 0 || r.xp > 0);
  const badgeNames = BADGES.filter(b => hasBadge(b.id)).map(b => b.name);
  return {
    student: name || 'Student',
    date: todayKey(now),
    level: getLevel(),
    avatar: getAvatar(),
    xp: getTotalXp(),
    streak: getCurrentStreak(now),
    totalMinutes: Math.round(getTotalPracticeSeconds() / 60),
    notesLearned: instruments.reduce((a, r) => a + r.notesLearned, 0),
    songsCompleted: instruments.reduce((a, r) => a + r.songsCompleted, 0),
    badges: badgeNames,
    badgeTotal: BADGES.length,
    instruments,
  };
}

// Plain-text version for the clipboard / email.
function formatReportText(report) {
  const lines = [];
  lines.push(`Practice report — ${report.student}`);
  lines.push(report.date);
  lines.push('');
  lines.push(`Level ${report.level} · ${report.xp} XP · ${report.streak}-day streak · ${report.totalMinutes} min practiced`);
  lines.push(`Badges: ${report.badges.length}/${report.badgeTotal}${report.badges.length ? ' — ' + report.badges.join(', ') : ''}`);
  lines.push('');
  if (!report.instruments.length) {
    lines.push('No practice recorded yet.');
  } else {
    report.instruments.forEach(r => {
      lines.push(`${r.name}: ${r.notesLearned}/${r.notesTotal} notes · ${r.songsCompleted}/${r.songsTotal} songs · ${r.xp} XP`);
      lines.push(`  Mastery: ${r.mastery.mastered} mastered, ${r.mastery.practiced} practiced, ${r.mastery.learning} learning`);
      if (r.weak.length) {
        lines.push(`  Focus: ${r.weak.map(w => w.name + ' (' + w.accuracy + '%)').join(', ')}`);
      }
    });
  }
  return lines.join('\n');
}

// ── WEEKLY DIGEST ──────────────────────────────────────────────────────────
// An automatic recap of the current week, generated from the same day-by-day
// practice history the streak tracker already keeps.
const DAY_ABBR = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];
const DEFAULT_WEEKLY_GOAL = 60;
const WEEKLY_GOAL_OPTIONS = [30, 60, 120, 180];

function getWeeklyGoalMinutes() {
  const g = Number(getMotivation().weeklyGoalMinutes);
  return Number.isFinite(g) && g > 0 ? g : DEFAULT_WEEKLY_GOAL;
}

function setWeeklyGoalMinutes(minutes) {
  const g = Math.max(10, Math.min(600, Math.round(Number(minutes) || 0)));
  const m = getMotivation();
  m.weeklyGoalMinutes = g;
  saveMotivation();
  return g;
}

function getWeekStart(now = new Date()) {
  const d = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const dow = (d.getDay() + 6) % 7; // Monday = 0 ... Sunday = 6
  d.setDate(d.getDate() - dow);
  return d;
}

function getWeekKey(now = new Date()) {
  return todayKey(getWeekStart(now));
}

function getWeekDays(now = new Date()) {
  const m = getMotivation();
  const start = getWeekStart(now);
  const days = [];
  for (let i = 0; i < 7; i++) {
    const d = new Date(start);
    d.setDate(start.getDate() + i);
    const key = todayKey(d);
    days.push({ key, label: DAY_ABBR[i], seconds: m.days[key] || 0 });
  }
  return days;
}

function digestHeadline(activeDays, totalMinutes) {
  if (activeDays === 0) return 'No practice logged this week — pick a lesson to start.';
  if (activeDays <= 2) return `Nice start — ${totalMinutes} minute${totalMinutes === 1 ? '' : 's'} this week.`;
  if (activeDays <= 4) return `Solid week — you practiced ${activeDays} days!`;
  return `Amazing week — you showed up ${activeDays} days!`;
}

function buildWeeklyDigest(name, now = new Date()) {
  const days = getWeekDays(now);
  const m = getMotivation();
  const weekSeconds = days.reduce((a, d) => a + d.seconds, 0);
  const activeDays = days.filter(d => d.seconds > 0).length;
  const best = days.reduce((b, d) => (d.seconds > b.seconds ? d : b), days[0]);
  const startMs = getWeekStart(now).getTime();
  const endMs = startMs + 7 * 86400000;
  const badges = BADGES.filter(b => {
    const iso = m.badges[b.id];
    if (!iso) return false;
    const t = Date.parse(iso);
    return t >= startMs && t < endMs;
  });
  const weekKey = getWeekKey(now);
  const totalMinutes = Math.round(weekSeconds / 60);
  const goalMinutes = getWeeklyGoalMinutes();
  return {
    student: name || 'Student',
    weekKey,
    seen: m.digestSeen === weekKey,
    weekStart: days[0].key,
    weekEnd: days[6].key,
    days: days.map(d => ({ label: d.label, key: d.key, minutes: Math.round(d.seconds / 60) })),
    totalMinutes,
    activeDays,
    bestDayLabel: best.seconds > 0 ? best.label : null,
    bestDayMinutes: Math.round(best.seconds / 60),
    headline: digestHeadline(activeDays, Math.round(weekSeconds / 60)),
    streak: getCurrentStreak(now),
    level: getLevel(),
    badges,
    badgeTotal: BADGES.length,
    goalMinutes,
    goalMet: totalMinutes >= goalMinutes,
    goalRemaining: Math.max(goalMinutes - totalMinutes, 0),
    goalPct: goalMinutes ? Math.min(100, Math.round((totalMinutes / goalMinutes) * 100)) : 0,
  };
}

// A once-per-week nudge when a fresh week of practice is waiting to be seen.
function shouldRemindDigest(now = new Date()) {
  const m = getMotivation();
  const weekKey = getWeekKey(now);
  if (m.digestSeen === weekKey || m.digestReminded === weekKey) return false;
  return getWeekDays(now).some(d => d.seconds > 0);
}

function markDigestReminded(now = new Date()) {
  const m = getMotivation();
  m.digestReminded = getWeekKey(now);
  saveMotivation();
}

function maybeRemindDigest(now = new Date()) {
  if (!shouldRemindDigest(now)) return false;
  markDigestReminded(now);
  showToast('\u{1F4C8} Your week in music is ready!');
  return true;
}

function formatDigestText(digest) {
  const lines = [];
  lines.push(`This week in music — ${digest.student}`);
  lines.push(`${digest.weekStart} to ${digest.weekEnd}`);
  lines.push('');
  lines.push(digest.headline);
  lines.push(`Level ${digest.level} · ${digest.streak}-day streak · ${digest.totalMinutes} min across ${digest.activeDays} day${digest.activeDays === 1 ? '' : 's'}`);
  if (digest.bestDayLabel) {
    lines.push(`Best day: ${digest.bestDayLabel} (${digest.bestDayMinutes} min)`);
  }
  lines.push(`Daily: ${digest.days.map(d => d.label + ' ' + d.minutes).join(' · ')}`);
  lines.push(`Weekly goal: ${digest.totalMinutes}/${digest.goalMinutes} min${digest.goalMet ? ' — met!' : ''}`);
  if (digest.badges.length) {
    lines.push(`New badges this week: ${digest.badges.map(b => b.name).join(', ')}`);
  }
  return lines.join('\n');
}

// ── MOTIVATION: STREAKS, MINUTES, BADGES ────────────────────────────────────
const MOTIVATION_KEY = 'preludioStringsMotivation';
const MAX_SESSION_SECONDS = 30 * 60; // ignore implausible idle stretches

const BADGES = [
  { id: 'first-steps', icon: '\u{1F331}', name: 'First Steps', desc: 'Complete your first lesson' },
  { id: 'first-song', icon: '\u{1F3B5}', name: 'First Song', desc: 'Complete a song' },
  { id: 'octave', icon: '\u{1F3BC}', name: 'Full Octave', desc: 'Learn all 8 notes on an instrument' },
  { id: 'streak-3', icon: '\u{1F525}', name: 'On a Roll', desc: 'Practice 3 days in a row' },
  { id: 'streak-7', icon: '\u{1F525}', name: 'Week Strong', desc: 'Practice 7 days in a row' },
  { id: 'marathon', icon: '\u{23F1}', name: 'Marathon', desc: 'Practice for 30 minutes in total' },
  { id: 'xp-500', icon: '\u{2B50}', name: 'Rising Star', desc: 'Earn 500 XP' },
  { id: 'quick-fingers', icon: '\u{26A1}', name: 'Quick Fingers', desc: 'Score 15 in a Finger gym sprint' },
  { id: 'plan-complete', icon: '\u{1F3AF}', name: 'Planner', desc: 'Finish a full practice plan' },
  { id: 'golden-ear', icon: '\u{1F442}', name: 'Golden Ear', desc: 'Echo a phrase by ear, note for note' },
  { id: 'goal-getter', icon: '\u{1F3C6}', name: 'Goal Getter', desc: 'Reach your weekly practice goal' },
];

function pad2(n) { return n < 10 ? '0' + n : '' + n; }
function todayKey(d = new Date()) {
  return d.getFullYear() + '-' + pad2(d.getMonth() + 1) + '-' + pad2(d.getDate());
}

function loadMotivation() {
  try {
    const raw = localStorage.getItem(MOTIVATION_KEY);
    APP.motivation = raw ? JSON.parse(raw) : null;
  } catch (e) { APP.motivation = null; }
  if (!APP.motivation || typeof APP.motivation !== 'object') APP.motivation = {};
  if (!APP.motivation.days) APP.motivation.days = {};
  if (!APP.motivation.badges) APP.motivation.badges = {};
  return APP.motivation;
}

function getMotivation() {
  return APP.motivation || loadMotivation();
}

function saveMotivation() {
  try {
    localStorage.setItem(MOTIVATION_KEY, JSON.stringify(APP.motivation));
  } catch (e) { /* storage unavailable — fail silently */ }
}

// Records `seconds` of practice on today's date.
function addPracticeSeconds(seconds) {
  const m = getMotivation();
  const k = todayKey();
  m.days[k] = (m.days[k] || 0) + seconds;
  saveMotivation();
  return m.days[k];
}

function getTotalPracticeSeconds() {
  const m = getMotivation();
  return Object.values(m.days).reduce((sum, s) => sum + (s || 0), 0);
}

// Number of consecutive days (ending today or yesterday) with any practice.
function getCurrentStreak(now = new Date()) {
  const m = getMotivation();
  const has = d => (m.days[todayKey(d)] || 0) > 0;
  const cursor = new Date(now);
  if (!has(cursor)) cursor.setDate(cursor.getDate() - 1); // streak survives until today ends
  let streak = 0;
  while (has(cursor)) {
    streak++;
    cursor.setDate(cursor.getDate() - 1);
  }
  return streak;
}

function getTotalXp() {
  return Object.values(APP.progress).reduce((sum, p) => sum + (p.xp || 0), 0);
}

function getLevel(xp = getTotalXp()) {
  return Math.floor(xp / 100) + 1;
}

function getAvatar(level = getLevel()) {
  if (level >= 12) return '\u{1F451}'; // crown
  if (level >= 8) return '\u{1F3C5}';  // medal
  if (level >= 5) return '\u{1F3BB}';  // violin
  if (level >= 3) return '\u{1F3B6}';  // notes
  return '\u{1F331}';                  // seedling
}

// Aggregate cross-instrument stats used for badges.
function getStats() {
  let notesCompleted = 0, songsCompleted = 0, octaveInstruments = 0, bestFinger = 0;
  for (const id of INSTRUMENT_ORDER) {
    const prog = APP.progress[id];
    if (!prog) continue;
    let noteCount = 0;
    (CURRICULUM[id].lessons || []).forEach(l => {
      if (!prog.completed || !prog.completed[l.id]) return;
      if (isSongLesson(l)) songsCompleted++;
      else if (!isReviewLesson(l)) { notesCompleted++; noteCount++; }
    });
    if (noteCount >= 8) octaveInstruments++;
    if (prog.sprints && prog.sprints[SPRINT_MODES.FINGER] > bestFinger) {
      bestFinger = prog.sprints[SPRINT_MODES.FINGER];
    }
  }
  return {
    notesCompleted,
    songsCompleted,
    octaveInstruments,
    bestFinger,
    streak: getCurrentStreak(),
    totalSeconds: getTotalPracticeSeconds(),
    xp: getTotalXp(),
    plansCompleted: getMotivation().plansCompleted || 0,
    earPerfects: getMotivation().earPerfects || 0,
    weeklyGoalMet: buildWeeklyDigest(getStudentName()).goalMet,
  };
}

function badgeEarned(id, stats) {
  switch (id) {
    case 'first-steps': return stats.notesCompleted >= 1;
    case 'first-song': return stats.songsCompleted >= 1;
    case 'octave': return stats.octaveInstruments >= 1;
    case 'streak-3': return stats.streak >= 3;
    case 'streak-7': return stats.streak >= 7;
    case 'marathon': return stats.totalSeconds >= 1800;
    case 'xp-500': return stats.xp >= 500;
    case 'quick-fingers': return stats.bestFinger >= 15;
    case 'plan-complete': return stats.plansCompleted >= 1;
    case 'golden-ear': return stats.earPerfects >= 1;
    case 'goal-getter': return stats.weeklyGoalMet === true;
    default: return false;
  }
}

// Awards any newly-earned badges. Returns their definitions (optionally toasts).
function evaluateBadges(opts = {}) {
  const m = getMotivation();
  const stats = getStats();
  const newly = [];
  BADGES.forEach(b => {
    if (!m.badges[b.id] && badgeEarned(b.id, stats)) {
      m.badges[b.id] = new Date().toISOString();
      newly.push(b);
    }
  });
  if (newly.length) {
    saveMotivation();
    if (opts.toast && typeof showToast === 'function') {
      showToast(tFill('{icon} Badge unlocked: {name}', { icon: newly[0].icon, name: t(newly[0].name) }));
    }
  }
  return newly;
}

function hasBadge(id) {
  return !!getMotivation().badges[id];
}

// ── SESSION TIMING ─────────────────────────────────────────────────────────
function startSession() {
  if (APP.sessionStart) return;
  APP.sessionStart = Date.now();
}

function endSession() {
  if (!APP.sessionStart) return;
  const seconds = Math.min(Math.round((Date.now() - APP.sessionStart) / 1000), MAX_SESSION_SECONDS);
  APP.sessionStart = null;
  if (seconds >= 5) addPracticeSeconds(seconds);
  evaluateBadges({ toast: true });
}

// ── MICROPHONE RECORDING ────────────────────────────────────────────────────
// Records the student so they can compare their own sound against the model.
// Degrades gracefully: if the microphone or MediaRecorder API is unavailable,
// the record controls simply never render.
function canRecord() {
  return !!(typeof navigator !== 'undefined' && navigator.mediaDevices &&
    typeof navigator.mediaDevices.getUserMedia === 'function' &&
    typeof MediaRecorder !== 'undefined');
}

function startRecording() {
  if (!canRecord() || APP.recorder) return;
  return navigator.mediaDevices.getUserMedia({ audio: true }).then(stream => {
    const chunks = [];
    const mediaRecorder = new MediaRecorder(stream);
    mediaRecorder.ondataavailable = e => { if (e.data && e.data.size) chunks.push(e.data); };
    mediaRecorder.onstop = () => {
      stream.getTracks().forEach(t => t.stop());
      if (APP.recordingUrl) URL.revokeObjectURL(APP.recordingUrl);
      const blob = new Blob(chunks, { type: mediaRecorder.mimeType || 'audio/webm' });
      APP.recordingUrl = URL.createObjectURL(blob);
      APP.recorder = null;
      render();
    };
    mediaRecorder.start();
    APP.recorder = { mediaRecorder, stream };
    render();
  }).catch(() => showToast('Microphone unavailable.'));
}

function stopRecording() {
  const r = APP.recorder;
  if (r && r.mediaRecorder.state !== 'inactive') r.mediaRecorder.stop();
}

function playRecording() {
  if (!APP.recordingUrl) return;
  const audio = new Audio(APP.recordingUrl);
  audio.play().catch(() => showToast('Could not play the recording.'));
}

function cleanupRecording() {
  if (APP.recorder) {
    try { stopRecording(); } catch (e) { /* ignore */ }
    APP.recorder = null;
  }
  if (APP.recordingUrl) {
    URL.revokeObjectURL(APP.recordingUrl);
    APP.recordingUrl = null;
  }
}

function getLearnedNotes(instrumentId) {
  const inst = getInstrument(instrumentId);
  const prog = getInstrumentProgress(instrumentId);
  return inst.lessons.filter(l => prog.completed[l.id] && !isReviewLesson(l) && !isSongLesson(l));
}

// Every real (playable) note lesson for an instrument — used by the tuner.
function getNoteLessons(instrumentId) {
  return getInstrument(instrumentId).lessons.filter(l => !isReviewLesson(l) && !isSongLesson(l));
}

function getNewestNote(instrumentId) {
  const learned = getLearnedNotes(instrumentId);
  return learned.length > 0 ? learned[learned.length - 1] : null;
}

function isReviewLesson(lesson) {
  return lesson && lesson.type === 'review';
}

function isSongLesson(lesson) {
  return lesson && lesson.type === 'song';
}

function isLessonUnlocked(instrumentId, index) {
  const instrument = CURRICULUM[instrumentId];
  const lesson = instrument.lessons[index];
  if (!lesson) return false;
  if (isReviewLesson(lesson)) {
    const prog = getInstrumentProgress(instrumentId);
    return lesson.reviewLessonIds.every(id => !!prog.completed[id]);
  }
  if (isSongLesson(lesson) && lesson.prerequisiteIds) {
    const prog = getInstrumentProgress(instrumentId);
    return lesson.prerequisiteIds.every(id => !!prog.completed[id]);
  }
  if (index === 0) return true;
  const prevId = instrument.lessons[index - 1].id;
  const prog = getInstrumentProgress(instrumentId);
  return !!prog.completed[prevId];
}

// ── HELPERS ─────────────────────────────────────────────────────────────
function getInstrument(id) { return CURRICULUM[id]; }
function getLesson(instrumentId, index) {
  if (index === -1 && APP.importedSong) return APP.importedSong;
  return CURRICULUM[instrumentId].lessons[index];
}
function findLessonById(instrumentId, id) {
  return CURRICULUM[instrumentId].lessons.find(l => l.id === id);
}

function getResolvedSongNote(instrumentId, lesson) {
  if (!isSongLesson(lesson)) return null;
  const noteId = lesson.noteIds[APP.songNoteIndex];
  return findLessonById(instrumentId, noteId);
}

// The accompaniment for a song is derived from each melody note's scale degree
// (the note's explicit `degree` field), so it can never drift out of sync with
// noteIds. The degree is reduced to its scale-degree class (1..7) so notes below
// the tonic or above the octave still pick the right triad:
//   1,3,5,8 -> I [1,3,5]    4,6 -> IV [4,6,8]    2,7 -> V [5,7,2]
function chordLessonIds(instrumentId, noteId) {
  const note = findLessonById(instrumentId, noteId);
  const deg = note && note.degree;
  if (deg == null) return [];
  const sd = ((deg - 1) % 7 + 7) % 7 + 1;
  const degrees = (sd === 2 || sd === 7) ? [5, 7, 2]
    : (sd === 4 || sd === 6) ? [4, 6, 8]
    : [1, 3, 5];
  const byDegree = (CURRICULUM[instrumentId] || {}).noteByDegree || {};
  return degrees.map(d => byDegree[d]).filter(id => id && findLessonById(instrumentId, id));
}

function getChordFrequencies(instrumentId, lesson, index) {
  const noteId = lesson.noteIds[index];
  if (!noteId) return [];
  return chordLessonIds(instrumentId, noteId).map(id => {
    const n = findLessonById(instrumentId, id);
    return n ? n.freq : null;
  }).filter(f => f != null);
}

// Per-note durations in beats, parallel to lesson.noteIds. Songs without a
// valid `durations` array are treated as one beat per note.
function getNoteDurations(lesson) {
  const n = lesson.noteIds.length;
  if (Array.isArray(lesson.durations) && lesson.durations.length === n) {
    return lesson.durations;
  }
  return lesson.noteIds.map(() => 1);
}

const IMPORTED_SONGS_KEY = 'preludioStringsImportedSongs';

function showToast(msg) {
  msg = t(msg);
  const toast = document.getElementById('toast');
  toast.textContent = msg;
  toast.classList.add('show');
  clearTimeout(showToast._timer);
  showToast._timer = setTimeout(() => toast.classList.remove('show'), 1800);
}

// String players do not read a chart full of key abbreviations — they read
// finger numbers and string names. These are the words a chart like this one
// uses instead.
const FINGERING_HELP = {
  1: { label: '1st finger', text: 'Your index finger. It is the strongest finger and it stops the string a whole step above the open string.' },
  2: { label: '2nd finger', text: 'Your middle finger. It stops the string another whole step up.' },
  3: { label: '3rd finger', text: 'Your ring finger. It sits a half step above the 2nd finger — that small gap is why the 3rd finger lands where it does.' },
  4: { label: '4th finger', text: 'Your little finger. It reaches a whole step above the 3rd finger.' },
  O: { label: 'Open string', text: 'No finger at all. The string is left open and sounds its own note.' },
  P1: { label: '1st position', text: 'The hand stays where it started: 1st finger a whole step above the nut, then 2nd, 3rd and 4th. Every note on this chart is played in 1st position.' },
};

// The legend under the fingering chart, worded for the instrument at hand.
function renderFingeringLegend(inst) {
  const keys = Object.entries(FINGERING_HELP).map(([key, info]) =>
    `<div class="lookup-legend-row"><span class="fingering-help-key">${key}</span><span class="lookup-legend-text"><strong>${escapeHtml(t(info.label))}</strong> — <span class="legend-text">${escapeHtml(t(info.text))}</span></span></div>`
  ).join('');
  return `<div class="lookup-legend">${keys}</div>`;
}

// "Make your first sound" guide, grouped by instrument family. A brand-new
// player needs a sound before a first note means anything, so this runs before
// lesson one. Keyed by each instrument's family field.
const FIRST_SOUND_CONTENT = {
  strings: {
    emoji: '🎻',
    title: 'Make your first sound',
    intro: 'On a string instrument the sound comes from a string that is already moving. Your bow starts it, your left hand stops it.',
    steps: [
      'Hold the instrument on your left shoulder and let it sit there — do not let it float or press it under your chin.',
      'Rest your left thumb lightly on the neck, just below where your fingers will work. The thumb guides; it does not squeeze.',
      'Rest the bow on the string near the middle of the horsehair, between the frog and the tip.',
      'Draw the bow slowly across the string, like a sawing motion. Listen for a smooth, singing tone.',
      'Stop the string with a finger of your left hand to change the note — your right arm keeps bowing the whole time.',
    ],
    tip: 'Scratching? Move the bow closer to the fingerboard and go slower. A thin, whistly sound usually means the bow is too close to the bridge.',
  },
};

// Show a tap-away explainer for a fingering abbreviation (works on click and tap).
function showFingeringHelp(key) {
  const info = FINGERING_HELP[key];
  if (!info) return;
  APP.fingeringHelp = key;
  const el = document.getElementById('fingering-help');
  if (!el) return;
  el.innerHTML = `<span class="fingering-help-key">${key}</span><span class="fingering-help-text"><strong>${escapeHtml(t(info.label))}</strong> — <span class="legend-text">${escapeHtml(t(info.text))}</span></span>`;
  el.classList.add('show');
  clearTimeout(showFingeringHelp._timer);
  showFingeringHelp._timer = setTimeout(hideFingeringHelp, 7000);
}

function hideFingeringHelp() {
  APP.fingeringHelp = null;
  const el = document.getElementById('fingering-help');
  if (el) el.classList.remove('show');
}

// Copy text to the clipboard, falling back to a hidden textarea when the
// async Clipboard API is unavailable (older browsers, non-secure contexts).
function copyText(text) {
  if (navigator.clipboard && navigator.clipboard.writeText) {
    return navigator.clipboard.writeText(text).then(() => true).catch(() => false);
  }
  try {
    const ta = document.createElement('textarea');
    ta.value = text;
    ta.setAttribute('readonly', '');
    ta.style.position = 'fixed';
    ta.style.opacity = '0';
    document.body.appendChild(ta);
    ta.select();
    document.execCommand('copy');
    document.body.removeChild(ta);
    return Promise.resolve(true);
  } catch (e) {
    return Promise.resolve(false);
  }
}

function shuffle(arr) {
  const a = arr.slice();
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

function showNamePrompt() {
  const overlay = document.createElement('div');
  overlay.className = 'name-overlay';
  overlay.innerHTML = translateHtml(`
    <div class="name-modal">
      <div style="display:flex;justify-content:flex-end;width:100%"><button class="theme-toggle" data-action="name-toggle-language" title="${t('Language')}">${getLang() === 'pt' ? 'PT' : 'EN'}</button></div>
      <div class="name-modal-icon">🎵</div>
      <div class="name-modal-title">${t('Welcome to Preludio Strings!')}</div>
      <div class="name-modal-sub">${t("What's your name?")}</div>
      <input type="text" class="name-input" placeholder="${t('Your name...')}" maxlength="50" autocomplete="off" />
      <button class="btn btn-primary btn-wide name-submit">${t('Start practicing')}</button>
    </div>`);
  document.body.appendChild(overlay);

  const input = overlay.querySelector('.name-input');
  const submit = overlay.querySelector('.name-submit');
  input.focus();

  function submitName() {
    const name = input.value.trim();
    if (!name) { input.focus(); return; }
    setStudentName(name);
    overlay.classList.add('fade-out');
    setTimeout(() => overlay.remove(), 300);
  }

  submit.addEventListener('click', submitName);
  input.addEventListener('keydown', e => { if (e.key === 'Enter') submitName(); });
  overlay.querySelector('[data-action="name-toggle-language"]').addEventListener('click', () => {
    setLang(getLang() === 'pt' ? 'en' : 'pt');
    document.body.querySelector('.name-overlay')?.remove();
    showNamePrompt();
  });
}

// ── RENDER: SELECT SCREEN ──────────────────────────────────────────────────
function renderStudentCard(name) {
  const xp = getTotalXp();
  const level = getLevel(xp);
  const avatar = getAvatar(level);
  const streak = getCurrentStreak();
  const minutes = Math.floor(getTotalPracticeSeconds() / 60);
  const pct = xp % 100;
  const streakHtml = streak > 0
    ? `<span class="student-stat student-stat-streak">\u{1F525} ${streak}-day streak</span>`
    : `<span class="student-stat">Practice today to start a streak!</span>`;
  return `
    <div class="student-card">
      <div class="student-avatar">${avatar}</div>
      <div class="student-details">
        <div class="student-name-row">
          <span class="student-name">${escapeHtml(name)}</span>
          <span class="student-level">Lv ${level}</span>
        </div>
        <div class="student-stats">
          ${streakHtml}
          <span class="student-stat">\u{23F1} ${minutes} min</span>
          <span class="student-stat">\u{2B50} ${xp} XP</span>
        </div>
        <div class="level-bar-track"><div class="level-bar-fill" style="width:${pct}%"></div></div>
      </div>
    </div>`;
}

function renderBadgeShelf() {
  const earned = BADGES.filter(b => hasBadge(b.id)).length;
  const items = BADGES.map(b => {
    const got = hasBadge(b.id);
    return `
      <div class="badge ${got ? 'badge-earned' : 'badge-locked'}" title="${escapeHtml(t(b.name))}: ${escapeHtml(t(b.desc))}">
        <div class="badge-icon">${got ? b.icon : '\u{1F512}'}</div>
        <div class="badge-name">${escapeHtml(t(b.name))}</div>
      </div>`;
  }).join('');
  return `
    <div class="badges-shelf">
      <div class="badges-shelf-title">Badges · ${earned}/${BADGES.length}</div>
      <div class="badges-grid">${items}</div>
    </div>`;
}

function renderInstrumentGrid() {
  const cards = INSTRUMENT_ORDER.map(id => {
    const inst = CURRICULUM[id];
    const icon = Graphics.instrumentIconSVG(id, 56);
    const cls = inst.available ? 'instrument-card' : 'instrument-card coming-soon';
    const badge = inst.available ? '' : `<div class="card-badge">Soon</div>`;
    return `
      <div class="${cls}" data-action="select-instrument" data-id="${id}" style="color:${instAccent(inst)}">
        ${badge}
        <div class="card-icon">${icon}</div>
        <div class="card-name" style="color: var(--text-primary)">${escapeHtml(t(inst.shortName))}</div>
      </div>`;
  }).join('');
  return `<div class="instrument-grid">${cards}</div>`;
}

// A single, prominent card for the instrument the student is working in, so the
// home screen stays focused instead of showing every instrument all the time.
function renderFocusCard(inst) {
  const ir = getInstrumentReport(inst.id);
  const progress = ir.xp > 0
    ? `${ir.notesLearned}/${ir.notesTotal} notes · ${ir.songsCompleted}/${ir.songsTotal} songs`
    : 'Ready for your first lesson';
  return `
    <div class="focus-instrument">
      <div class="focus-card" data-action="select-instrument" data-id="${inst.id}" style="color:${instAccent(inst)}">
        <div class="focus-icon">${Graphics.instrumentIconSVG(inst.id, 64)}</div>
        <div class="focus-info">
          <div class="focus-name">${escapeHtml(t(inst.name))}</div>
          <div class="focus-progress">${progress}</div>
        </div>
        <div class="focus-go">Continue \u2192</div>
      </div>
      <button class="switch-instrument" data-action="switch-instrument">Switch instrument</button>
    </div>`;
}

function renderSelectScreen() {
  const savedId = getSavedInstrument();
  const savedInst = savedId && CURRICULUM[savedId] && CURRICULUM[savedId].available
    ? CURRICULUM[savedId]
    : null;
  const picking = APP.pickingInstrument || !savedInst;

  const studentName = getStudentName();
  const motivationHtml = studentName ? renderStudentCard(studentName) : '';
  const digestHtml = studentName ? renderDigestCard(studentName) : '';
  const badgesHtml = studentName ? renderBadgeShelf() : '';
  const reportHtml = studentName
    ? `<button class="btn btn-secondary report-open" data-action="open-report">\u{1F4CB} Progress report</button>`
    : '';

  let headline;
  let sub;
  let instrumentArea;
  if (picking) {
    headline = t('First notes, first wins.');
    sub = t('Pick an instrument to start your very first lessons — fingerings, notes, and your first sounds.');
    instrumentArea = `
      ${savedInst ? `<button class="picker-back" data-action="cancel-instrument-pick">\u2190 Back to ${savedInst.shortName}</button>` : ''}
      ${renderInstrumentGrid()}`;
  } else {
    headline = studentName ? `Ready, ${escapeHtml(studentName)}?` : 'Ready to play?';
    sub = tFill("You're set up on {inst}. Pick up where you left off.", { inst: t(savedInst.shortName) });
    instrumentArea = renderFocusCard(savedInst);
  }

  return `
    <div class="screen active select-screen">
      <div class="select-hero">
        <div class="wordmark">
          <svg class="wordmark-logo" viewBox="0 0 32 32" fill="none" xmlns="http://www.w3.org/2000/svg">
            <ellipse cx="10" cy="24" rx="6" ry="4.5" fill="#FF8C42" transform="rotate(-20 10 24)"/>
            <line x1="15" y1="22" x2="15" y2="5" stroke="#FF8C42" stroke-width="2.4"/>
            <path d="M15 5 Q24 6 24 14" stroke="#FF8C42" stroke-width="2.4" fill="none"/>
          </svg>
          <span class="wordmark-text">Preludio <span>Strings</span></span>
        </div>
        <div class="select-headline">${headline}</div>
        <div class="select-sub">${sub}</div>
      </div>
      <div class="select-hero-settings">
        <button class="theme-toggle" data-action="toggle-language" title="${t('Language')}">${getLang() === 'pt' ? 'PT' : 'EN'}</button>
        <button class="theme-toggle" data-action="toggle-theme" title="Switch to ${getTheme() === 'light' ? 'dark' : 'light'} theme">${getTheme() === 'light' ? '\u{1F319}' : '\u2600\uFE0F'}</button>
        <button class="theme-toggle settings-gear" data-action="open-settings" title="Settings">\u{2699}\u{FE0F}</button>
      </div>
      ${motivationHtml}
      ${digestHtml}
      ${instrumentArea}
      ${badgesHtml}
      ${reportHtml}
      <div class="version-badge" style="cursor:pointer">v2.0.0</div>
    </div>`;
}

// ── RENDER: SETTINGS SCREEN ────────────────────────────────────────────────
function renderSettingsScreen() {
  const name = getStudentName();
  return `
    <div class="screen active settings-screen">
      <div class="settings-header">
        <button class="btn-icon" data-action="close-settings" style="background:none;border:none;cursor:pointer;font-size:24px;">←</button>
        <h2>Settings</h2>
      </div>
      <div class="settings-body">
        <div class="settings-section">
          <label class="settings-label">Appearance</label>
          <p class="settings-desc">Switch between the light "paper" theme and the dark theme.</p>
          <button class="btn btn-secondary" data-action="toggle-theme">${getTheme() === 'light' ? '\u{1F319} Dark theme' : '\u2600\uFE0F Light theme'}</button>
        </div>
        <div class="settings-section">
          <label class="settings-label">Student name</label>
          <div class="settings-row">
            <input type="text" id="settings-name-input" class="settings-input" value="${escapeHtml(name)}" maxlength="50" autocomplete="off" />
            <button class="btn btn-primary" data-action="save-settings-name">Save</button>
          </div>
        </div>
        <div class="settings-section">
          <label class="settings-label">Reset progress</label>
          <p class="settings-desc">Clear all lesson progress and XP for all instruments. This cannot be undone.</p>
          <button class="btn btn-danger" data-action="reset-progress">Reset all progress</button>
        </div>
      </div>
    </div>`;
}

// ── RENDER: APP TUTORIAL (how to use the app) ──────────────────────────────
// The same short tour for every instrument, shown automatically the first time
// a student opens a given instrument and replayable from its lesson map.
function buildTutorialSlides(inst) {
  const firstNote = getNoteLessons(inst.id)[0];
  const noteArt = firstNote
    ? `<div class="tutorial-visual">${fingeringSvg(inst, firstNote, 92)}${Graphics.staffSVG({ pos: firstNote.staffStep, accidental: firstNote.accidental, clef: inst.clef, accentColor: instAccent(inst), width: 74 })}</div>`
    : '';
  const instrumentArt = `<div class="tutorial-visual tutorial-visual-icon">${Graphics.instrumentIconSVG(inst.id, 96)}</div>`;
  return [
    {
      icon: '🎉',
      title: tFill("You're set up on {inst}", { inst: t(inst.name) }),
      body: `Welcome! This is a one-minute tour of how the app works. You can skip it and replay it any time from your lesson map.`,
      visual: instrumentArt,
    },
    {
      icon: '🗺️',
      title: 'Follow your lesson path',
      body: `Every note and song is a stop on your ${inst.shortName} map. Finish one step to unlock the next — a 🔒 just means the step before it is still waiting.`,
    },
    {
      icon: '👀',
      title: 'See it, then check it',
      body: 'Each new note shows its name, sound, and fingering. Tap “Hear it,” then answer a quick check to lock the note in.',
      visual: noteArt,
    },
    {
      icon: '🎵',
      title: 'Play it yourself',
      body: 'Then play the note on your instrument. On a device with a microphone you can record a take and listen back to compare.',
    },
    {
      icon: '🥁',
      title: 'Practice and tools',
      body: 'Practice drills build speed, ear training sharpens your listening, and the metronome and tuner keep you steady and in tune.',
    },
    {
      icon: '⭐',
      title: 'Watch yourself grow',
      body: 'You earn XP, streaks, and badges as you play, and the weekly recap shows how much you practiced. Ready? Let’s play!',
    },
  ];
}

function renderTutorialScreen() {
  const inst = getInstrument(APP.instrumentId) || CURRICULUM[INSTRUMENT_ORDER[0]];
  const slides = buildTutorialSlides(inst);
  const i = Math.min(Math.max(APP.tutorialIndex || 0, 0), slides.length - 1);
  const slide = slides[i];
  const last = i === slides.length - 1;
  const art = slide.visual || `<div class="tutorial-emoji">${slide.icon}</div>`;
  const dots = slides.map((_, n) => `<span class="tutorial-dot${n === i ? ' active' : ''}${n < i ? ' done' : ''}"></span>`).join('');
  return `
    <div class="screen active tutorial-screen">
      <div class="app-header">
        <button class="header-back" data-action="tutorial-finish" title="Skip the tour">✕</button>
        <div class="header-title">Quick tour</div>
      </div>
      <div class="tutorial-body">
        <div class="tutorial-art">${art}</div>
        <h2 class="tutorial-title">${slide.title}</h2>
        <p class="tutorial-text">${slide.body}</p>
        <div class="tutorial-dots">${dots}</div>
      </div>
      <div class="action-bar">
        <div class="tutorial-actions">
          <button class="btn btn-secondary" data-action="tutorial-back" ${i === 0 ? 'disabled' : ''}>Back</button>
          <button class="btn btn-primary" data-action="tutorial-next">${last ? 'Start playing' : 'Next'}</button>
        </div>
      </div>
    </div>`;
}

// ── RENDER: MAP SCREEN ─────────────────────────────────────────────────────
function renderPlanCard(instrumentId) {
  const plan = getTodayPlan(instrumentId);
  if (!plan.items.length) return '';
  const done = plan.items.filter(i => i.done).length;
  const total = plan.items.length;
  const rows = plan.items.map(it => {
    let label = t('Practise');
    if (it.type === 'note') {
      const n = findLessonById(instrumentId, it.targetId);
      label = 'Review ' + (n ? noteDisplayName(t(n.noteName)) : 'note');
    } else if (it.type === 'song') {
      const s = findLessonById(instrumentId, it.targetId);
      label = 'Play ' + (s ? noteDisplayName(t(s.noteName)) : 'song');
    } else if (it.type === 'sprint') {
      label = (it.mode === SPRINT_MODES.FINGER ? 'Finger gym' : 'Sight-reading') + ' sprint';
    }
    const icon = it.type === 'sprint' ? '\u{26A1}' : '\u{1F3B5}';
    return `
      <div class="plan-item ${it.done ? 'plan-item-done' : ''}">
        <div class="plan-item-icon">${it.done ? '\u2713' : icon}</div>
        <div class="plan-item-text">
          <div class="plan-item-name">${escapeHtml(label)}</div>
          <div class="plan-item-reason">${escapeHtml(it.reason || '')}</div>
        </div>
        ${it.done
          ? '<div class="plan-item-tag">Done</div>'
          : `<button class="btn btn-secondary plan-item-btn" data-action="plan-start" data-item="${it.id}">Start</button>`}
      </div>`;
  }).join('');
  const allDone = done === total;
  return `
    <div class="plan-card ${allDone ? 'plan-card-done' : ''}">
      <div class="plan-header">
        <div class="plan-title">Today\u2019s Plan</div>
        <div class="plan-count">${done}/${total}</div>
      </div>
      <div class="plan-items">${rows}</div>
      ${allDone ? '<div class="plan-done-note">\u{1F389} All done — nice work!</div>' : ''}
    </div>`;
}

function renderMapScreen() {
  const inst = getInstrument(APP.instrumentId);
  const prog = getInstrumentProgress(APP.instrumentId);
  const fsContent = FIRST_SOUND_CONTENT[inst.family] || FIRST_SOUND_CONTENT.strings;
  const fsSeen = getFirstSoundSeen(APP.instrumentId);
  const allImported = JSON.parse(localStorage.getItem(IMPORTED_SONGS_KEY) || '{}');
  const instImported = (allImported[APP.instrumentId] || []).filter(s => s && s.noteIds);
  const total = inst.lessons.length + instImported.length;
  const doneCount = inst.lessons.filter(l => prog.completed[l.id]).length + instImported.filter(s => prog.completed[s.id]).length;
  const pct = total ? Math.round((doneCount / total) * 100) : 0;
  const learnedCount = getLearnedNotes(APP.instrumentId).length;
  const practiceReady = learnedCount >= 2;
  const bestSight = getSprintBest(APP.instrumentId, SPRINT_MODES.SIGHT);
  const bestFinger = getSprintBest(APP.instrumentId, SPRINT_MODES.FINGER);
  const bestLine = practiceReady && (bestSight || bestFinger)
    ? `<div class="practice-banner-best">Best: ${bestSight} names · ${bestFinger} fingerings</div>`
    : '';

  const nodes = inst.lessons.map((lesson, i) => {
    const unlocked = isLessonUnlocked(APP.instrumentId, i);
    const completed = !!prog.completed[lesson.id];
    const isReview = isReviewLesson(lesson);

    let stateCls = 'locked';
    let inner = `<span class="map-node-lock">🔒</span>`;
    let masteryHtml = '';
    let label = noteDisplayName(t(lesson.noteName));

    if (isReview && unlocked && completed) {
      stateCls = 'review-done';
      inner = `<span class="map-node-icon">⟳</span>`;
    } else if (isReview && unlocked && !completed) {
      stateCls = 'review-available';
      inner = `<span class="map-node-icon">⟳</span>`;
    } else if (completed) {
      stateCls = 'done';
      const stars = prog.completed[lesson.id].stars;
      const mastery = getNoteMastery(APP.instrumentId, lesson.id);
      const masteryLevel = getMasteryLevel(mastery);
      inner = `<span class="map-node-note">${escapeHtml(noteDisplayName(t(lesson.noteName)))}</span><span class="map-node-star">${'★'.repeat(stars)}${'☆'.repeat(3 - stars)}</span>`;
      masteryHtml = `<div class="map-node-mastery mastery-${masteryLevel}">${getMasteryLabel(masteryLevel)}</div>`;
    } else if (unlocked && !completed) {
      stateCls = 'current';
      inner = `<span class="map-node-note">${escapeHtml(noteDisplayName(t(lesson.noteName)))}</span>`;
    } else if (unlocked) {
      stateCls = 'available';
      inner = `<span class="map-node-note">${escapeHtml(noteDisplayName(t(lesson.noteName)))}</span>`;
    }

    const connector = i === 0 ? '' : `<div class="map-connector ${prog.completed[inst.lessons[i-1].id] ? 'done' : ''}"></div>`;
    const action = unlocked ? `data-action="open-lesson" data-index="${i}"` : `data-action="locked-node"`;

    return `
      <div class="map-node-wrap">
        ${connector}
        <div class="map-node ${stateCls}" ${action}>${inner}</div>
        <div class="map-node-label">${label}</div>
        ${masteryHtml}
      </div>`;
  }).join('');

  const importedNodes = instImported.map((s, i) => {
    const completed = !!prog.completed[s.id];
    const stateCls = completed ? 'done' : 'current';
    const stars = completed ? prog.completed[s.id].stars : 0;
    const inner = completed
      ? `<span class="map-node-note">${escapeHtml(noteDisplayName(t(s.noteName)))}</span><span class="map-node-star">${'★'.repeat(stars)}${'☆'.repeat(3 - stars)}</span>`
      : `<span class="map-node-note">${escapeHtml(noteDisplayName(t(s.noteName)))}</span>`;
    const prevId = i === 0 ? inst.lessons[inst.lessons.length - 1]?.id : instImported[i - 1]?.id;
    const prevDone = prevId ? !!prog.completed[prevId] : false;
    const connector = inst.lessons.length > 0 || i > 0 ? `<div class="map-connector ${prevDone ? 'done' : ''}"></div>` : '';
    return `
      <div class="map-node-wrap">
        ${connector}
        <div class="map-node ${stateCls}" data-action="open-imported-song" data-imported-index="${i}">${inner}</div>
        <div class="map-node-label">${escapeHtml(noteDisplayName(t(s.noteName)))}</div>
        <button class="btn-icon" data-action="delete-imported-song" data-imported-index="${i}" title="Delete imported song" style="background:none;border:none;cursor:pointer;font-size:12px;color:var(--text-danger);margin-top:2px">✕ Delete</button>
      </div>`;
  }).join('');

  return `
    <div class="screen active">
      <div class="app-header">
        <button class="header-back" data-action="go-select">←</button>
        <div class="header-title">${escapeHtml(t(inst.shortName))}</div>
        <div class="header-progress">
          <div class="progress-bar-track"><div class="progress-bar-fill" style="width:${pct}%"></div></div>
          <div class="progress-label">${doneCount}/${total}</div>
        </div>
      </div>
      <div class="map-body">
        ${renderPlanCard(APP.instrumentId)}
        <div class="first-sound-cta${fsSeen ? ' first-sound-cta-seen' : ''}" data-action="open-first-sound">
          <div class="first-sound-cta-emoji">${fsContent.emoji}</div>
          <div class="first-sound-cta-text">
            <div class="first-sound-cta-title">${escapeHtml(fsSeen ? t('Warm up your sound') : t('New here? Make your first sound'))}</div>
            <div class="first-sound-cta-sub">${escapeHtml(fsSeen ? t('Bow and tone reminders before you play.') : t('A quick guide to your first sound, before note one.'))}</div>
          </div>
          <div class="first-sound-cta-arrow">›</div>
        </div>
        <div class="practice-banner ${practiceReady ? '' : 'practice-banner-locked'}">
          <div class="practice-banner-text">
            <div class="practice-banner-title">Practice drills</div>
            <div class="practice-banner-sub">${practiceReady ? 'Timed games to build speed and confidence.' : 'Learn 2 notes to unlock timed drills.'}</div>
            ${bestLine}
          </div>
          <button class="btn btn-primary" data-action="open-practice" ${practiceReady ? '' : 'disabled'}>Practice</button>
        </div>
        <div class="map-unit-label">Unit 1 · First Notes</div>
        <div class="map-path">${nodes}${importedNodes}</div>
        <div class="import-section" style="margin-top:20px;text-align:center">
          <button class="btn btn-secondary" data-action="import-song">+ Import Song</button>
          <input type="file" id="import-file-input" accept=".xml,.musicxml" style="display:none"/>
        </div>
        <div class="map-guide">
          <button class="map-guide-link" data-action="open-lookup">🎼 Fingering chart</button>
          <button class="map-guide-link" data-action="open-tutorial">❔ How this app works</button>
        </div>
      </div>
    </div>`;
}

// ── RENDER: FIRST SOUND ────────────────────────────────────────────────────
// A short, family-specific guide to making the very first sound, shown before
// note one so a beginner is never stuck at silence. Content comes from
// FIRST_SOUND_CONTENT, keyed by the instrument's family.
function renderFirstSoundScreen() {
  const inst = getInstrument(APP.instrumentId);
  const content = FIRST_SOUND_CONTENT[inst.family] || FIRST_SOUND_CONTENT.strings;
  const seen = getFirstSoundSeen(APP.instrumentId);
  const firstNote = getNoteLessons(APP.instrumentId)[0];
  const steps = content.steps.map((step, i) => `
    <li class="first-sound-step">
      <span class="first-sound-step-num">${i + 1}</span>
      <span class="first-sound-step-text">${escapeHtml(t(step))}</span>
    </li>`).join('');
  const hearBtn = firstNote
    ? `<button class="btn btn-secondary btn-wide" data-action="first-sound-hear" style="margin-top:4px">\u{1F50A} ${escapeHtml(t('Hear a target note'))}</button>`
    : '';

  return `
    <div class="screen active first-sound-screen">
      <div class="app-header">
        <button class="header-back" data-action="close-first-sound">←</button>
        <div class="header-title">${escapeHtml(t('First sound'))} · ${escapeHtml(t(inst.shortName))}</div>
      </div>
      <div class="lesson-body">
        <div class="first-sound-hero">${content.emoji}</div>
        <div class="first-sound-title">${escapeHtml(t(content.title))}</div>
        <div class="first-sound-intro">${escapeHtml(t(content.intro))}</div>
        <ol class="first-sound-steps">${steps}</ol>
        <div class="first-sound-tip"><strong>${escapeHtml(t('Tip'))}</strong> ${escapeHtml(t(content.tip))}</div>
        ${hearBtn}
        <div class="action-bar">
          <button class="btn btn-primary btn-wide" data-action="first-sound-done">${escapeHtml(seen ? t('Back to my path') : t('Got it — let\u2019s play!'))}</button>
        </div>
      </div>
    </div>`;
}

// ── RENDER: FINGERING CHART (LOOKUP) ───────────────────────────────────────
// A quick-reference chart of every note an instrument teaches. It is a lookup
// companion — the whole chart is available from the start, with learned notes
// highlighted, so it works alongside a method book.
function renderLookupScreen() {
  const inst = getInstrument(APP.instrumentId);
  const notes = getNoteLessons(APP.instrumentId);
  const learnedIds = new Set(getLearnedNotes(APP.instrumentId).map(l => l.id));

  if (!notes.length) {
    return `
      <div class="screen active lookup-screen">
        <div class="app-header">
          <button class="header-back" data-action="close-lookup">←</button>
          <div class="header-title">${escapeHtml(t('Fingering chart'))} · ${escapeHtml(t(inst.shortName))}</div>
        </div>
        <div class="lesson-body">
          <div class="practice-intro">No notes to show yet.</div>
        </div>
      </div>`;
  }

  let selected = notes.find(l => l.id === APP.lookupId);
  if (!selected) selected = notes[0];
  APP.lookupId = selected.id;

  const bigFingering = fingeringSvg(inst, selected, 120);
  const staffSvg = Graphics.staffSVG({ pos: selected.staffStep, accidental: selected.accidental, clef: inst.clef, accentColor: instAccent(inst), width: 130 });

  const cards = notes.map(l => {
    const learned = learnedIds.has(l.id);
    const cls = 'lookup-card'
      + (l.id === selected.id ? ' lookup-card-active' : '')
      + (learned ? '' : ' lookup-card-locked');
    const svg = fingeringSvg(inst, l, 46, learned ? instAccent(inst) : '#6b6b7d');
    return `
      <button class="${cls}" data-action="lookup-select" data-id="${l.id}" aria-label="${escapeHtml(noteDisplayName(t(l.noteName)))}">
        <div class="lookup-card-svg">${svg}</div>
        <div class="lookup-card-name">${escapeHtml(noteDisplayName(t(l.noteName)))}</div>
      </button>`;
  }).join('');

  const legend = renderFingeringLegend(inst);

  return `
    <div class="screen active lookup-screen">
      <div class="app-header">
        <button class="header-back" data-action="close-lookup">←</button>
        <div class="header-title">${escapeHtml(t('Fingering chart'))} · ${escapeHtml(t(inst.shortName))}</div>
      </div>
      <div class="lesson-body">
        <div class="lookup-detail">
          <div class="lookup-diagrams">
            <div class="lookup-diagram">
              <div class="lookup-diagram-label">Fingering</div>
              ${bigFingering}
            </div>
            <div class="lookup-diagram">
              <div class="lookup-diagram-label">On the staff</div>
              ${staffSvg}
            </div>
          </div>
          <div class="lookup-name">${escapeHtml(noteDisplayName(t(selected.noteName)))}</div>
          <div class="lookup-desc">${escapeHtml(lessonText(selected))}</div>
          <button class="btn btn-secondary btn-wide" data-action="lookup-hear">\u{1F50A} Hear it</button>
        </div>
        <div class="lookup-grid-label">${learnedIds.size} of ${notes.length} notes learned</div>
        <div class="lookup-grid">${cards}</div>
        ${legend}
      </div>
    </div>`;
}

// ── RENDER: PRACTICE (SPRINTS) ─────────────────────────────────────────────
// A compact read-out of the notes a student gets wrong most often. Drills
// already favour these notes, so the panel explains why the questions repeat.
function renderWeakSpots(instrumentId) {
  const now = Date.now();
  const attempted = getLearnedNotes(instrumentId)
    .map(l => ({ lesson: l, ...getNoteAccuracy(instrumentId, l.id) }))
    .filter(w => w.attempts > 0)
    .map(w => ({ ...w, weakness: noteWeakness(instrumentId, w.lesson.id, now) }))
    .sort((a, b) => b.weakness - a.weakness)
    .slice(0, 3);
  if (!attempted.length) return '';
  const rows = attempted.map(w => {
    const pct = Math.round((w.accuracy || 0) * 100);
    return `
      <div class="weak-row">
        <div class="weak-name">${escapeHtml(noteDisplayName(t(w.lesson.noteName)))}</div>
        <div class="weak-bar"><div class="weak-bar-fill" style="width:${pct}%"></div></div>
        <div class="weak-pct">${pct}%</div>
      </div>`;
  }).join('');
  return `
    <div class="weak-card">
      <div class="weak-title">Focus areas</div>
      <div class="weak-sub">Your drills will favour the notes you miss most.</div>
      ${rows}
    </div>`;
}

function renderPracticeScreen() {
  const inst = getInstrument(APP.instrumentId);
  if (APP.sprint) return renderSprintView(inst);

  const learned = getLearnedNotes(APP.instrumentId);
  const ready = learned.length >= 2;
  const modes = [
    { mode: SPRINT_MODES.SIGHT, title: 'Sight-reading', sub: 'See a note on the staff, name it fast.' },
    { mode: SPRINT_MODES.FINGER, title: 'Finger gym', sub: 'See a note name, match its fingering fast.' },
  ];
  const cards = modes.map(m => {
    const best = getSprintBest(APP.instrumentId, m.mode);
    return `
      <button class="sprint-card" data-action="start-sprint" data-mode="${m.mode}" ${ready ? '' : 'disabled'}>
        <div class="sprint-card-title">${m.title}</div>
        <div class="sprint-card-sub">${m.sub}</div>
        <div class="sprint-card-best">${best ? `Best: ${best}` : 'No score yet'}</div>
      </button>`;
  }).join('');
  const earBest = getInstrumentProgress(APP.instrumentId).earBest || 0;

  return `
    <div class="screen active practice-screen">
      <div class="app-header">
        <button class="header-back" data-action="close-practice">←</button>
        <div class="header-title">${escapeHtml(t('Practice'))} · ${escapeHtml(t(inst.shortName))}</div>
      </div>
      <div class="lesson-body">
        <div class="practice-intro">${ready
          ? `${SPRINT_SECONDS} seconds. How many can you get?`
          : 'Finish a couple of lessons to unlock the timed drills.'}</div>
        <div class="sprint-cards">${cards}</div>
        <button class="sprint-card ear-entry" data-action="open-ear" ${ready ? '' : 'disabled'}>
          <div class="sprint-card-title">Ear training</div>
          <div class="sprint-card-sub">Hear a short phrase, then echo it back — by ear.</div>
          <div class="sprint-card-best">${earBest ? `Best: ${earBest}` : 'No score yet'}</div>
        </button>
        ${renderWeakSpots(APP.instrumentId)}
        ${renderPracticeTools()}
      </div>
    </div>`;
}

function renderPracticeTools() {
  return `
    <div class="tools-grid">
      <button class="tool-card" data-action="tools-tab" data-tab="metronome">
        <div class="tool-icon">\u{1F3B5}</div>
        <div class="tool-name">Metronome / Tuner</div>
        <div class="tool-sub">Open the floating metronome and tuner.</div>
      </button>
      <button class="tool-card" data-action="tools-tab" data-tab="tuner">
        <div class="tool-icon">\u{1F3A4}</div>
        <div class="tool-name">Tuner</div>
        <div class="tool-sub">Check your pitch against the floating tuner.</div>
      </button>
      <button class="tool-card" data-action="open-lookup">
        <div class="tool-icon">\u{1F3BC}</div>
        <div class="tool-name">Fingering chart</div>
        <div class="tool-sub">Look up any note's fingering and sound.</div>
      </button>
    </div>`;
}

function renderEarScreen() {
  const inst = getInstrument(APP.instrumentId);
  const learned = getLearnedNotes(APP.instrumentId);

  if (learned.length < 2) {
    return `
      <div class="screen active ear-screen">
        <div class="app-header">
          <button class="header-back" data-action="close-ear">←</button>
          <div class="header-title">Call & response</div>
        </div>
        <div class="lesson-body">
          <div class="practice-intro">Learn two notes to unlock ear training.</div>
        </div>
      </div>`;
  }

  const e = APP.ear;
  const phrase = e ? e.phrase : [];
  const picks = e ? e.picks : [];
  const slots = phrase.map((id, i) => {
    const picked = picks[i];
    let cls = 'ear-slot';
    let label = String(i + 1);
    if (picked) {
      const n = findLessonById(APP.instrumentId, picked);
      label = n ? noteDisplayName(t(n.noteName)) : '?';
      if (e.graded) cls += e.graded[i] ? ' ear-slot-ok' : ' ear-slot-bad';
      else cls += ' ear-slot-filled';
    } else {
      cls += ' ear-slot-empty';
    }
    return `<div class="${cls}">${escapeHtml(label)}</div>`;
  }).join('');

  const palette = learned.map(l => {
    const disabled = e && e.finished ? 'disabled' : '';
    return `<button class="ear-key" data-action="ear-pick" data-id="${l.id}" ${disabled}>${escapeHtml(noteDisplayName(t(l.noteName)))}</button>`;
  }).join('');

  const correct = e && e.graded ? earScore(e.graded) : 0;
  const total = phrase.length;
  const perfect = e && e.finished && total > 0 && correct === total;
  const result = e && e.finished
    ? `<div class="ear-result ${perfect ? 'ear-result-perfect' : ''}">${correct}/${total} correct${perfect ? ' — golden ear!' : ''}</div>`
    : '<div class="ear-result ear-result-pending">Tap the notes in the order you heard them.</div>';

  const best = getInstrumentProgress(APP.instrumentId).earBest || 0;

  return `
    <div class="screen active ear-screen">
      <div class="app-header">
        <button class="header-back" data-action="close-ear">←</button>
        <div class="header-title">${escapeHtml(t('Call & response'))} · ${escapeHtml(t(inst.shortName))}</div>
      </div>
      <div class="lesson-body">
        <div class="ear-slots">${slots}</div>
        ${result}
        <button class="btn btn-primary btn-wide" data-action="ear-play" style="margin-top:12px">\u25B6 ${e && e.finished ? 'Replay the call' : 'Play the call'}</button>
        <div class="ear-palette-label">Your notes</div>
        <div class="ear-palette">${palette}</div>
        <div class="ear-footer">
          ${best ? `<span class="ear-best">Best: ${best}</span>` : '<span></span>'}
          <button class="btn btn-secondary" data-action="ear-new">Try another</button>
        </div>
      </div>
    </div>`;
}

function renderMetronomePanel() {
  if (!APP.metronome) APP.metronome = createMetronome();
  const m = APP.metronome;
  const dots = [];
  for (let i = 0; i < m.beatsPerBar; i++) {
    dots.push(`<div class="metro-dot ${i === m.beat ? 'metro-dot-active' : ''} ${i === 0 ? 'metro-dot-downbeat' : ''}"></div>`);
  }
  const presetOpts = TEMPO_PRESETS.map(p =>
    `<option value="${p.bpm}"${m.bpm === p.bpm ? ' selected' : ''}>${p.label} · ${p.bpm}</option>`
  ).join('');
  const timeOpts = TIME_SIGNATURES.map(t =>
    `<option value="${t}"${m.beatsPerBar === t ? ' selected' : ''}>${t}/4</option>`
  ).join('');
  const subOpts = METRONOME_SUBDIVISIONS.map(s =>
    `<option value="${s.value}"${(m.subdivision || 1) === s.value ? ' selected' : ''}>${s.label}</option>`
  ).join('');
  const soundOpts = METRONOME_SOUNDS.map(s =>
    `<option value="${s.value}"${(m.sound || 'click') === s.value ? ' selected' : ''}>${s.label}</option>`
  ).join('');
  const vol = Math.round((typeof m.volume === 'number' ? m.volume : METRONOME_DEFAULT_VOLUME) * 100);
  return `
    <div class="tool-metro">
      <div class="metro-dots" id="metronome-dots">${dots.join('')}</div>
      <div class="tool-bpm">
        <button class="tool-step" data-action="metronome-bpm" data-delta="-1" aria-label="Slower">−</button>
        <div class="tool-bpm-value"><span id="metronome-bpm">${m.bpm}</span><small>BPM</small></div>
        <button class="tool-step" data-action="metronome-bpm" data-delta="1" aria-label="Faster">+</button>
      </div>
      <div class="tool-row">
        <select id="tool-preset" class="tool-select" aria-label="Tempo preset"><option value="">Preset…</option>${presetOpts}</select>
        <select id="tool-timesig" class="tool-select" aria-label="Time signature">${timeOpts}</select>
      </div>
      <div class="tool-row">
        <select id="tool-subdivision" class="tool-select" aria-label="Subdivision">${subOpts}</select>
        <select id="tool-sound" class="tool-select" aria-label="Click sound">${soundOpts}</select>
      </div>
      <div class="tool-row tool-row-between">
        <button class="tool-pill${m.countIn ? ' active' : ''}" data-action="metronome-countin" role="switch" aria-checked="${m.countIn ? 'true' : 'false'}">Count-in</button>
        <input type="range" id="metronome-volume" class="tool-volume" min="0" max="100" step="5" value="${vol}" aria-label="Metronome volume" />
      </div>
      <div class="tool-actions">
        <button class="btn btn-secondary" data-action="metronome-tap">Tap</button>
        <button class="btn btn-primary tool-play" data-action="metronome-toggle" id="metronome-toggle">${m.running ? '\u25A0 Stop' : '\u25B6 Start'}</button>
      </div>
    </div>`;
}

function renderTunerPanel() {
  const noteLessons = APP.instrumentId ? getNoteLessons(APP.instrumentId) : [];
  const t = APP.tuner;
  const listening = !!(t && t.running);
  const detected = t && t.freq > 0 ? freqToNoteInfo(t.freq, noteLessons) : null;
  let noteName = '—';
  let cents = listening ? 'Listening…' : 'Press Tune';
  let offset = 50;
  if (detected) {
    noteName = noteDisplayName(detected.note.noteName);
    cents = centsLabel(detected.cents);
    offset = Math.max(0, Math.min(100, 50 + (detected.cents / 50) * 50));
  }
  return `
    <div class="tool-tuner">
      <div class="tuner-note" id="tuner-note">${escapeHtml(noteName)}</div>
      <div class="tuner-cents" id="tuner-cents">${escapeHtml(cents)}</div>
      <div class="tuner-meter">
        <div class="tuner-needle" id="tuner-needle" style="left:${offset}%"></div>
        <div class="tuner-center"></div>
      </div>
      <button class="btn btn-primary btn-wide" data-action="tuner-toggle" style="margin-top:12px">${listening ? '\u25A0 Stop' : '\u25B6 Tune'}</button>
    </div>`;
}

// The floating "chat-style" launcher. It lives outside #app so it survives every
// screen render, and collapses to a small button until tapped.
function renderToolWidget() {
  const host = document.getElementById('tool-widget');
  if (!host) return;
  const open = !!APP.toolsOpen;
  const tab = APP.toolTab === 'tuner' ? 'tuner' : 'metronome';
  const body = tab === 'tuner' ? renderTunerPanel() : renderMetronomePanel();
  host.innerHTML = translateHtml(`
    <div class="tool-panel${open ? ' open' : ''}" role="dialog" aria-label="Metronome and tuner" aria-hidden="${open ? 'false' : 'true'}">
      <div class="tool-panel-head">
        <div class="tool-tabs">
          <button class="tool-tab${tab === 'metronome' ? ' active' : ''}" data-action="tools-tab" data-tab="metronome">Metronome</button>
          <button class="tool-tab${tab === 'tuner' ? ' active' : ''}" data-action="tools-tab" data-tab="tuner">Tuner</button>
        </div>
        <button class="tool-close" data-action="close-tools" aria-label="Close">\u2715</button>
      </div>
      <div class="tool-panel-body">${body}</div>
    </div>
    <button class="tool-fab${open ? ' active' : ''}" data-action="toggle-tools" aria-label="Metronome / tuner" title="Metronome / Tuner" aria-expanded="${open ? 'true' : 'false'}">
      <span class="tool-fab-icon">\u{1F3B5}</span>
    </button>`);
}

function renderReportScreen() {
  const report = buildPracticeReport(getStudentName());
  const statChips = `
    <div class="report-stats">
      <div class="report-stat"><b>${report.level}</b><span>Level</span></div>
      <div class="report-stat"><b>${report.xp}</b><span>XP</span></div>
      <div class="report-stat"><b>${report.streak}</b><span>Day streak</span></div>
      <div class="report-stat"><b>${report.totalMinutes}</b><span>Minutes</span></div>
    </div>`;

  const cards = report.instruments.map(r => {
    const pct = r.notesTotal ? Math.round((r.notesLearned / r.notesTotal) * 100) : 0;
    const weak = r.weak.length
      ? `<div class="report-focus">Focus: ${r.weak.map(w => `${escapeHtml(w.name)} (${w.accuracy}%)`).join(', ')}</div>`
      : '';
    return `
      <div class="report-card">
        <div class="report-card-head">
          <div class="report-card-name">${escapeHtml(r.name)}</div>
          <div class="report-card-xp">${r.xp} XP</div>
        </div>
        <div class="report-bar-track"><div class="report-bar-fill" style="width:${pct}%"></div></div>
        <div class="report-card-line">${r.notesLearned}/${r.notesTotal} notes · ${r.songsCompleted}/${r.songsTotal} songs</div>
        <div class="report-mastery">
          <span class="report-mastered">${r.mastery.mastered} mastered</span>
          <span class="report-practiced">${r.mastery.practiced} practiced</span>
          <span class="report-learning">${r.mastery.learning} learning</span>
        </div>
        ${weak}
      </div>`;
  }).join('') || '<div class="report-empty">No practice recorded yet — play a lesson to start the report.</div>';

  const badges = report.badges.length
    ? report.badges.map(b => `<span class="report-badge">${escapeHtml(b)}</span>`).join('')
    : '<span class="report-badge-empty">No badges yet</span>';

  return `
    <div class="screen active report-screen">
      <div class="app-header">
        <button class="header-back" data-action="close-report">←</button>
        <div class="header-title">Practice report</div>
      </div>
      <div class="lesson-body">
        <div class="report-hero">
          <div class="report-avatar">${report.avatar}</div>
          <div>
            <div class="report-name">${escapeHtml(report.student)}</div>
            <div class="report-date">${report.date}</div>
          </div>
        </div>
        ${statChips}
        <div class="report-section-label">Instruments</div>
        ${cards}
        <div class="report-section-label">Badges · ${report.badges.length}/${report.badgeTotal}</div>
        <div class="report-badges">${badges}</div>
        <div class="report-actions">
          <button class="btn btn-primary" data-action="copy-report">Copy summary</button>
          <button class="btn btn-secondary" data-action="print-report">Print</button>
        </div>
      </div>
    </div>`;
}

function renderDigestCard(name, now = new Date()) {
  if (APP.digestDismissed) return '';
  const d = buildWeeklyDigest(name, now);
  if (d.activeDays === 0) return '';
  const max = Math.max.apply(null, d.days.map(x => x.minutes).concat(1));
  const today = todayKey(now);
  const bars = d.days.map(x => {
    const h = x.minutes > 0 ? Math.max(Math.round((x.minutes / max) * 100), 10) : 4;
    const isToday = x.key === today;
    return `<div class="digest-col">
      <div class="digest-bar${isToday ? ' digest-bar-today' : ''}" style="height:${h}%"></div>
      <span class="digest-col-label${isToday ? ' digest-col-today' : ''}">${x.label[0]}</span>
    </div>`;
  }).join('');
  const pill = d.seen ? '' : '<span class="digest-new">New</span>';
  return `
    <div class="digest-card" data-action="open-digest">
      <div class="digest-card-head">
        <div class="digest-card-title">This week in music ${pill}</div>
        <div class="digest-card-head-right">
          <div class="digest-card-min">${d.totalMinutes} min</div>
          <button class="digest-dismiss" data-action="dismiss-digest" title="Hide for now" aria-label="Hide weekly progress">\u2715</button>
        </div>
      </div>
      <div class="digest-card-headline">${escapeHtml(d.headline)}</div>
      <div class="digest-bars">${bars}</div>
      <div class="digest-goal">
        <div class="digest-goal-track"><div class="digest-goal-fill${d.goalMet ? ' digest-goal-met' : ''}" style="width:${d.goalPct}%"></div></div>
        <span class="digest-goal-text">${d.goalMet ? '\u2713 ' : ''}${d.totalMinutes}/${d.goalMinutes} min goal</span>
      </div>
    </div>`;
}

function renderDigestScreen(now = new Date()) {
  const d = buildWeeklyDigest(getStudentName(), now);
  const max = Math.max.apply(null, d.days.map(x => x.minutes).concat(1));
  const today = todayKey(now);
  const bars = d.days.map(x => {
    const h = x.minutes > 0 ? Math.max(Math.round((x.minutes / max) * 100), 10) : 4;
    const isToday = x.key === today;
    return `<div class="digest-col">
      <div class="digest-bar${isToday ? ' digest-bar-today' : ''}" style="height:${h}%"></div>
      <span class="digest-col-label${isToday ? ' digest-col-today' : ''}">${x.label}</span>
      <span class="digest-col-min">${x.minutes}</span>
    </div>`;
  }).join('');
  const badges = d.badges.length
    ? d.badges.map(b => `<span class="report-badge">${b.icon} ${escapeHtml(b.name)}</span>`).join('')
    : '<span class="report-badge-empty">No new badges this week</span>';
  const goalChips = WEEKLY_GOAL_OPTIONS.map(g =>
    `<button class="digest-goal-chip${g === d.goalMinutes ? ' active' : ''}" data-action="set-weekly-goal" data-goal="${g}">${g} min</button>`
  ).join('');
  const goalStatus = d.goalMet
    ? `\u2713 Goal met — ${d.totalMinutes} of ${d.goalMinutes} min!`
    : `${d.goalRemaining} min to reach your ${d.goalMinutes}-minute goal`;
  return `
    <div class="screen active digest-screen">
      <div class="app-header">
        <button class="header-back" data-action="close-digest">←</button>
        <div class="header-title">Weekly digest</div>
      </div>
      <div class="lesson-body">
        <div class="report-hero">
          <div class="report-avatar">${getAvatar()}</div>
          <div>
            <div class="report-name">${escapeHtml(d.student)}</div>
            <div class="report-date">${d.weekStart} → ${d.weekEnd}</div>
          </div>
        </div>
        <div class="digest-headline">${escapeHtml(d.headline)}</div>
        <div class="report-stats">
          <div class="report-stat"><b>${d.totalMinutes}</b><span>Minutes</span></div>
          <div class="report-stat"><b>${d.activeDays}</b><span>Active days</span></div>
          <div class="report-stat"><b>${d.streak}</b><span>Day streak</span></div>
          <div class="report-stat"><b>${d.level}</b><span>Level</span></div>
        </div>
        <div class="report-section-label">Daily practice (minutes)</div>
        <div class="digest-bars digest-bars-tall">${bars}</div>
        ${d.bestDayLabel ? `<div class="digest-best">Best day: ${d.bestDayLabel} · ${d.bestDayMinutes} min</div>` : ''}
        <div class="report-section-label">Weekly goal</div>
        <div class="digest-goal-track digest-goal-track-lg"><div class="digest-goal-fill${d.goalMet ? ' digest-goal-met' : ''}" style="width:${d.goalPct}%"></div></div>
        <div class="digest-goal-status">${goalStatus}</div>
        <div class="digest-goal-options">${goalChips}</div>
        <div class="report-section-label">New badges this week</div>
        <div class="report-badges">${badges}</div>
        <div class="report-actions">
          <button class="btn btn-primary" data-action="copy-digest">Copy recap</button>
          <button class="btn btn-secondary" data-action="print-digest">Print</button>
        </div>
      </div>
    </div>`;
}

function renderSprintView(inst) {
  const s = APP.sprint;
  if (s.finished) {
    const best = getSprintBest(APP.instrumentId, s.mode);
    const title = s.mode === SPRINT_MODES.SIGHT ? 'Sight-reading' : 'Finger gym';
    return `
      <div class="screen active practice-screen">
        <div class="app-header">
          <button class="header-back" data-action="exit-sprint">✕</button>
          <div class="header-title">${title}</div>
        </div>
        <div class="complete-layout">
          <div class="sprint-result-score">${s.score}</div>
          <div class="complete-sub">correct in ${SPRINT_SECONDS} seconds</div>
          ${s.isBest ? `<div class="sprint-best-badge">New best!</div>` : `<div class="sprint-result-best">Best: ${best}</div>`}
          <div class="complete-xp">+${s.xp} XP</div>
          <div class="gap-lg"></div>
          <button class="btn btn-primary btn-wide" data-action="sprint-again">Play again</button>
          <div class="gap-sm"></div>
          <button class="btn btn-secondary btn-wide" data-action="exit-sprint">Done</button>
        </div>
      </div>`;
  }

  const q = s.question;
  const promptHtml = q.mode === SPRINT_MODES.SIGHT
    ? `<div class="quiz-prompt-svg">${Graphics.staffSVG({ pos: q.prompt.staffStep, accidental: q.prompt.accidental, clef: inst.clef, accentColor: instAccent(inst), width: 100 })}</div>`
    : `<div class="quiz-prompt-note">${escapeHtml(noteDisplayName(t(q.prompt.noteName)))}</div>`;

  const optionsHtml = q.options.map(opt => {
    let cls = 'quiz-option';
    if (opt.id === q.wrongId && !sprintOptionIsCorrect(s, opt)) cls += ' selected-wrong';
    let content;
    if (q.mode === SPRINT_MODES.SIGHT) {
      cls += ' text-only';
      content = `<div class="quiz-option-note">${escapeHtml(noteDisplayName(t(opt.noteName)))}</div>`;
    } else {
      content = `<div class="quiz-option-svg">${fingeringSvg(inst, opt, 72)}</div>`;
    }
    return `<div class="${cls}" data-action="sprint-answer" data-id="${opt.id}">${content}</div>`;
  }).join('');

  const remain = Math.max(0, Math.ceil((s.endsAt - Date.now()) / 1000));
  return `
    <div class="screen active practice-screen sprint-screen">
      <div class="app-header">
        <button class="header-back" data-action="exit-sprint">✕</button>
        <div class="sprint-hud">
          <div class="sprint-timer" id="sprint-timer">${remain}</div>
          <div class="sprint-score">Score <b id="sprint-score">${s.score}</b></div>
        </div>
      </div>
      <div class="lesson-body">
        <div class="lesson-instruction">${q.mode === SPRINT_MODES.SIGHT ? 'Which note is this?' : 'Which fingering plays this note?'}</div>
        <div class="quiz-prompt">${promptHtml}</div>
        <div class="quiz-options sprint-options">${optionsHtml}</div>
      </div>
    </div>`;
}

function startSprintTimer() {
  clearInterval(APP.sprintTimer);
  APP.sprintTimer = setInterval(() => {
    const s = APP.sprint;
    if (!s || s.finished) { clearInterval(APP.sprintTimer); APP.sprintTimer = null; return; }
    const remain = Math.max(0, Math.ceil((s.endsAt - Date.now()) / 1000));
    const el = document.getElementById('sprint-timer');
    if (el) el.textContent = remain;
    if (remain <= 0) finishSprint();
  }, 250);
}

function startSprint(mode) {
  const learned = getLearnedNotes(APP.instrumentId);
  if (learned.length < 2) { showToast('Learn a couple of notes first.'); return; }
  APP.sprint = {
    mode,
    endsAt: Date.now() + SPRINT_SECONDS * 1000,
    score: 0,
    finished: false,
    isBest: false,
    xp: 0,
    question: buildSprintQuestion(APP.instrumentId, mode),
  };
  startSprintTimer();
  render();
}

function finishSprint() {
  clearInterval(APP.sprintTimer);
  APP.sprintTimer = null;
  const s = APP.sprint;
  if (!s || s.finished) return;
  s.finished = true;
  s.isBest = setSprintBest(APP.instrumentId, s.mode, s.score);
  s.xp = s.score * 2;
  if (s.xp > 0) {
    const prog = getInstrumentProgress(APP.instrumentId);
    prog.xp += s.xp;
    saveProgress();
  }
  markPlanItemDone(APP.instrumentId, 'sprint', s.mode);
  evaluateBadges({ toast: true });
  render();
}

// ── RENDER: LESSON SCREEN ───────────────────────────────────────────────────
function phasePercent(phase) {
  return { present: 20, quiz: 50, play: 78, complete: 100 }[phase] || 20;
}

function renderLessonScreen() {
  const inst = getInstrument(APP.instrumentId);
  const lesson = getLesson(APP.instrumentId, APP.lessonIndex);
  const isReview = isReviewLesson(lesson);
  const isSong = isSongLesson(lesson);

  let body = '';
  if (isSong && APP.phase === 'present') {
    APP.songNoteIndex = APP.songNoteIndex || 0;
    body = renderSongPresentPhase(inst, lesson);
  } else if (APP.phase === 'present') body = renderPresentPhase(inst, lesson);
  else if (APP.phase === 'quiz') body = renderQuizPhase(inst, lesson);
  else if (APP.phase === 'play') body = renderPlayPhase(inst, lesson);
  else if (APP.phase === 'complete') body = renderCompletePhase(inst, lesson);

  const showHeader = APP.phase !== 'complete';
  const header = showHeader ? `
      <div class="app-header">
        <button class="header-back" data-action="exit-lesson">✕</button>
        <div class="header-progress" style="margin-left:0; flex:1;">
          <div class="progress-bar-track" style="flex:1; width:auto;"><div class="progress-bar-fill" style="width:${phasePercent(APP.phase)}%"></div></div>
        </div>
      </div>` : '';

  return `<div class="screen active lesson-screen">${header}${body}</div>`;
}

function renderPresentPhase(inst, lesson) {
  const fingeringDiagram = fingeringSvg(inst, lesson, 84);
  const staffSvg = Graphics.staffSVG({ pos: lesson.staffStep, accidental: lesson.accidental, clef: inst.clef, accentColor: instAccent(inst), width: 96 });
  const transposeNote = inst.isTransposing && lesson.concertNote
    ? `<div class="note-description">Sounds as concert ${lesson.concertNote} (${ ({'-9':'E\u266d','-7':'F','-2':'B\u266d'})[inst.transposeSemitones] || 'B\u266d' } instrument).</div>` : '';

  const mastery = getNoteMastery(APP.instrumentId, lesson.id);
  const masteryLevel = getMasteryLevel(mastery);
  const masteryColor = getMasteryColor(masteryLevel);
  const isReview = !!APP.progress[APP.instrumentId]?.completed[lesson.id];
  const reviewLabel = isReview ? `<div style="font-size:12px;font-weight:600;color:${masteryColor};text-transform:uppercase;letter-spacing:0.08em;margin-bottom:8px">${getMasteryLabel(masteryLevel)}</div>` : '';

  return `
    <div class="lesson-body">
      <div class="lesson-instruction">${isReview ? 'Review this note' : 'Meet your next note'}</div>
      ${reviewLabel}
      <div class="present-layout">
        <div class="present-diagram-wrap">
          <div class="present-diagram-label">Fingering</div>
          <div class="present-diagram-svg">${fingeringDiagram}</div>
        </div>
        <div class="present-notation-wrap">
          <div class="present-diagram-label">On the staff</div>
          <div class="present-diagram-svg">${staffSvg}</div>
        </div>
      </div>
      ${stringFingerCard(inst, lesson)}
      <div class="note-name-block">
        <span class="note-name-big">${escapeHtml(noteDisplayName(t(lesson.noteName)))}</span>
      </div>
      <div class="note-description">${escapeHtml(lessonText(lesson))}</div>
      ${transposeNote}
      <div class="gap-md"></div>
      <div class="note-prompt">${escapeHtml(lessonText(lesson, 'prompt'))}</div>
      <div class="gap-lg"></div>
      <button class="btn-hear" data-action="hear-note"><span class="hear-icon">🔊</span> Hear it</button>
    </div>
    <div class="action-bar">
      <button class="btn btn-primary btn-wide" data-action="goto-quiz">Continue</button>
    </div>`;
}

// The practice-speed readout shared by the +/- buttons. Shows the percentage
// and the resulting song tempo so the student can see both.
function songSpeedLabelText(speed) {
  return Math.round(speed * 100) + '% (' + Math.round(100 * speed) + ' BPM)';
}
function renderSongSpeedControl(disabled) {
  return `
    <div class="song-speed-control">
      <button class="btn-speed" data-action="song-speed-down" aria-label="Slower" ${disabled || APP.songSpeed <= SPEED_MIN ? 'disabled' : ''}>−</button>
      <span class="song-speed-label">${songSpeedLabelText(APP.songSpeed)}</span>
      <button class="btn-speed" data-action="song-speed-up" aria-label="Faster" ${disabled || APP.songSpeed >= SPEED_MAX ? 'disabled' : ''}>+</button>
    </div>`;
}
// Update only the label text in place (used while playback is running, so we
// don't tear down the live audio with a full re-render).
function updateSongSpeedLabels() {
  const text = songSpeedLabelText(APP.songSpeed);
  document.querySelectorAll('.song-speed-label').forEach(lbl => { lbl.textContent = text; });
  document.querySelectorAll('[data-action="song-speed-down"]').forEach(b => { b.disabled = APP.songSpeed <= SPEED_MIN; });
  document.querySelectorAll('[data-action="song-speed-up"]').forEach(b => { b.disabled = APP.songSpeed >= SPEED_MAX; });
}

function renderSongPresentPhase(inst, lesson) {
  const totalNotes = lesson.noteIds.length;
  APP.songNoteIndex = Math.min(Math.max(APP.songNoteIndex, 0), totalNotes - 1);
  const note = getResolvedSongNote(APP.instrumentId, lesson);
  const currentNum = APP.songNoteIndex + 1;
  const isFirst = APP.songNoteIndex === 0;
  const isLast = APP.songNoteIndex >= totalNotes - 1;
  const hasAudio = !!lesson.audioUrl;

  const fingeringDiagram = fingeringSvg(inst, note, 84);
  const staffSvg = Graphics.staffSVG({ pos: note.staffStep, accidental: note.accidental, clef: inst.clef, accentColor: instAccent(inst), width: 96 });

  const melodyNotes = [];
  let highlightIndex = -1;
  const songDurations = getNoteDurations(lesson);
  lesson.noteIds.forEach((id, i) => {
    const n = findLessonById(APP.instrumentId, id);
    if (!n || typeof n.staffStep !== 'number') return;
    if (i === APP.songNoteIndex) highlightIndex = melodyNotes.length;
    melodyNotes.push({ pos: n.staffStep, accidental: n.accidental, duration: songDurations[i] });
  });
  const melodySvg = melodyNotes.length
    ? Graphics.melodySVG({ notes: melodyNotes, highlightIndex, clef: inst.clef, accentColor: instAccent(inst), width: 320 })
    : '';

  let actionButtons;
  if (hasAudio) {
    actionButtons = `
      <div style="display:flex;gap:8px;align-items:center;flex-wrap:wrap">
        <button class="btn btn-secondary" data-action="song-prev" ${isFirst ? 'disabled' : ''}>‹ Prev</button>
        <button class="btn btn-secondary" data-action="song-next" ${isLast ? 'disabled' : ''}>Next ›</button>
      </div>
      <button class="btn btn-primary btn-wide" data-action="play-song-audio-start" style="margin-top:8px">▶ Play with recording</button>`;
  } else {
    actionButtons = `
      <div style="display:flex;gap:8px;align-items:center;flex-wrap:wrap">
        <button class="btn btn-secondary" data-action="song-prev" ${isFirst ? 'disabled' : ''}>‹ Prev</button>
        <button class="btn-hear" data-action="hear-note"><span class="hear-icon">🔊</span> Play note</button>
        <button class="btn btn-secondary" data-action="song-next" ${isLast ? 'disabled' : ''}>Next ›</button>
      </div>
      <div class="song-playback-controls">
        <button class="btn btn-secondary" data-action="play-melody">▶ Play whole melody</button>
        ${renderSongSpeedControl()}
      </div>`;
  }

  return `
    <div class="lesson-body">
      <div class="lesson-instruction">${escapeHtml(noteDisplayName(t(lesson.noteName)))}</div>
      <div style="font-size:12px;font-weight:600;color:var(--text-muted);margin-bottom:16px">Note ${currentNum} of ${totalNotes}</div>
      ${melodySvg ? `<div class="song-melody-wrap">
        <div class="present-diagram-label">Sheet music</div>
        <div class="song-melody-svg">${melodySvg}</div>
      </div>` : ''}
      <div class="present-layout">
        <div class="present-diagram-wrap">
          <div class="present-diagram-label">Fingering</div>
          <div class="present-diagram-svg">${fingeringDiagram}</div>
        </div>
        <div class="present-notation-wrap">
          <div class="present-diagram-label">On the staff</div>
          <div class="present-diagram-svg">${staffSvg}</div>
        </div>
      </div>
      ${stringFingerCard(inst, note)}
      <div class="note-name-block">
        <span class="note-name-big">${noteDisplayName(note.noteName)}</span>
      </div>
      <div class="note-description">${escapeHtml(lessonText(lesson))}</div>
      <div class="gap-md"></div>
      <div class="note-prompt">${escapeHtml(lessonText(lesson, 'prompt'))}</div>
      ${actionButtons}
    </div>
    <div class="action-bar">
      <button class="btn btn-primary btn-wide" data-action="goto-quiz">Continue to quiz</button>
    </div>`;
}

function renderSongAudioPlayerContent(inst, lesson) {
  return `
    <div class="lesson-body" id="song-audio-body">
      <div class="lesson-instruction">${escapeHtml(noteDisplayName(t(lesson.noteName)))}</div>
      <div class="song-audio-status" id="song-audio-status">Tap play, then follow along with the recording.</div>
      <div class="beat-grid" id="song-audio-beats" style="justify-content:center;margin-bottom:20px">
        ${[1,2,3,4].map(n => `<div class="beat-cell count-in" data-beat="${n}"><span class="beat-num">${n}</span></div>`).join('')}
      </div>
      <div id="song-audio-notation">
        <div class="present-layout">
          <div class="present-diagram-wrap">
            <div class="present-diagram-label">Fingering</div>
            <div class="present-diagram-svg" id="song-audio-fingering"></div>
          </div>
          <div class="present-notation-wrap">
            <div class="present-diagram-label">On the staff</div>
            <div class="present-diagram-svg" id="song-audio-staff"></div>
          </div>
        </div>
        <div class="note-name-block">
          <span class="note-name-big" id="song-audio-notename"></span>
        </div>
      </div>
      <div class="song-audio-progress" id="song-audio-progress"></div>
      <div class="gap-md"></div>
      <button class="btn btn-primary btn-wide" data-action="play-song-audio-start" id="play-song-audio-btn">▶ Play with recording</button>
      <div class="gap-sm"></div>
    </div>`;
}

function stopPlaySequence() {
  APP.playSequenceTimeouts.forEach(clearTimeout);
  APP.playSequenceTimeouts = [];
}
function stopAudioPlayback() {
  APP.audioPlaybackTimeouts.forEach(clearTimeout);
  APP.audioPlaybackTimeouts = [];
  if (APP.audioPlaybackInterval) {
    clearInterval(APP.audioPlaybackInterval);
    APP.audioPlaybackInterval = null;
  }
  if (APP.audioPlaybackAudio) {
    APP.audioPlaybackAudio.pause();
    APP.audioPlaybackAudio = null;
  }
}

function startSongAudioPlayback(inst, lesson) {
  const statusEl = document.getElementById('song-audio-status');
  const beatEls = document.querySelectorAll('#song-audio-beats .beat-cell');
  const fingEl = document.getElementById('song-audio-fingering');
  const staffEl = document.getElementById('song-audio-staff');
  const nameEl = document.getElementById('song-audio-notename');
  const progEl = document.getElementById('song-audio-progress');
  const playBtn = document.getElementById('play-song-audio-btn');
  if (!playBtn || playBtn.disabled) return;

  const bpm = lesson.bpm || 100;
  const msPerBeat = 60000 / bpm;

  playBtn.disabled = true;
  playBtn.textContent = 'Preparing\u2026';

  // Clean up any previous playback
  stopAudioPlayback();

  statusEl.textContent = 'Count-in\u2026';

  // Preload the recording. We only start it once the count-in finishes so the
  // first note sounds at the same moment its highlight appears.
  const audio = new Audio(lesson.audioUrl);
  audio.preload = 'auto';
  APP.audioPlaybackAudio = audio;

  // Four-beat visual count-in, then start the recording and the note
  // highlighting together.
  let beatCount = 0;
  function tick() {
    beatEls.forEach(el => el.classList.remove('active'));
    if (beatCount < 4) {
      if (beatEls[beatCount]) beatEls[beatCount].classList.add('active');
      beatCount++;
    } else {
      clearInterval(APP.audioPlaybackInterval);
      APP.audioPlaybackInterval = null;
      beatEls.forEach(el => el.classList.remove('active'));
      startNotes();
    }
  }
  tick();
  APP.audioPlaybackInterval = setInterval(tick, msPerBeat);

  function startNotes() {
    statusEl.textContent = 'Playing\u2026';
    playBtn.textContent = 'Playing\u2026';

    // Match the recording to the count-in tempo. Pitch is preserved so the
    // tune slows down rather than dropping in key.
    audio.playbackRate = APP.songSpeed;
    if ('preservesPitch' in audio) audio.preservesPitch = true;
    if ('mozPreservesPitch' in audio) audio.mozPreservesPitch = true;
    if ('webkitPreservesPitch' in audio) audio.webkitPreservesPitch = true;

    audio.play().catch(() => {
      statusEl.textContent = 'Audio failed to load.';
      playBtn.textContent = 'Retry';
      playBtn.disabled = false;
      APP.audioPlaybackAudio = null;
    });

    const noteIds = lesson.noteIds;
    const durations = getNoteDurations(lesson);
    let totalBeats = 0;
    noteIds.forEach((id, i) => {
      const startBeat = totalBeats;
      totalBeats += durations[i];
      const t = setTimeout(() => {
        const note = findLessonById(APP.instrumentId, id);
        if (fingEl) fingEl.innerHTML = fingeringSvg(inst, note, 84);
        if (staffEl) staffEl.innerHTML = Graphics.staffSVG({ pos: note.staffStep, accidental: note.accidental, clef: inst.clef, accentColor: instAccent(inst), width: 96 });
        if (nameEl) nameEl.textContent = note.noteName;
        if (progEl) progEl.textContent = `Note ${i + 1} of ${noteIds.length}`;
      }, startBeat * msPerBeat);
      APP.audioPlaybackTimeouts.push(t);
    });

    // Beat indicator: advance one cell per beat for the length of the song.
    for (let b = 0; b < totalBeats; b++) {
      const t = setTimeout(() => {
        beatEls.forEach(el => el.classList.remove('active'));
        if (beatEls[b % 4]) beatEls[b % 4].classList.add('active');
      }, b * msPerBeat);
      APP.audioPlaybackTimeouts.push(t);
    }

    const done = setTimeout(() => {
      statusEl.textContent = 'Song complete!';
      playBtn.textContent = 'Done';
      playBtn.disabled = false;
      playBtn.dataset.action = 'back-to-present';
    }, totalBeats * msPerBeat);
    APP.audioPlaybackTimeouts.push(done);
  }
}

function buildSongQuizOptions(inst, song) {
  const uniqueNoteIds = [...new Set(song.noteIds)];
  const randomId = uniqueNoteIds[Math.floor(Math.random() * uniqueNoteIds.length)];
  const noteLesson = findLessonById(APP.instrumentId, randomId);
  return buildQuizOptions(inst, noteLesson);
}

// A review item may be a plain note or a whole song. Songs have no fingering or
// notation of their own, so reviewing one asks about a note drawn from it.
function buildReviewQuiz(inst, id) {
  const lesson = findLessonById(APP.instrumentId, id);
  return isSongLesson(lesson) ? buildSongQuizOptions(inst, lesson) : buildQuizOptions(inst, lesson);
}

// On a string instrument one fingering names exactly one note, so the options
// are compared by their note. The helper stays generic because a fingering is
// compared as a whole: string number and finger number together.
function sameFingering(a, b) {
  return !!a && !!b && JSON.stringify(a) === JSON.stringify(b);
}

// Finger-gym sprints share the fingering ambiguity: the prompt is a note name
// and every option that shows the prompt's fingering is a valid tap.
function sprintOptionIsCorrect(s, opt) {
  if (opt.id === s.question.correctId) return true;
  if (s.mode === SPRINT_MODES.FINGER) {
    return sameFingering(opt.fingeringState, s.question.prompt.fingeringState);
  }
  return false;
}

function quizOptionIsCorrect(q, opt) {
  if (opt.id === q.correctId) return true;
  if (q.quizType === QUIZ_TYPES.FINGERING_TO_NOTE || q.quizType === QUIZ_TYPES.NOTE_TO_FINGERING) {
    return sameFingering(opt.fingeringState, q.prompt.fingeringState);
  }
  return false;
}

function buildQuizOptions(inst, lesson, forcedType) {
  const completedCount = getLearnedNotes(APP.instrumentId).length;
  const alreadyCompleted = !!getInstrumentProgress(APP.instrumentId).completed[lesson.id];

  const availableTypes = [QUIZ_TYPES.FINGERING_TO_NOTE];
  if (completedCount >= 1) availableTypes.push(QUIZ_TYPES.NOTE_TO_FINGERING);
  if (completedCount >= 2) availableTypes.push(QUIZ_TYPES.STAFF_TO_NOTE);
  if (completedCount >= 3) availableTypes.push(QUIZ_TYPES.NOTE_TO_STAFF);

  const quizType = forcedType
    ? forcedType
    : alreadyCompleted
      ? availableTypes[Math.floor(Math.random() * availableTypes.length)]
      : QUIZ_TYPES.FINGERING_TO_NOTE;

  // Draw distractors from learned notes for spaced repetition;
  // fall back to all lessons if not enough learned notes exist.
  const learned = getLearnedNotes(APP.instrumentId).filter(l => l.id !== lesson.id);
  // Songs and review sessions have no fingering/notation of their own, so they
  // can never be distractors — only real note lessons may appear as options.
  const noteLessons = inst.lessons.filter(l => !isReviewLesson(l) && !isSongLesson(l));
  // A note that shares the prompt's fingering is a valid answer, never a
  // distractor — filter those out and only fall back to them if the pool of
  // genuinely different fingerings runs dry.
  const differsFromPrompt = l => !sameFingering(l.fingeringState, lesson.fingeringState);
  let pool = learned.filter(differsFromPrompt);
  if (pool.length < 2) pool = noteLessons.filter(l => l.id !== lesson.id && differsFromPrompt(l));
  if (pool.length < 2) pool = learned.filter(l => l.id !== lesson.id);
  if (pool.length < 2) pool = noteLessons.filter(l => l.id !== lesson.id);
  const distractors = shuffle(pool).slice(0, 2);

  return {
    quizType,
    prompt: lesson,
    options: shuffle([lesson, ...distractors]),
    correctId: lesson.id,
    answeredCorrectly: false,
    wrongIds: [],
  };
}

// A note lesson opens with a short mixed quiz: the note being taught plus a
// rotating selection of notes already learned. The set cycles through whichever
// quiz types the student has unlocked, and never repeats a note to pad the
// count (the first lesson still asks a single question).
function buildNoteQuizQueue(inst, lesson) {
  const learned = getLearnedNotes(APP.instrumentId);
  const alreadyCompleted = learned.some(l => l.id === lesson.id);
  // Distinct notes that can be asked without repeating: the prior notes, plus
  // the new note if it has not been completed yet.
  const available = alreadyCompleted ? learned.length : learned.length + 1;
  const count = Math.min(3, available);

  const others = shuffle(learned.filter(l => l.id !== lesson.id)).slice(0, count - 1);
  const prompts = shuffle([lesson, ...others]);

  const completedCount = learned.length;
  const types = [QUIZ_TYPES.FINGERING_TO_NOTE];
  if (completedCount >= 1) types.push(QUIZ_TYPES.NOTE_TO_FINGERING);
  if (completedCount >= 2) types.push(QUIZ_TYPES.STAFF_TO_NOTE);
  if (completedCount >= 3) types.push(QUIZ_TYPES.NOTE_TO_STAFF);

  return prompts.map((note, i) => buildQuizOptions(inst, note, types[i % types.length]));
}

// A sprint question is drawn only from notes the student has completed, so it
// always tests material they have met. The prompt is weighted toward weak
// notes, while distractors stay random for realistic options. Up to three
// distractors keep options at four once enough notes are known.
function buildSprintQuestion(instrumentId, mode) {
  const learned = getLearnedNotes(instrumentId);
  const prompt = pickWeightedNote(instrumentId, learned) || learned[0];
  const distractors = shuffle(learned.filter(l => l.id !== prompt.id)).slice(0, 3);
  return {
    mode,
    prompt,
    options: shuffle([prompt, ...distractors]),
    correctId: prompt.id,
    wrongId: null,
  };
}

function getQuizQuestionText(quizType) {
  switch (quizType) {
    case QUIZ_TYPES.FINGERING_TO_NOTE:  return 'Which note does this fingering play?';
    case QUIZ_TYPES.NOTE_TO_FINGERING:  return 'Which fingering plays this note?';
    case QUIZ_TYPES.STAFF_TO_NOTE:      return 'What note is on the staff?';
    case QUIZ_TYPES.NOTE_TO_STAFF:      return 'Which staff position matches this note?';
    default:                            return 'Which one is correct?';
  }
}

function renderQuizPhase(inst, lesson) {
  const isReview = isReviewLesson(lesson);
  if (!APP.quiz) {
    APP.quizQueue = isSongLesson(lesson)
      ? [buildSongQuizOptions(inst, lesson)]
      : buildNoteQuizQueue(inst, lesson);
    APP.quizIndex = 0;
    APP.quiz = APP.quizQueue[0];
  }
  const q = APP.quiz;

  // Review progress indicator / mixed-set progress indicator
  let reviewProgress = '';
  if (isReview) {
    reviewProgress = `<div class="review-progress">Note ${APP.reviewIndex + 1} of ${APP.reviewTotal}</div>`;
  } else if (APP.quizQueue.length > 1) {
    reviewProgress = `<div class="review-progress">Question ${APP.quizIndex + 1} of ${APP.quizQueue.length}</div>`;
  }

  // ── PROMPT ──
  let promptHtml = '';
  if (q.quizType === QUIZ_TYPES.FINGERING_TO_NOTE) {
    promptHtml = `<div class="quiz-prompt-svg">${fingeringSvg(inst, q.prompt, 100)}</div>`;
  } else if (q.quizType === QUIZ_TYPES.NOTE_TO_FINGERING) {
    promptHtml = `<div class="quiz-prompt-note">${escapeHtml(noteDisplayName(t(q.prompt.noteName)))}</div>`;
  } else if (q.quizType === QUIZ_TYPES.STAFF_TO_NOTE) {
    promptHtml = `<div class="quiz-prompt-svg">${Graphics.staffSVG({ pos: q.prompt.staffStep, accidental: q.prompt.accidental, clef: inst.clef, accentColor: instAccent(inst), width: 100 })}</div>`;
  } else if (q.quizType === QUIZ_TYPES.NOTE_TO_STAFF) {
    promptHtml = `<div class="quiz-prompt-note">${escapeHtml(noteDisplayName(t(q.prompt.noteName)))}</div>`;
  }

  // ── OPTIONS ──
  const optionsHtml = q.options.map(opt => {
    const isWrongTapped = q.wrongIds.includes(opt.id);
    const optIsCorrect = quizOptionIsCorrect(q, opt);
    const isCorrectShown = q.answeredCorrectly && optIsCorrect;
    const isDimmed = (q.answeredCorrectly && !optIsCorrect) || (isWrongTapped && !isCorrectShown);
    let cls = 'quiz-option';
    if (isCorrectShown) cls += ' selected-correct';
    if (isWrongTapped) cls += ' selected-wrong';
    if (isDimmed) cls += ' dimmed';

    let content = '';
    if (q.quizType === QUIZ_TYPES.FINGERING_TO_NOTE) {
      cls += ' text-only';
      content = `<div class="quiz-option-note">${escapeHtml(noteDisplayName(t(opt.noteName)))}</div>`;
    } else if (q.quizType === QUIZ_TYPES.NOTE_TO_FINGERING) {
      content = `<div class="quiz-option-svg">${fingeringSvg(inst, opt, 72)}</div>`;
    } else if (q.quizType === QUIZ_TYPES.STAFF_TO_NOTE) {
      cls += ' text-only';
      content = `<div class="quiz-option-note">${escapeHtml(noteDisplayName(t(opt.noteName)))}</div>`;
    } else if (q.quizType === QUIZ_TYPES.NOTE_TO_STAFF) {
      content = `<div class="quiz-option-svg">${Graphics.staffSVG({ pos: opt.staffStep, accidental: opt.accidental, clef: inst.clef, accentColor: instAccent(inst), width: 72 })}</div>`;
    }

    return `<div class="${cls}" data-action="quiz-answer" data-id="${opt.id}">${content}</div>`;
  }).join('');

  const feedback = q.answeredCorrectly
    ? `<div class="quiz-feedback correct visible">Nice work!</div>`
    : (q.wrongIds.length > 0 ? `<div class="quiz-feedback wrong visible">Not quite — try again.</div>` : `<div class="quiz-feedback"></div>`);

  const btnLabel = isReview
    ? (APP.reviewIndex >= APP.reviewTotal - 1 ? 'See summary' : 'Next note')
    : (APP.quizIndex >= APP.quizQueue.length - 1 ? 'Continue' : 'Next question');

  return `
    <div class="lesson-body">
      ${reviewProgress}
      <div class="lesson-instruction">${getQuizQuestionText(q.quizType)}</div>
      <div class="quiz-prompt">${promptHtml}</div>
      <div class="quiz-options">${optionsHtml}</div>
      ${feedback}
    </div>
    <div class="action-bar">
      <button class="btn btn-primary btn-wide" data-action="goto-play" ${q.answeredCorrectly ? '' : 'disabled'}>${btnLabel}</button>
    </div>`;
}

function renderPlayPhase(inst, lesson) {
  const fingeringDiagram = fingeringSvg(inst, lesson, 120);
  const cells = [1, 2, 3, 4].map(n => `<div class="beat-cell count-in" data-beat="${n}"><span class="beat-num">${n}</span></div>`).join('');
  const playCell = `<div class="beat-cell" data-beat="play">♪</div>`;

  let recordPanel = '';
  if (canRecord()) {
    const recording = !!APP.recorder;
    let controls;
    let status;
    if (recording) {
      controls = `<button class="btn btn-secondary btn-wide" data-action="record-toggle">⏹ Stop recording</button>`;
      status = 'Recording — play now, then tap Stop.';
    } else if (APP.recordingUrl) {
      controls = `
        <div class="record-actions">
          <button class="btn btn-secondary" data-action="play-recording">▶ My take</button>
          <button class="btn-hear" data-action="hear-note"><span class="hear-icon">🔊</span> Model</button>
          <button class="btn btn-ghost" data-action="record-toggle">Re-record</button>
        </div>
        <button class="btn-ghost" data-action="discard-recording">Delete recording</button>`;
      status = 'Listen back, then compare with the model.';
    } else {
      controls = `
        <button class="btn btn-secondary btn-wide" data-action="record-toggle">⏺ Record yourself</button>
        <button class="btn-hear" data-action="hear-note"><span class="hear-icon">🔊</span> Hear the model</button>`;
      status = 'Record yourself and compare with the model.';
    }
    recordPanel = `
      <div class="record-panel">
        <div class="record-status" id="record-status">${status}</div>
        <div class="record-controls">${controls}</div>
      </div>`;
  }

  return `
    <div class="lesson-body">
      <div class="lesson-instruction">Play it on your instrument</div>
      <div class="play-layout">
        <div class="play-diagram-large">
          ${fingeringDiagram}
          <span class="play-note-label">${escapeHtml(noteDisplayName(t(lesson.noteName)))}</span>
        </div>
        <div class="beat-grid">${cells}${playCell}</div>
        <div class="play-status" id="play-status">Tap Start, then play along on the count.</div>
        <button class="btn btn-secondary" data-action="play-start" id="play-start-btn">▶ Start count-in</button>
        ${recordPanel}
      </div>
    </div>
    <div class="action-bar">
      <button class="btn btn-success btn-wide" data-action="play-confirm" ${APP.play.hasPlayed ? '' : 'disabled'}>I played it!</button>
    </div>`;
}

function renderCompletePhase(inst, lesson) {
  const stars = APP.lastStars || 3;
  const xp = APP.lastXp || 10;
  const starsHtml = '★'.repeat(stars) + '☆'.repeat(3 - stars);
  const isReview = isReviewLesson(lesson);

  if (isReview) {
    // Review summary: show each reviewed note's mastery
    const notesHtml = lesson.reviewLessonIds.map(id => {
      const note = findLessonById(APP.instrumentId, id);
      const count = getNoteMastery(APP.instrumentId, id);
      const level = getMasteryLevel(count);
      const color = getMasteryColor(level);
      return `
        <div class="review-note-row">
          <span class="review-note-name">${noteDisplayName(note.noteName)}</span>
          <span class="review-note-badge" style="background:${color}22;color:${color}">${getMasteryLabel(level)}</span>
        </div>`;
    }).join('');

    return `
      <div class="complete-layout">
        <div class="complete-stars">${starsHtml}</div>
        <div class="complete-xp">+${xp} XP</div>
        <div class="complete-title">Review complete!</div>
        <div class="complete-sub">${APP.reviewCorrect} of ${APP.reviewTotal} on first try</div>
        <div class="review-notes-list">${notesHtml}</div>
        <div class="gap-lg"></div>
        <button class="btn btn-primary btn-wide" data-action="finish-lesson">Continue</button>
      </div>`;
  }

  const mastery = getNoteMastery(APP.instrumentId, lesson.id);
  const masteryLevel = getMasteryLevel(mastery);
  const masteryColor = getMasteryColor(masteryLevel);
  const alreadyDone = !!APP.completedBefore;
  const isSong = isSongLesson(lesson);

  const messages = {
    new: 'You got the basics down!',
    learning: 'Getting there — keep practicing!',
    practiced: 'Solid understanding of this note.',
    mastered: 'You really know this note well!',
  };

  const exportBtn = isSong ? `<button class="btn btn-secondary" data-action="export-musicxml" style="width:100%;margin-bottom:8px">Export MusicXML</button>` : '';
  // Mastery is tracked per note, so it is meaningless for a song (whose id is
  // not a note) — only show the badge for regular note lessons.
  const masteryBadge = isSong ? '' : `<div style="margin-top:8px;padding:6px 14px;border-radius:20px;background:${masteryColor}22;color:${masteryColor};font-size:12px;font-weight:700;text-transform:uppercase;letter-spacing:0.06em">${getMasteryLabel(masteryLevel)} — ${mastery} correct</div>`;

  return `
    <div class="complete-layout">
      <div class="complete-stars">${starsHtml}</div>
      <div class="complete-xp">+${xp} XP</div>
      <div class="complete-title">${alreadyDone ? 'Review complete!' : 'Lesson complete!'}</div>
      <div class="complete-sub">${isSong ? 'Song complete!' : messages[masteryLevel]}</div>
      ${masteryBadge}
      <div class="gap-lg"></div>
      ${exportBtn}
      <button class="btn btn-primary btn-wide" data-action="finish-lesson">Continue</button>
    </div>`;
}

// ── MASTER RENDER ───────────────────────────────────────────────────────
function render() {
  const app = document.getElementById('app');
  let html = '';
  if (APP.screen === 'select') html = renderSelectScreen();
  else if (APP.screen === 'settings') html = renderSettingsScreen();
  else if (APP.screen === 'report') html = renderReportScreen();
  else if (APP.screen === 'digest') html = renderDigestScreen();
  else if (APP.screen === 'tutorial') html = renderTutorialScreen();
  else if (APP.screen === 'map') html = renderMapScreen();
  else if (APP.screen === 'practice') html = renderPracticeScreen();
  else if (APP.screen === 'ear') html = renderEarScreen();
  else if (APP.screen === 'first-sound') html = renderFirstSoundScreen();
  else if (APP.screen === 'lookup') html = renderLookupScreen();
  else if (APP.screen === 'lesson') html = renderLessonScreen();
  app.innerHTML = translateHtml(html);
  renderToolWidget();
}

// ── PLAY PHASE SEQUENCE ─────────────────────────────────────────────────
function runPlaySequence(inst, lesson) {
  const btn = document.getElementById('play-start-btn');
  const status = document.getElementById('play-status');
  if (!btn || btn.disabled) return;
  btn.disabled = true;
  btn.textContent = '...';
  const beatMs = msPerBeatAt(80, APP.songSpeed); // 80 BPM base, scaled by practice speed
  const cells = document.querySelectorAll('.beat-cell');

  function clearActive() { cells.forEach(c => c.classList.remove('active')); }

  status.textContent = 'Get ready...';
  [1, 2, 3, 4].forEach((n, i) => {
    const t = setTimeout(() => {
      clearActive();
      const cell = document.querySelector(`.beat-cell[data-beat="${n}"]`);
      if (cell) cell.classList.add('active');
      AudioEngine.playClick(n === 1);
      status.textContent = `${n}...`;
    }, i * beatMs);
    APP.playSequenceTimeouts.push(t);
  });

  const t2 = setTimeout(() => {
    clearActive();
    const playCell = document.querySelector('.beat-cell[data-beat="play"]');
    if (playCell) playCell.classList.add('active');
    AudioEngine.playInstrumentNote(lesson.freq, inst.fingeringType, 1.3, inst.id);
    status.textContent = 'Play now!';
  }, 4 * beatMs);
  APP.playSequenceTimeouts.push(t2);

  const t3 = setTimeout(() => {
    clearActive();
    status.textContent = 'Nice. Tap Start to try again, or confirm below.';
    btn.disabled = false;
    btn.textContent = '▶ Replay count-in';
    APP.play.hasPlayed = true;
    const confirmBtn = document.querySelector('[data-action="play-confirm"]');
    if (confirmBtn) confirmBtn.disabled = false;
  }, 4 * beatMs + 1500);
  APP.playSequenceTimeouts.push(t3);
}

// ── SONG SEQUENCE ──────────────────────────────────────────────────────
function runSongSequence(inst, lesson) {
  const noteIds = lesson.noteIds;
  const durations = getNoteDurations(lesson);
  const msPerBeat = msPerBeatAt(lesson.bpm || 100, APP.songSpeed);
  let beat = 0;
  noteIds.forEach((id, i) => {
    const note = findLessonById(APP.instrumentId, id);
    const chordFreqs = getChordFrequencies(APP.instrumentId, lesson, i);
    const start = beat;
    beat += durations[i];
    const seconds = durations[i] * msPerBeat / 1000;
    const tn = setTimeout(() => {
      if (chordFreqs.length > 0) {
        AudioEngine.playChord(chordFreqs, inst.fingeringType, seconds, inst.id);
      }
      if (note) AudioEngine.playInstrumentNote(note.freq, inst.fingeringType, seconds, inst.id);
    }, start * msPerBeat);
    APP.playSequenceTimeouts.push(tn);
  });
}

// ── EAR TRAINING AUDIO ────────────────────────────────────────────────
function stopEarPlayback() {
  APP.earTimers.forEach(clearTimeout);
  APP.earTimers = [];
}

function playEarPhrase() {
  const e = APP.ear;
  if (!e || !e.phrase.length) return;
  stopEarPlayback();
  AudioEngine.unlock();
  const inst = getInstrument(APP.instrumentId);
  e.phrase.forEach((id, i) => {
    const note = findLessonById(APP.instrumentId, id);
    if (!note) return;
    const t = setTimeout(() => {
      AudioEngine.playInstrumentNote(note.freq, inst.fingeringType, 0.75, inst.id);
    }, 250 + i * EAR_NOTE_GAP_MS);
    APP.earTimers.push(t);
  });
}

// ── METRONOME RUNTIME ─────────────────────────────────────────────────
function updateMetronomeDots() {
  const m = APP.metronome;
  const wrap = document.getElementById('metronome-dots');
  if (!m || !wrap) return;
  const dots = [];
  for (let i = 0; i < m.beatsPerBar; i++) {
    dots.push(`<div class="metro-dot ${i === m.beat ? 'metro-dot-active' : ''} ${i === 0 ? 'metro-dot-downbeat' : ''}"></div>`);
  }
  wrap.innerHTML = dots.join('');
}

function startMetronomeTicker() {
  const m = APP.metronome;
  if (!m) return;
  clearTimeout(m.timerId);
  let inCountIn = m.countInLeft > 0;
  const step = () => {
    if (!m.running) return;
    let delay;
    if (inCountIn) {
      const { accent } = advanceMetronome(m);
      AudioEngine.playClick(accent, 0, metronomeClickOpts(m));
      m.countInLeft -= 1;
      if (m.countInLeft <= 0) { inCountIn = false; m.beat = -1; m.subTick = 0; }
      updateMetronomeDots();
      delay = bpmToIntervalMs(m.bpm);
    } else {
      const tick = metronomeTick(m);
      AudioEngine.playClick(tick.accent, 0, metronomeClickOpts(m, !tick.isBeat));
      updateMetronomeDots();
      delay = bpmToTickMs(m.bpm, m.subdivision);
    }
    m.timerId = setTimeout(step, delay);
  };
  step();
}

function startMetronome() {
  const m = APP.metronome;
  if (!m) return;
  AudioEngine.unlock();
  m.beat = -1;
  m.subTick = 0;
  m.countInLeft = m.countIn ? Math.max(0, m.beatsPerBar || 4) : 0;
  m.running = true;
  m.taps = [];
  startMetronomeTicker();
  renderToolWidget();
  updateMetronomeDots();
}

function stopMetronome() {
  const m = APP.metronome;
  if (!m) return;
  clearTimeout(m.timerId);
  m.timerId = null;
  m.running = false;
  m.beat = -1;
  m.subTick = 0;
  m.countInLeft = 0;
}

// ── TUNER RUNTIME ─────────────────────────────────────────────────────
function stopTuner() {
  const t = APP.tuner;
  if (!t) return;
  if (t.frame) cancelAnimationFrame(t.frame);
  if (t.stream) t.stream.getTracks().forEach(tr => tr.stop());
  if (t.ctx && t.ctx.close) t.ctx.close().catch(() => {});
  t.running = false;
  t.frame = null;
  t.stream = null;
  t.ctx = null;
}

function startTuner() {
  if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
    showToast('Microphone not available for tuning.');
    return;
  }
  const Ctx = window.AudioContext || window.webkitAudioContext;
  if (!Ctx) { showToast('Audio analysis not supported here.'); return; }
  stopTuner();
  APP.tuner = { running: true, freq: -1, ctx: null, stream: null, frame: null };
  const t = APP.tuner;
  navigator.mediaDevices.getUserMedia({ audio: true }).then(stream => {
    if (!APP.tuner || !APP.tuner.running) { stream.getTracks().forEach(tr => tr.stop()); return; }
    t.stream = stream;
    t.ctx = new Ctx();
    const source = t.ctx.createMediaStreamSource(stream);
    const analyser = t.ctx.createAnalyser();
    analyser.fftSize = 2048;
    source.connect(analyser);
    const buf = new Float32Array(analyser.fftSize);
    const loop = () => {
      if (!APP.tuner || !APP.tuner.running) return;
      analyser.getFloatTimeDomainData(buf);
      const freq = detectPitch(buf, t.ctx.sampleRate);
      t.freq = freq;
      updateTunerReadout();
      APP.tuner.frame = requestAnimationFrame(loop);
    };
    loop();
  }).catch(() => {
    if (APP.tuner) APP.tuner.running = false;
    showToast('Could not access the microphone.');
    renderToolWidget();
  });
}

function updateTunerReadout() {
  const t = APP.tuner;
  if (!t) return;
  const noteEl = document.getElementById('tuner-note');
  const centsEl = document.getElementById('tuner-cents');
  const needleEl = document.getElementById('tuner-needle');
  if (!noteEl || !centsEl || !needleEl) return;
  const detected = t.freq > 0 ? freqToNoteInfo(t.freq, APP.instrumentId ? getNoteLessons(APP.instrumentId) : []) : null;
  if (!detected) {
    noteEl.textContent = '—';
    centsEl.textContent = 'Listening…';
    needleEl.style.left = '50%';
    return;
  }
  noteEl.textContent = noteDisplayName(detected.note.noteName);
  centsEl.textContent = centsLabel(detected.cents);
  needleEl.style.left = Math.max(0, Math.min(100, 50 + (detected.cents / 50) * 50)) + '%';
}

// ── MUSICXML ──────────────────────────────────────────────────────────
function exportSongMusicXML(inst, lesson) {
  function pitchAttr(n) {
    const step = n.noteName.replace(/[♭♯#b]/g, '').charAt(0);
    const oct = n.octave;
    const acc = n.accidental;
    let xml = `<pitch><step>${step}</step>`;
    if (acc === '♭' || acc === 'b') xml += `<alter>-1</alter>`;
    else if (acc === '♯' || acc === '#') xml += `<alter>1</alter>`;
    xml += `<octave>${oct}</octave></pitch>`;
    return xml;
  }
  // Smallest denominator that turns x into a whole number (within rounding).
  function denominatorOf(x) {
    for (let den = 1; den <= 64; den++) {
      if (Math.abs(x * den - Math.round(x * den)) < 1e-6) return den;
    }
    return 1;
  }
  function gcd(a, b) { return b ? gcd(b, a % b) : a; }
  function lcm(a, b) { return (a / gcd(a, b)) * b; }

  const BEATS_PER_MEASURE = 4;
  const noteIds = lesson.noteIds;
  const durations = getNoteDurations(lesson);
  // Pick divisions so every duration (and every barline split of one) is an
  // integer number of divisions. Songs are whole beats, but imported songs may
  // contain eighths, sixteenths, or triplets.
  const divisions = durations.reduce((acc, d) => lcm(acc, denominatorOf(d)), 1);
  const MEASURE_UNITS = BEATS_PER_MEASURE * divisions;
  const durationUnits = durations.map(d => Math.max(1, Math.round(d * divisions)));

  function typeFor(units) {
    const d = units / divisions;
    if (d >= 4) return 'whole';
    if (d >= 2) return 'half';
    if (d >= 1) return 'quarter';
    if (d >= 0.5) return 'eighth';
    return '16th';
  }

  // The clef written into the file: treble (G2), alto (C3) or bass (F4).
  const clefXml = inst.clef === 'bass' ? '<sign>F</sign><line>4</line>'
    : inst.clef === 'alto' ? '<sign>C</sign><line>3</line>'
    : '<sign>G</sign><line>2</line>';
  const lines = ['<?xml version="1.0" encoding="UTF-8"?>'];
  lines.push('<!DOCTYPE score-partwise PUBLIC "-//Recordare//DTD MusicXML 4.0 Partwise//EN" "http://www.musicxml.org/dtds/partwise.dtd">');
  lines.push('<score-partwise version="4.0">');
  lines.push('  <part-list><score-part id="P1"><part-name>' + escapeXml(lesson.noteName) + '</part-name></score-part></part-list>');
  lines.push('  <part id="P1">');

  let measure = 1, beat = 0; // beat is measured in divisions (units)
  let measureNotes = [];

  function emitNote(mn) {
    lines.push('      <note>');
    if (mn.rest) {
      lines.push('        <rest/>');
    } else {
      if (mn.chord) lines.push('        <chord/>');
      lines.push('        ' + pitchAttr(mn.note));
    }
    lines.push('        <duration>' + mn.units + '</duration>');
    if (mn.tieStart) lines.push('        <tie type="start"/>');
    if (mn.tieStop) lines.push('        <tie type="stop"/>');
    lines.push('        <type>' + typeFor(mn.units) + '</type>');
    if (mn.tieStart || mn.tieStop) {
      let tied = '';
      if (mn.tieStop) tied += '<tied type="stop"/>';
      if (mn.tieStart) tied += '<tied type="start"/>';
      lines.push('        <notations>' + tied + '</notations>');
    }
    lines.push('      </note>');
  }

  function flushMeasure() {
    lines.push('    <measure number="' + measure + '">');
    if (measure === 1) {
      lines.push('      <attributes>');
      lines.push('        <divisions>' + divisions + '</divisions>');
      lines.push('        <key><fifths>0</fifths></key>');
      lines.push('        <time><beats>4</beats><beat-type>4</beat-type></time>');
      lines.push('        <clef>' + clefXml + '</clef>');
      lines.push('      </attributes>');
      if (lesson.bpm) {
        lines.push('      <direction placement="above"><direction-type><metronome><beat-unit>quarter</beat-unit><per-minute>' + lesson.bpm + '</per-minute></metronome></direction-type><sound tempo="' + lesson.bpm + '"/></direction>');
      }
    }
    measureNotes.forEach(emitNote);
    lines.push('    </measure>');
    measureNotes = [];
  }

  for (let i = 0; i < noteIds.length; i++) {
    const n = findLessonById(APP.instrumentId, noteIds[i]);
    if (!n) continue;
    const chordNotes = chordLessonIds(APP.instrumentId, noteIds[i])
      .map(id => findLessonById(APP.instrumentId, id)).filter(Boolean);
    let remaining = durationUnits[i];
    let elapsed = 0;
    // Split any note that crosses a barline, tying the pieces together so the
    // rhythm is preserved instead of overflowing the measure.
    while (remaining > 0) {
      const space = MEASURE_UNITS - beat;
      const seg = Math.min(remaining, space);
      const tieStart = remaining - seg > 0;
      const tieStop = elapsed > 0;
      measureNotes.push({ note: n, units: seg, chord: false, tieStart, tieStop });
      chordNotes.forEach(cn => measureNotes.push({ note: cn, units: seg, chord: true, tieStart, tieStop }));
      beat += seg;
      remaining -= seg;
      elapsed += seg;
      if (beat >= MEASURE_UNITS) {
        flushMeasure();
        measure++;
        beat = 0;
      }
    }
  }
  // A short final measure is padded with a rest so the export stays in 4/4.
  if (measureNotes.length > 0) {
    if (beat > 0) measureNotes.push({ rest: true, units: MEASURE_UNITS - beat });
    flushMeasure();
  }

  lines.push('  </part>');
  lines.push('</score-partwise>');
  return lines.join('\n');
}
function escapeXml(s) {
  return s.replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;').replace(/'/g,'&apos;');
}
function matchNoteToLesson(instrumentId, noteName, octave) {
  const inst = getInstrument(instrumentId);
  // A note is written as a letter plus an octave ("G3"), while MusicXML splits
  // the two apart, so the octave is compared on its own.
  const letterOnly = name => name.replace(/[♭♯#b]/g, '').replace(/[0-9]+$/, '');
  const searchName = letterOnly(noteName.replace(/♭/g,'b').replace(/♯/g,'#'));
  const lesson = inst.lessons.find(l => {
    if (l.type) return false;
    const lName = letterOnly(l.noteName.replace(/♭/g,'b').replace(/♯/g,'#'));
    return lName === searchName && l.octave === octave;
  });
  return lesson ? lesson.id : null;
}
function importSongFromMusicXML(xmlString, instrumentId) {
  const instId = instrumentId || APP.instrumentId;
  const doc = new DOMParser().parseFromString(xmlString, 'text/xml');
  const parseError = doc.querySelector('parsererror');
  if (parseError) throw new Error('Invalid XML: ' + parseError.textContent);
  const partName = doc.querySelector('part-name');
  const title = partName ? partName.textContent.trim() : 'Imported Song';
  const noteEls = doc.querySelectorAll('measure note');
  const divisionsEl = doc.querySelector('attributes divisions');
  const divisions = divisionsEl ? parseFloat(divisionsEl.textContent) || 1 : 1;
  const noteIds = [];
  const durations = [];
  noteEls.forEach(noteEl => {
    if (noteEl.querySelector('chord')) return; // accompaniment is derived, not imported
    if (noteEl.querySelector('rest')) return;
    const step = noteEl.querySelector('pitch step');
    const octave = noteEl.querySelector('pitch octave');
    const alter = noteEl.querySelector('pitch alter');
    if (!step || !octave) return;
    let nn = step.textContent;
    const oct = parseInt(octave.textContent, 10);
    if (alter) {
      const a = parseInt(alter.textContent, 10);
      if (a === -1) nn += 'b';
      else if (a === 1) nn += '#';
    }
    const lessonId = matchNoteToLesson(instId, nn, oct);
    if (!lessonId) return;
    const durEl = noteEl.querySelector('duration');
    const beats = durEl ? (parseFloat(durEl.textContent) || divisions) / divisions : 1;
    // A note split across a barline is exported as tied pieces; glue them back
    // onto the previous note instead of treating each piece as a new note.
    const tieStop = !!noteEl.querySelector('tie[type="stop"]') ||
      !!noteEl.querySelector('tied[type="stop"]');
    if (tieStop && durations.length > 0) {
      durations[durations.length - 1] += beats;
      return;
    }
    noteIds.push(lessonId);
    durations.push(beats);
  });
  if (noteIds.length === 0) throw new Error('No playable notes found in MusicXML');
  const importedId = 'imported-' + Date.now();
  const song = { id: importedId, type: 'song', noteName: title, prerequisiteIds: [], noteIds, durations, prompt: '', description: 'Imported from MusicXML.' };
  const existing = JSON.parse(localStorage.getItem(IMPORTED_SONGS_KEY) || '{}');
  if (!existing[instId]) existing[instId] = [];
  existing[instId].push(song);
  localStorage.setItem(IMPORTED_SONGS_KEY, JSON.stringify(existing));
  return song;
}

// ── EVENT HANDLING ─────────────────────────────────────────────────────
function handleAction(action, el) {
  switch (action) {

    case 'open-settings':
      APP.screen = 'settings';
      render();
      break;

    case 'close-settings':
      APP.screen = 'select';
      render();
      break;

    case 'toggle-language':
      setLang(getLang() === 'pt' ? 'en' : 'pt');
      render();
      break;
    case 'toggle-theme':
      toggleTheme();
      render();
      break;

    case 'save-settings-name': {
      const input = document.getElementById('settings-name-input');
      if (input) {
        const name = input.value.trim();
        if (name) setStudentName(name);
      }
      APP.screen = 'select';
      render();
      break;
    }

    case 'reset-progress': {
      if (!confirm('Reset all progress for all instruments? This cannot be undone.')) return;
      APP.progress = {};
      APP.motivation = { days: {}, badges: {} };
      saveProgress();
      saveMotivation();
      APP.screen = 'select';
      render();
      showToast('Progress reset.');
      break;
    }

    case 'open-report':
      APP.screen = 'report';
      render();
      break;

    case 'close-report':
      APP.screen = 'select';
      render();
      break;

    case 'copy-report': {
      const text = formatReportText(buildPracticeReport(getStudentName()));
      copyText(text).then(ok => showToast(ok ? 'Report copied to clipboard.' : 'Copy failed — try Print instead.'));
      break;
    }

    case 'print-report':
      window.print();
      break;

    case 'open-digest': {
      const m = getMotivation();
      m.digestSeen = getWeekKey();
      saveMotivation();
      APP.screen = 'digest';
      render();
      break;
    }

    case 'dismiss-digest':
      APP.digestDismissed = true;
      render();
      break;

    case 'fingering-key':
      if (el.dataset.key) showFingeringHelp(el.dataset.key);
      break;

    case 'close-fingering-help':
      hideFingeringHelp();
      break;

    case 'close-digest':
      APP.screen = 'select';
      render();
      break;

    case 'copy-digest': {
      const text = formatDigestText(buildWeeklyDigest(getStudentName()));
      copyText(text).then(ok => showToast(ok ? 'Weekly recap copied.' : 'Copy failed — try Print instead.'));
      break;
    }

    case 'print-digest':
      window.print();
      break;

    case 'set-weekly-goal': {
      const g = Number(el.dataset.goal);
      if (g) {
        setWeeklyGoalMinutes(g);
        render();
      }
      break;
    }

    case 'select-instrument': {
      const id = el.dataset.id;
      const inst = getInstrument(id);
      if (!inst.available) { showToast(tFill('{inst} is coming soon!', { inst: t(inst.name) })); return; }
      APP.instrumentId = id;
      setSavedInstrument(id);
      APP.pickingInstrument = false;
      // First time on this instrument? Show the quick app tour before the map.
      if (!getTutorialSeen(id)) {
        APP.tutorialIndex = 0;
        APP.screen = 'tutorial';
      } else {
        APP.screen = 'map';
      }
      render();
      break;
    }

    case 'open-tutorial':
      APP.tutorialIndex = 0;
      APP.screen = 'tutorial';
      render();
      break;

    case 'open-first-sound':
      APP.screen = 'first-sound';
      render();
      break;

    case 'close-first-sound':
      APP.screen = 'map';
      render();
      break;

    case 'first-sound-done':
      markFirstSoundSeen(APP.instrumentId);
      APP.screen = 'map';
      render();
      break;

    case 'first-sound-hear': {
      const inst = getInstrument(APP.instrumentId);
      const note = getNoteLessons(APP.instrumentId)[0];
      if (note) AudioEngine.playInstrumentNote(note.freq, inst.fingeringType, 1.2, inst.id);
      break;
    }

    case 'open-lookup':
      APP.lookupReturn = APP.screen === 'lesson' ? 'map' : APP.screen;
      APP.screen = 'lookup';
      render();
      break;

    case 'close-lookup':
      APP.screen = APP.lookupReturn === 'practice' ? 'practice' : 'map';
      render();
      break;

    case 'lookup-select':
      APP.lookupId = el.dataset.id;
      render();
      break;

    case 'lookup-hear': {
      const inst = getInstrument(APP.instrumentId);
      const notes = getNoteLessons(APP.instrumentId);
      const note = notes.find(l => l.id === APP.lookupId) || notes[0];
      if (note) AudioEngine.playInstrumentNote(note.freq, inst.fingeringType, 1.1, inst.id);
      break;
    }

    case 'tutorial-next': {
      const slides = buildTutorialSlides(getInstrument(APP.instrumentId));
      if (APP.tutorialIndex >= slides.length - 1) {
        markTutorialSeen(APP.instrumentId);
        APP.screen = 'map';
      } else {
        APP.tutorialIndex += 1;
      }
      render();
      break;
    }

    case 'tutorial-back':
      APP.tutorialIndex = Math.max((APP.tutorialIndex || 0) - 1, 0);
      render();
      break;

    case 'tutorial-finish':
      markTutorialSeen(APP.instrumentId);
      APP.screen = 'map';
      render();
      break;

    case 'switch-instrument':
      APP.pickingInstrument = true;
      render();
      break;

    case 'cancel-instrument-pick':
      APP.pickingInstrument = false;
      render();
      break;

    case 'go-select':
      stopAudioPlayback();
      stopEarPlayback();
      stopPlaySequence();
      endSession();
      cleanupRecording();
      clearInterval(APP.sprintTimer);
      APP.sprintTimer = null;
      APP.sprint = null;
      APP.pickingInstrument = false;
      APP.screen = 'select';
      render();
      break;

    case 'open-lesson': {
      const idx = parseInt(el.dataset.index, 10);
      APP.lessonIndex = idx;
      const lesson = getLesson(APP.instrumentId, idx);
      APP.play = { running: false, hasPlayed: false };
      APP.quizQueue = [];
      APP.quizIndex = 0;
      startSession();

      if (isSongLesson(lesson)) {
        APP.phase = 'present';
        APP.quiz = null;
        APP.songNoteIndex = 0;
      } else if (isReviewLesson(lesson)) {
        const inst = getInstrument(APP.instrumentId);
        APP.phase = 'quiz';
        APP.reviewQueue = shuffle(lesson.reviewLessonIds);
        APP.reviewIndex = 0;
        APP.reviewCorrect = 0;
        APP.reviewTotal = lesson.reviewLessonIds.length;
        APP.quiz = buildReviewQuiz(inst, APP.reviewQueue[0]);
      } else {
        APP.phase = 'present';
        APP.quiz = null;
      }

      APP.screen = 'lesson';
      render();
      break;
    }

    case 'locked-node':
      showToast('Finish the previous note first.');
      break;

    case 'plan-start': {
      const item = getTodayPlan(APP.instrumentId).items.find(i => i.id === el.dataset.item);
      if (!item) return;
      if (item.type === 'sprint') { startSprint(item.mode); break; }
      const idx = CURRICULUM[APP.instrumentId].lessons
        .indexOf(findLessonById(APP.instrumentId, item.targetId));
      if (idx < 0) return;
      handleAction('open-lesson', { dataset: { index: String(idx) } });
      break;
    }

    case 'open-practice':
      APP.sprint = null;
      startSession();
      APP.screen = 'practice';
      render();
      break;

    case 'close-practice':
      endSession();
      APP.sprint = null;
      APP.screen = 'map';
      render();
      break;

    case 'start-sprint':
      startSprint(el.dataset.mode);
      break;

    case 'open-ear': {
      if (getLearnedNotes(APP.instrumentId).length < 2) {
        showToast('Learn two notes to unlock ear training.');
        break;
      }
      startEarRound(APP.instrumentId);
      startSession();
      APP.screen = 'ear';
      render();
      playEarPhrase();
      break;
    }

    case 'close-ear':
      stopEarPlayback();
      endSession();
      APP.ear = null;
      APP.screen = 'practice';
      render();
      break;

    case 'ear-play':
      playEarPhrase();
      break;

    case 'ear-pick': {
      const e = APP.ear;
      if (!e || e.finished) break;
      submitEarPick(APP.instrumentId, el.dataset.id);
      render();
      if (APP.ear && APP.ear.finished && APP.ear.graded && earScore(APP.ear.graded) === APP.ear.phrase.length) {
        showToast('\u{1F442} Golden ear! Perfect echo.');
      }
      break;
    }

    case 'ear-new':
      stopEarPlayback();
      startEarRound(APP.instrumentId);
      render();
      playEarPhrase();
      break;

    case 'toggle-tools':
      APP.toolsOpen = !APP.toolsOpen;
      if (!APP.toolsOpen) { stopMetronome(); stopTuner(); }
      renderToolWidget();
      break;

    case 'close-tools':
      APP.toolsOpen = false;
      stopMetronome();
      stopTuner();
      renderToolWidget();
      break;

    case 'tools-tab':
      APP.toolTab = el.dataset.tab === 'tuner' ? 'tuner' : 'metronome';
      APP.toolsOpen = true;
      if (APP.toolTab === 'tuner') stopMetronome();
      else stopTuner();
      renderToolWidget();
      break;

    case 'metronome-toggle':
      if (APP.metronome && APP.metronome.running) { stopMetronome(); renderToolWidget(); }
      else startMetronome();
      break;

    case 'metronome-bpm': {
      const m = APP.metronome;
      if (!m) break;
      m.bpm = clampBpm(m.bpm + parseInt(el.dataset.delta, 10));
      if (m.running) startMetronomeTicker();
      renderToolWidget();
      break;
    }

    case 'metronome-tap': {
      const m = APP.metronome;
      if (!m) break;
      m.taps.push(Date.now());
      if (m.taps.length > 8) m.taps.shift();
      const bpm = tapTempo(m.taps);
      if (bpm) {
        m.bpm = bpm;
        if (m.running) startMetronomeTicker();
        renderToolWidget();
      }
      break;
    }

    case 'metronome-countin': {
      const m = APP.metronome;
      if (!m) break;
      m.countIn = !m.countIn;
      renderToolWidget();
      break;
    }

    case 'song-speed-down':
    case 'song-speed-up': {
      const delta = action === 'song-speed-up' ? SPEED_STEP : -SPEED_STEP;
      APP.songSpeed = clampSpeed(APP.songSpeed + delta);
      setSavedSpeed(APP.songSpeed);
      render();
      break;
    }

    case 'tuner-toggle':
      if (APP.tuner && APP.tuner.running) { stopTuner(); renderToolWidget(); }
      else { startTuner(); renderToolWidget(); }
      break;


    case 'sprint-answer': {
      const s = APP.sprint;
      if (!s || s.finished) return;
      const id = el.dataset.id;
      const opt = s.question.options.find(o => o.id === id);
      if (opt && sprintOptionIsCorrect(s, opt)) {
        recordSkill(APP.instrumentId, s.question.correctId, true);
        s.score++;
        s.question = buildSprintQuestion(APP.instrumentId, s.mode);
      } else {
        if (!s.question.wrongId) recordSkill(APP.instrumentId, s.question.correctId, false);
        s.question.wrongId = id;
      }
      render();
      break;
    }

    case 'sprint-again':
      startSprint(APP.sprint ? APP.sprint.mode : SPRINT_MODES.SIGHT);
      break;

    case 'exit-sprint':
      clearInterval(APP.sprintTimer);
      APP.sprintTimer = null;
      APP.sprint = null;
      evaluateBadges({ toast: true });
      render();
      break;

    case 'song-next': {
      APP.songNoteIndex = Math.min(APP.songNoteIndex + 1, getLesson(APP.instrumentId, APP.lessonIndex).noteIds.length - 1);
      render();
      break;
    }

    case 'song-prev': {
      APP.songNoteIndex = Math.max(APP.songNoteIndex - 1, 0);
      render();
      break;
    }

    case 'play-melody': {
      AudioEngine.unlock();
      const inst = getInstrument(APP.instrumentId);
      const lesson = getLesson(APP.instrumentId, APP.lessonIndex);
      runSongSequence(inst, lesson);
      break;
    }

    case 'play-song-audio-start': {
      const inst = getInstrument(APP.instrumentId);
      const lesson = getLesson(APP.instrumentId, APP.lessonIndex);
      const body = document.querySelector('.lesson-body');
      if (body) {
        body.innerHTML = translateHtml(renderSongAudioPlayerContent(inst, lesson));
        startSongAudioPlayback(inst, lesson);
      }
      break;
    }

    case 'back-to-present': {
      stopAudioPlayback();
      stopPlaySequence();
      APP.songNoteIndex = 0;
      const _bl = getLesson(APP.instrumentId, APP.lessonIndex);
      APP.phase = isReviewLesson(_bl) ? 'quiz' : 'present';
      render();
      break;
    }

    case 'exit-lesson':
      stopAudioPlayback();
      stopPlaySequence();
          endSession();
      cleanupRecording();
      APP.reviewQueue = null;
      APP.reviewIndex = 0;
      APP.reviewCorrect = 0;
      APP.reviewTotal = 0;
      APP.songNoteIndex = 0;
      APP.importedSong = null;
      APP.screen = 'map';
      render();
      break;

    case 'hear-note': {
      const inst = getInstrument(APP.instrumentId);
      const lesson = getLesson(APP.instrumentId, APP.lessonIndex);
      if (isSongLesson(lesson)) {
        const note = getResolvedSongNote(APP.instrumentId, lesson);
        const chordFreqs = getChordFrequencies(APP.instrumentId, lesson, APP.songNoteIndex);
        if (chordFreqs.length > 0) {
          AudioEngine.playChord(chordFreqs, inst.fingeringType, 1.1, inst.id);
        }
        AudioEngine.playInstrumentNote(note.freq, inst.fingeringType, 1.1, inst.id);
      } else {
        AudioEngine.playInstrumentNote(lesson.freq, inst.fingeringType, 1.1, inst.id);
      }
      break;
    }

    case 'goto-quiz':
      stopAudioPlayback();
      APP.phase = 'quiz';
      APP.quiz = null;
      render();
      break;

    case 'quiz-answer': {
      const tappedId = el.dataset.id;
      const q = APP.quiz;
      if (q.answeredCorrectly || q.wrongIds.includes(tappedId)) return;
      const tappedOpt = q.options.find(o => o.id === tappedId);
      if (tappedOpt && quizOptionIsCorrect(q, tappedOpt)) {
        q.answeredCorrectly = true;
        addNoteMastery(APP.instrumentId, q.correctId);
        recordSkill(APP.instrumentId, q.correctId, true);
      } else {
        if (q.wrongIds.length === 0) recordSkill(APP.instrumentId, q.correctId, false);
        q.wrongIds.push(tappedId);
      }
      render();
      break;
    }

    case 'goto-play': {
      const lesson = getLesson(APP.instrumentId, APP.lessonIndex);
      // ── Song: track mastery and go to complete ────────────────────
      if (isSongLesson(lesson)) {
        const q = APP.quiz;
        const mistakes = q ? q.wrongIds.length : 0;
        const stars = mistakes === 0 ? 3 : (mistakes <= 2 ? 2 : 1);
        const xp = 10 + (stars * 5);
        APP.lastStars = stars;
        APP.lastXp = xp;
        const prog = getInstrumentProgress(APP.instrumentId);
        const prevStars = prog.completed[lesson.id] ? prog.completed[lesson.id].stars : 0;
        APP.completedBefore = !!prog.completed[lesson.id];
        prog.completed[lesson.id] = { stars: Math.max(stars, prevStars) };
        prog.xp += xp;
        saveProgress();
        markPlanItemDone(APP.instrumentId, 'song', lesson.id);
        APP.phase = 'complete';
        render();
        return;
      }
      // ── Review session: advance to next note or show summary ──────
      if (isReviewLesson(lesson)) {
        const q = APP.quiz;
        if (q && q.wrongIds.length === 0) APP.reviewCorrect++;
        APP.reviewIndex++;
        if (APP.reviewIndex >= APP.reviewTotal) {
          const totalMistakes = APP.reviewTotal - APP.reviewCorrect;
          APP.lastStars = totalMistakes === 0 ? 3 : (totalMistakes <= 1 ? 2 : 1);
          APP.lastXp = 10 + (APP.lastStars * 5);
          const prog = getInstrumentProgress(APP.instrumentId);
          const prevStars = prog.completed[lesson.id] ? prog.completed[lesson.id].stars : 0;
          prog.completed[lesson.id] = { stars: Math.max(APP.lastStars, prevStars) };
          prog.xp += APP.lastXp;
          saveProgress();
          APP.phase = 'complete';
        } else {
          const inst = getInstrument(APP.instrumentId);
          APP.quiz = buildReviewQuiz(inst, APP.reviewQueue[APP.reviewIndex]);
          APP.phase = 'quiz';
        }
        render();
        return;
      }
      // ── Regular note lesson: step through the mixed quiz set ──────
      if (APP.quizIndex < APP.quizQueue.length - 1) {
        APP.quizIndex++;
        APP.quiz = APP.quizQueue[APP.quizIndex];
        APP.phase = 'quiz';
        render();
        return;
      }
      APP.phase = 'play';
      APP.play = { running: false, hasPlayed: false };
      render();
      break;
    }

    case 'play-start': {
      AudioEngine.unlock();
      const inst = getInstrument(APP.instrumentId);
      const lesson = getLesson(APP.instrumentId, APP.lessonIndex);
      runPlaySequence(inst, lesson);
      break;
    }

    case 'record-toggle':
      if (APP.recorder) stopRecording();
      else startRecording();
      break;

    case 'play-recording':
      playRecording();
      break;

    case 'discard-recording':
      cleanupRecording();
      render();
      break;

    case 'play-confirm': {
          const mistakes = (APP.quizQueue || []).reduce((sum, item) => sum + item.wrongIds.length, 0);
      const stars = mistakes === 0 ? 3 : (mistakes <= 2 ? 2 : 1);
      const xp = 10 + (stars * 5);
      APP.lastStars = stars;
      APP.lastXp = xp;

      const prog = getInstrumentProgress(APP.instrumentId);
      const lesson = getLesson(APP.instrumentId, APP.lessonIndex);
      const prevStars = prog.completed[lesson.id] ? prog.completed[lesson.id].stars : 0;
      APP.completedBefore = !!prog.completed[lesson.id];
      prog.completed[lesson.id] = { stars: Math.max(stars, prevStars) };
      prog.xp += xp;
      saveProgress();
      markPlanItemDone(APP.instrumentId, 'note', lesson.id);

      APP.phase = 'complete';
      render();
      break;
    }

    case 'export-musicxml': {
      const inst = getInstrument(APP.instrumentId);
      const lesson = getLesson(APP.instrumentId, APP.lessonIndex);
      const xml = exportSongMusicXML(inst, lesson);
      const blob = new Blob([xml], { type: 'application/xml' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = (lesson.noteName || 'song').replace(/[^a-zA-Z0-9]+/g, '-') + '.musicxml';
      a.click();
      URL.revokeObjectURL(url);
      break;
    }
    case 'import-song': {
      document.getElementById('import-file-input').click();
      break;
    }
    case 'import-file-chosen': {
      // Handled by the change event listener below
      break;
    }
    case 'open-imported-song': {
      stopAudioPlayback();
      startSession();
      const idx = parseInt(el.dataset.importedIndex, 10);
      const allImported = JSON.parse(localStorage.getItem(IMPORTED_SONGS_KEY) || '{}');
      const songs = allImported[APP.instrumentId] || [];
      const song = songs[idx];
      if (!song) { showToast('Song not found.'); break; }
      APP.importedSong = song;
      APP.lessonIndex = -1;
      APP.phase = 'present';
      APP.songNoteIndex = 0;
      APP.quiz = null;
      APP.screen = 'lesson';
      render();
      break;
    }
    case 'delete-imported-song': {
      const idx = parseInt(el.dataset.importedIndex, 10);
      const allImported = JSON.parse(localStorage.getItem(IMPORTED_SONGS_KEY) || '{}');
      const songs = allImported[APP.instrumentId] || [];
      const removed = songs[idx];
      songs.splice(idx, 1);
      allImported[APP.instrumentId] = songs;
      localStorage.setItem(IMPORTED_SONGS_KEY, JSON.stringify(allImported));
      // Drop any saved progress for the deleted song so it doesn't linger in
      // localStorage (or inflate completion counts if the id is ever reused).
      if (removed) {
        const prog = APP.progress[APP.instrumentId];
        if (prog && prog.completed) delete prog.completed[removed.id];
        if (prog && prog.mastery) delete prog.mastery[removed.id];
        saveProgress();
      }
      render();
      break;
    }
    case 'finish-lesson':
      stopAudioPlayback();
          endSession();
      cleanupRecording();
      APP.reviewQueue = null;
      APP.reviewIndex = 0;
      APP.reviewCorrect = 0;
      APP.reviewTotal = 0;
      APP.quizQueue = [];
      APP.quizIndex = 0;
      APP.songNoteIndex = 0;
      APP.importedSong = null;
      APP.screen = 'map';
      render();
      break;
  }
}

document.addEventListener('click', (e) => {
  const el = e.target.closest('[data-action]');
  if (!el || el.hasAttribute('disabled')) return;
  handleAction(el.dataset.action, el);
});

document.addEventListener('change', (e) => {
  const input = e.target;
  if (!input || !input.id) return;
  const m = APP.metronome;
  if (m && input.id === 'metronome-volume') {
    m.volume = Math.max(0, Math.min(1, Number(input.value) / 100));
    return;
  }
  if (m && input.id === 'tool-preset') {
    if (input.value) {
      m.bpm = clampBpm(parseInt(input.value, 10));
      if (m.running) startMetronomeTicker();
    }
    renderToolWidget();
    return;
  }
  if (m && input.id === 'tool-timesig') {
    m.beatsPerBar = parseInt(input.value, 10) || 4;
    m.beat = -1;
    m.subTick = 0;
    if (m.running) startMetronomeTicker();
    renderToolWidget();
    return;
  }
  if (m && input.id === 'tool-subdivision') {
    m.subdivision = parseInt(input.value, 10) || 1;
    m.subTick = 0;
    if (m.running) startMetronomeTicker();
    renderToolWidget();
    return;
  }
  if (m && input.id === 'tool-sound') {
    m.sound = input.value || 'click';
    if (m.running) AudioEngine.playClick(false, 0, metronomeClickOpts(m));
    renderToolWidget();
    return;
  }
  if (input.id !== 'import-file-input' || !input.files || !input.files[0]) return;
  const file = input.files[0];
  const capturedInstrumentId = APP.instrumentId;
  const reader = new FileReader();
  reader.onload = () => {
    try {
      const song = importSongFromMusicXML(reader.result, capturedInstrumentId);
      showToast(tFill('Imported "{name}"', { name: song.noteName }));
      render();
    } catch (err) {
      showToast(t('Import error: ') + err.message);
    }
  };
  reader.onerror = () => showToast('Error reading file.');
  reader.readAsText(file);
  input.value = '';
});

// ── INIT ───────────────────────────────────────────────────────────────
applyTheme(getTheme());
initLang();
loadProgress();
loadMotivation();
if (!getStudentName()) showNamePrompt();
render();
maybeRemindDigest();
