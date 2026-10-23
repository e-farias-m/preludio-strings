// test-app.js
// Loads js/app.js in a stubbed browser environment and checks app-level
// behaviour that is otherwise only reachable through the UI.

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
  // Mirror the DOM contract used by escapeHtml(): writing textContent makes the
  // same string readable back through innerHTML.
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

// Controllable microphone/recorder stubs for the record-and-compare feature.
const fakeTracks = [];
const fakeStream = { getTracks: () => fakeTracks };
const navigator = { mediaDevices: { getUserMedia: () => Promise.resolve(fakeStream) } };
let revoked = [];
class FakeMediaRecorder {
  constructor(stream) { this.stream = stream; this.state = 'inactive'; this.mimeType = 'audio/webm'; FakeMediaRecorder.instance = this; }
  start() { this.state = 'recording'; }
  stop() { this.state = 'inactive'; if (this.onstop) this.onstop(); }
}
const URL = { createObjectURL: () => 'blob:fake', revokeObjectURL: (u) => revoked.push(u) };
const Blob = class { constructor(chunks, opts) { this.chunks = chunks; this.opts = opts; } };
const Audio = class { constructor(src) { this.src = src; Audio.last = this; } play() { return Promise.resolve(); } };

const sandbox = new Function('document', 'localStorage', 'window', 'navigator', 'MediaRecorder', 'URL', 'Blob', 'Audio', `
${read('curriculum.js')}
${read('graphics.js')}
${read('i18n.js')}
${read('app.js')}
return { handleAction, renderCompletePhase, CURRICULUM, APP, IMPORTED_SONGS_KEY,
  buildSprintQuestion, getSprintBest, setSprintBest, finishSprint, startSprint,
  renderPracticeScreen, getLearnedNotes, SPRINT_MODES,
  buildNoteQuizQueue, buildQuizOptions, buildReviewQuiz, renderQuizPhase,
  listenFeedback, listenEnabled, advanceListen,
  getMotivation, addPracticeSeconds, getTotalPracticeSeconds, getCurrentStreak,
  getTotalXp, getLevel, getAvatar, getStats, evaluateBadges, hasBadge, todayKey,
  endSession, renderStudentCard, renderBadgeShelf, renderSelectScreen, BADGES,
  canRecord, startRecording, stopRecording, playRecording, cleanupRecording, renderPlayPhase,
  getSkill, recordSkill, noteWeakness, generatePlan, getTodayPlan, markPlanItemDone,
  isPlanComplete, renderPlanCard, getNoteAccuracy, getWeakestNotes, pickWeightedNote,
  renderWeakSpots, earPhraseLength, buildEarPhrase, gradeEarResponse, earScore,
  startEarRound, submitEarPick, finishEarRound, renderEarScreen,
  clampBpm, bpmToIntervalMs, createMetronome, advanceMetronome, tapTempo,
  bpmToTickMs, metronomeTick, metronomeClickOpts, METRONOME_SUBDIVISIONS,
  TEMPO_PRESETS, METRONOME_SOUNDS, METRONOME_DEFAULT_VOLUME,
  detectPitch, freqToNoteInfo, centsLabel, getNoteLessons, TIME_SIGNATURES,
  renderMetronomePanel, renderTunerPanel, renderToolWidget,
  getInstrumentReport, buildPracticeReport, formatReportText, renderReportScreen,
  getWeekStart, getWeekKey, getWeekDays, buildWeeklyDigest, formatDigestText,
  renderDigestCard, renderDigestScreen, DEFAULT_WEEKLY_GOAL, WEEKLY_GOAL_OPTIONS,
  getWeeklyGoalMinutes, setWeeklyGoalMinutes, shouldRemindDigest, markDigestReminded,
  maybeRemindDigest, getTheme, setTheme, applyTheme, toggleTheme, instAccent, Graphics,
  getSavedInstrument, setSavedInstrument, clearSavedInstrument, renderFocusCard, renderInstrumentGrid,
  showFingeringHelp, hideFingeringHelp, FINGERING_HELP,
  renderFirstSoundScreen, renderLookupScreen, getFirstSoundSeen, markFirstSoundSeen,
  FIRST_SOUND_CONTENT, renderSongPresentPhase,
  clampSpeed, msPerBeatAt, renderSongSpeedControl, songSpeedLabelText,
  getTutorialSeen, markTutorialSeen, buildTutorialSlides, renderTutorialScreen, renderMapScreen,
  setLang, getLang, t, tFill, lessonText, renderPresentPhase };
`);
const api = sandbox(document, localStorage, {}, navigator, FakeMediaRecorder, URL, Blob, Audio);

let pass = 0;
let fail = 0;
const failures = [];
function check(cond, msg) {
  if (cond) { pass++; } else { fail++; failures.push(msg); }
}

const violin = api.CURRICULUM.violin;
api.APP.instrumentId = 'violin';

// ── 1. Song completion hides the per-note mastery badge ────────────────────
{
  const song = violin.lessons.find(l => l.type === 'song');
  api.APP.lastStars = 3;
  api.APP.lastXp = 25;
  api.APP.completedBefore = false;
  const songHtml = api.renderCompletePhase(violin, song);
  check(songHtml.includes('Song complete!'), 'song completion should say "Song complete!"');
  check(!songHtml.includes('correct'),
    'song completion should NOT show a per-note mastery badge');

  const note = violin.lessons.find(l => !l.type);
  const noteHtml = api.renderCompletePhase(violin, note);
  check(noteHtml.includes('correct'),
    'note completion should still show the mastery badge');
}

// ── 1b. Review quizzes can include songs without crashing ──────────────────
{
  // Reviews list songs alongside notes. A song has no fingering of its own, so
  // the review must fall back to one of the song's notes, not crash.
  const review = violin.lessons.find(l => l.id === 'vl-review-review-1');
  check(review.reviewLessonIds.includes('vl-1') && review.reviewLessonIds.includes('vl-7'),
    'review 1 should cover the first seven notes');

  // A review can also point at a song, which has no fingering of its own: the
  // quiz must fall back to one of the song's notes instead of crashing.
  const songId = violin.lessons.find(l => l.type === 'song').id;
  check(!!songId, 'the violin should have a practice song');
  const quiz = api.buildReviewQuiz(violin, songId);
  check(quiz && quiz.prompt && quiz.prompt.fingeringState &&
    quiz.prompt.fingeringState.string >= 1 && quiz.prompt.fingeringState.finger >= 0,
    'a song in a review should build a real note quiz, not crash');
  check(!violin.lessons.some(l => l.id === quiz.prompt.id && l.type === 'song'),
    'the review song quiz should ask about a note, not the song itself');

  // The practice songs sit immediately after the first two note lessons.
  check(violin.lessons[0].id === 'vl-1' && violin.lessons[1].type === 'song' &&
    violin.lessons[1].noteName === 'My First Note',
    'violin should have a practice song right after note 1');
  check(violin.lessons[2].id === 'vl-2' && violin.lessons[3].type === 'song' &&
    violin.lessons[3].noteName === 'Two Open Strings',
    'violin should have a practice song right after note 2');
}

// ── 1c. Listen & match pitch feedback (prototype) ──────────────────────────
{
  const target = 196; // the violin's first note, the open G string
  const hz = centsOff => target * Math.pow(2, centsOff / 1200);

  check(api.listenFeedback(target, -1).state === 'listening',
    'no signal should read as listening');
  check(api.listenFeedback(target, hz(20)).state === 'match',
    'a near-perfect pitch should match');
  check(api.listenFeedback(target, hz(-20)).state === 'match',
    'a slightly flat pitch should still match');
  check(api.listenFeedback(target, hz(75)).state === 'close',
    'a pitch just outside the match window should read as close');
  check(api.listenFeedback(target, hz(1200)).state === 'octave',
    'the same note an octave up should read as octave, not a match');
  check(api.listenFeedback(target, hz(250)).state === 'off',
    'a different note should read as off');

  // Hold-to-win: a steady match scores one hit, and the pitch must drop before
  // the same note can score again (so a held tone is one deliberate win).
  const match = { state: 'match' };
  const off = { state: 'off' };
  let s = { hold: 0, armed: true, hits: 0 };
  for (let i = 0; i < 21; i++) s = api.advanceListen(s, match);
  check(s.hits === 0, 'a brief blip should not score a hit yet');
  s = api.advanceListen(s, match);
  check(s.hits === 1, 'holding the right pitch registers exactly one hit');
  check(s.armed === false, 'a hit disarms the meter until the pitch drops');
  for (let i = 0; i < 40; i++) s = api.advanceListen(s, match);
  check(s.hits === 1, 'holding longer does not rack up extra hits');
  s = api.advanceListen(s, off);
  check(s.armed === true && s.hold === 0, 'dropping the pitch re-arms the meter');
  for (let i = 0; i < 22; i++) s = api.advanceListen(s, match);
  check(s.hits === 2, 'a second held note registers a second hit');

  // Listen mode is available on every string instrument.
  check(api.listenEnabled('violin') === true, 'listen mode is enabled for the violin');
  check(api.listenEnabled('viola') === true, 'listen mode is enabled for the viola');
  check(api.listenEnabled('cello') === true, 'listen mode is enabled for the cello');
  check(api.listenEnabled('trumpet') === false, 'listen mode is off for instruments this app does not teach');

  // The play phase shows the microphone panel where listen mode is on.
  const cello = api.CURRICULUM.cello;
  const celloNote = cello.lessons.find(l => !l.type);
  api.APP.instrumentId = 'violin';
  api.APP.listen = null;
  const violinHtml = api.renderPlayPhase(violin, violin.lessons.find(l => !l.type));
  check(violinHtml.includes('listen-toggle') && violinHtml.includes('Listen &amp; match'),
    'violin play phase should offer the listen panel');

  api.APP.instrumentId = 'cello';
  const celloPlayHtml = api.renderPlayPhase(cello, celloNote);
  check(celloPlayHtml.includes('listen-toggle'),
    'every string instrument offers the listen panel');

  // While listening is active the panel shows the live readout and hit meter.
  api.APP.instrumentId = 'violin';
  api.APP.listen = { running: true, state: 'match', cents: 10, hits: 2, done: false, freq: 233 };
  const liveHtml = api.renderPlayPhase(cello, celloNote);
  check(liveHtml.includes('listen-card') && liveHtml.includes('listen-meter') &&
    liveHtml.includes('listen-detected'),
    'active listening should show the readout and hit meter');
  api.APP.listen = null;
  api.APP.instrumentId = 'violin';
}

// ── 1d. First-sound guide ──────────────────────────────────────────────────
{
  // Every instrument maps to a family that has first-sound content.
  for (const inst of Object.values(api.CURRICULUM)) {
    const content = api.FIRST_SOUND_CONTENT[inst.family];
    check(!!content, `${inst.id} (family ${inst.family}) must have first-sound content`);
    if (content) {
      check(content.steps.length >= 3 && typeof content.tip === 'string' && content.tip.length > 0,
        `${inst.id} first-sound content needs several steps and a tip`);
    }
  }

  api.APP.instrumentId = 'violin';
  const violinHtml = api.renderFirstSoundScreen();
  check(violinHtml.includes('Make your first sound') && violinHtml.includes('first-sound-step'),
    'violin should show the bow-and-string guide');
  check(!violinHtml.includes('Make your first buzz') && !violinHtml.includes('buzz'),
    'the strings guide must not use the brass buzzing instructions');
  check(violinHtml.includes('bow'), 'the strings guide talks about the bow');

  api.APP.instrumentId = 'cello';
  const celloHtml = api.renderFirstSoundScreen();
  check(celloHtml.includes('Make your first sound') && celloHtml.includes('first-sound-step'),
    'cello should show the same bow-and-string guide');

  // The map offers the guide, and opening/completing it remembers the visit.
  api.APP.instrumentId = 'violin';
  check(!api.getFirstSoundSeen('violin'), 'violin first-sound starts unseen');
  api.handleAction('open-first-sound', { dataset: {} });
  check(api.APP.screen === 'first-sound', 'open-first-sound shows the guide');

  const beforeHtml = api.renderFirstSoundScreen();
  check(beforeHtml.includes("Got it"), 'an unseen guide invites the student to start');

  api.handleAction('first-sound-done', { dataset: {} });
  check(api.APP.screen === 'map', 'finishing the guide returns to the map');
  check(api.getFirstSoundSeen('violin') === true, 'finishing the guide marks it seen');
  check(api.getFirstSoundSeen('cello') === false, 'the visit is remembered per instrument');

  const afterHtml = api.renderFirstSoundScreen();
  check(afterHtml.includes('Back to my path'), 'a seen guide offers to return');

  const mapHtml = api.renderMapScreen();
  check(mapHtml.includes('data-action="open-first-sound"'),
    'the map links to the first-sound guide');
}

// ── 1e. Fingering chart (note lookup) ──────────────────────────────────────
{
  api.APP.instrumentId = 'violin';
  const notes = api.getNoteLessons('violin');
  api.APP.lookupId = null;

  const html = api.renderLookupScreen();
  for (const note of notes) {
    check(html.includes(`data-id="${note.id}"`), `chart should list ${note.noteName} (${note.id})`);
  }
  check(html.includes('lookup-card') && html.includes('lookup-hear'),
    'the chart shows selectable cards and a hear button');
  check(html.includes('lookup-legend'), 'a strings chart explains its finger numbers');
  check(html.includes('1st finger') && html.includes('Open string'),
    'the legend explains the fingers and the open string');
  check(html.includes(`data-id="${notes[0].id}"`) && html.includes('lookup-card-active'),
    'the chart defaults to the first note');

  // Selecting a note switches the big diagram and remembers the choice.
  api.handleAction('lookup-select', { dataset: { id: notes[2].id } });
  check(api.APP.lookupId === notes[2].id, 'tapping a card selects that note');
  const selectedHtml = api.renderLookupScreen();
  check(selectedHtml.includes('lookup-card-active') &&
    selectedHtml.includes(`${notes[2].noteName}</div>`),
    'the selected note is highlighted and shown in the detail');

  // Opening from the map returns to the map; brass has no woodwind legend.
  api.APP.screen = 'map';
  api.handleAction('open-lookup', { dataset: {} });
  check(api.APP.screen === 'lookup', 'open-lookup shows the chart');
  api.handleAction('lookup-select', { dataset: { id: notes[1].id } });
  check(api.APP.lookupId === notes[1].id, 'selecting a note updates the chart');
  api.handleAction('close-lookup', { dataset: {} });
  check(api.APP.screen === 'map', 'closing the chart returns to the map');

  api.APP.instrumentId = 'cello';
  api.APP.lookupId = null;
  const celloChart = api.renderLookupScreen();
  check(celloChart.includes('lookup-legend'),
    'every string instrument gets a finger-number legend');
  check(celloChart.includes('Cello') || celloChart.includes('cello'),
    'the chart belongs to the cello');
  api.APP.instrumentId = 'violin';
}

// ── 1f. Song step-through shows the whole melody as sheet music ────────────
{
  api.APP.instrumentId = 'violin';
  const song = violin.lessons.find(l => l.id === 'vl-song-hot-cross-buns');
  api.APP.songNoteIndex = 0;
  const html = api.renderSongPresentPhase(violin, song);

  check(html.includes('song-melody-wrap'), 'the song screen shows a sheet-music panel');
  const melody = (html.match(/song-melody-svg">([\s\S]*?)<\/div>/) || [])[1] || '';
  const heads = (melody.match(/<ellipse/g) || []).length;
  check(heads === song.noteIds.length,
    `the whole melody is drawn (expected ${song.noteIds.length} noteheads, got ${heads})`);
  check(html.includes('Sheet music'), 'the melody panel is labelled');
  check((melody.match(/class="clef clef-treble"/g) || []).length >= 2, 'a long melody wraps onto more than one staff');

  // Advancing the song moves the highlight (accent colour) to the next note.
  api.APP.songNoteIndex = 3;
  const later = api.renderSongPresentPhase(violin, song);
  check(later.includes('Note 4 of ' + song.noteIds.length), 'the step counter advances');
  check((later.match(/opacity="0.18"/g) || []).length === 1, 'exactly one note is highlighted at a time');
}

// ── 1g. The app speaks Brazilian Portuguese ────────────────────────────────
{
  api.setLang('pt');
  check(api.getLang() === 'pt', 'the app switches to Portuguese');

  api.APP.instrumentId = 'violin';
  api.APP.lookupId = null;

  // The first-sound guide is fully translated.
  const guide = api.renderFirstSoundScreen();
  check(guide.includes('Faça o seu primeiro som'), 'the guide title is translated');
  check(!guide.includes('Make your first sound'), 'no English left in the guide title');
  check(!guide.includes('Hold the instrument on your left shoulder'),
    'the guide steps are translated');
  check(guide.includes('Apoie o instrumento no seu ombro esquerdo'),
    'the guide steps show the Portuguese text');
  check(!guide.includes('Scratching? Move the bow closer'),
    'the guide tip is translated');
  check(guide.includes('Dica'), 'the tip label is translated');

  // The fingering legend is translated.
  const lookup = api.renderLookupScreen();
  check(lookup.includes('Cartão de dedos') || lookup.includes('lookup-legend'),
    'the fingering chart renders');
  check(!lookup.includes('Your index finger'), 'the legend text is translated');
  check(lookup.includes('Seu dedo indicador'), 'the legend shows the Portuguese text');
  check(!lookup.includes('Open string</strong>'), 'the open string label is translated');

  // The note guides are translated, placeholders and all.
  const notes = api.getNoteLessons('violin');

  // The finger card names the string, the finger and the position.
  const card = api.renderPresentPhase(api.CURRICULUM.violin, notes[0]);
  check(card.includes('Cartão de dedos'), 'the finger card title is translated');
  check(card.includes('Número da corda'), 'the finger card labels are translated');
  check(!card.includes('String number'), 'no English left in the finger card');
  const first = notes[0];
  const text = api.lessonText(first);
  check(!text.includes('the open'), 'the note description is translated');
  check(text.includes('corda'), 'the note description shows the Portuguese text');
  check(!/\{[a-z0-9]+\}/.test(text), 'the filled description keeps no placeholder');

  // Switching back restores the English wording.
  api.setLang('en');
  check(api.getLang() === 'en', 'the app switches back to English');
  check(api.renderFirstSoundScreen().includes('Make your first sound'),
    'the English guide comes back');
}

// ── 2. Deleting an imported song clears its saved progress ─────────────────
{
  const song = { id: 'imported-123', type: 'song', noteName: 'Imported', prerequisiteIds: [], noteIds: ['vl-1'], durations: [1], prompt: '', description: '' };
  store[api.IMPORTED_SONGS_KEY] = JSON.stringify({ violin: [song] });
  api.APP.progress = { violin: { completed: { [song.id]: { stars: 2 } }, xp: 40, mastery: {} } };

  api.handleAction('delete-imported-song', { dataset: { importedIndex: '0' } });

  const left = JSON.parse(store[api.IMPORTED_SONGS_KEY] || '{}').violin || [];
  check(left.length === 0, 'deleted song should be removed from the imported list');
  check(!api.APP.progress.violin.completed[song.id],
    'deleted song progress should be cleared from memory');
  const saved = JSON.parse(store['preludioStringsProgress'] || '{}');
  check(!saved.violin || !saved.violin.completed || !saved.violin.completed[song.id],
    'deleted song progress should not be persisted to localStorage');
}

// ── 3. Deleting a missing song does not throw ──────────────────────────────
{
  store[api.IMPORTED_SONGS_KEY] = JSON.stringify({ violin: [] });
  api.handleAction('delete-imported-song', { dataset: { importedIndex: '5' } });
  check(true, 'deleting an out-of-range imported song should not throw');
}

// ── 4. Sprint questions draw only from learned notes ───────────────────────
{
  const violinLessons = violin.lessons.filter(l => !l.type);
  const learnedIds = violinLessons.slice(0, 3).map(l => l.id);
  api.APP.instrumentId = 'violin';
  api.APP.progress = { violin: { completed: {}, xp: 0, mastery: {} } };
  learnedIds.forEach(id => { api.APP.progress.violin.completed[id] = { stars: 3 }; });

  for (let i = 0; i < 20; i++) {
    const q = api.buildSprintQuestion('violin', api.SPRINT_MODES.SIGHT);
    check(q.options.some(o => o.id === q.correctId), 'sprint options include the correct note');
    check(q.options.every(o => learnedIds.includes(o.id)), 'sprint options only use learned notes');
    check(new Set(q.options.map(o => o.id)).size === q.options.length, 'sprint options are unique');
  }
}

// ── 5. Sprint personal best only moves upward ──────────────────────────────
{
  api.APP.progress = { violin: { completed: {}, xp: 0, mastery: {}, sprints: {} } };
  check(api.getSprintBest('violin', api.SPRINT_MODES.SIGHT) === 0, 'no sprint best initially');
  check(api.setSprintBest('violin', api.SPRINT_MODES.SIGHT, 5) === true, 'first score sets a best');
  check(api.setSprintBest('violin', api.SPRINT_MODES.SIGHT, 3) === false, 'lower score is not a best');
  check(api.getSprintBest('violin', api.SPRINT_MODES.SIGHT) === 5, 'best stays at the higher score');
  check(api.setSprintBest('violin', api.SPRINT_MODES.SIGHT, 7) === true, 'higher score sets a new best');
}

// ── 6. Sprint answering scores correct taps and flags wrong ones ───────────
{
  api.APP.instrumentId = 'violin';
  api.APP.progress = { violin: { completed: {}, xp: 0, mastery: {} } };
  violin.lessons.filter(l => !l.type).slice(0, 3).forEach(l => { api.APP.progress.violin.completed[l.id] = { stars: 3 }; });
  api.APP.sprint = {
    mode: api.SPRINT_MODES.SIGHT, endsAt: Date.now() + 30000, score: 0,
    finished: false, isBest: false, xp: 0,
    question: api.buildSprintQuestion('violin', api.SPRINT_MODES.SIGHT),
  };
  const correct = api.APP.sprint.question.correctId;
  api.handleAction('sprint-answer', { dataset: { id: correct } });
  check(api.APP.sprint.score === 1, 'correct answer increments the score');
  const before = api.APP.sprint.score;
  const wrong = api.APP.sprint.question.options.find(o => o.id !== api.APP.sprint.question.correctId);
  api.handleAction('sprint-answer', { dataset: { id: wrong.id } });
  check(api.APP.sprint.score === before, 'wrong answer does not increment the score');
  check(api.APP.sprint.question.wrongId === wrong.id, 'wrong answer is flagged for feedback');
}

// ── 7. Finishing a sprint awards XP and records the best ───────────────────
{
  api.APP.progress = { violin: { completed: {}, xp: 0, mastery: {}, sprints: {} } };
  api.APP.instrumentId = 'violin';
  api.APP.sprint = {
    mode: api.SPRINT_MODES.SIGHT, endsAt: Date.now(), score: 6,
    finished: false, isBest: false, xp: 0, question: {},
  };
  api.finishSprint();
  check(api.APP.sprint.finished === true, 'sprint is marked finished');
  check(api.APP.sprint.isBest === true, 'first score is a new best');
  check(api.APP.sprint.xp === 12, 'sprint awards 2 XP per correct answer');
  check(api.getSprintBest('violin', api.SPRINT_MODES.SIGHT) === 6, 'finish records the personal best');
  check(api.APP.progress.violin.xp === 12, 'sprint XP is added to instrument progress');
}

// ── 8. Practice screen gates drills until two notes are learned ────────────
{
  api.APP.instrumentId = 'violin';
  api.APP.sprint = null;
  api.APP.progress = { violin: { completed: {}, xp: 0, mastery: {} } };
  api.APP.progress.violin.completed['vl-1'] = { stars: 3 };
  let html = api.renderPracticeScreen();
  check(html.includes('unlock'), 'practice screen stays locked with fewer than two notes');
  check(html.includes('disabled'), 'locked practice screen disables the sprint cards');
  api.APP.progress.violin.completed['vl-2'] = { stars: 3 };
  html = api.renderPracticeScreen();
  check(!html.includes('unlock'), 'practice screen unlocks once two notes are learned');
  check(html.includes('data-action="start-sprint"'), 'practice screen offers sprints once ready');
  check(html.includes('sight') && html.includes('finger'), 'practice screen lists both sprint modes');
}

// ── 9. Sprint view renders prompt, HUD and result cleanly ─────────────────
{
  api.APP.instrumentId = 'violin';
  api.APP.progress = { violin: { completed: {}, xp: 0, mastery: {} } };
  violin.lessons.filter(l => !l.type).slice(0, 3).forEach(l => { api.APP.progress.violin.completed[l.id] = { stars: 3 }; });
  api.APP.sprint = {
    mode: api.SPRINT_MODES.FINGER, endsAt: Date.now() + 30000, score: 2,
    finished: false, isBest: false, xp: 0,
    question: api.buildSprintQuestion('violin', api.SPRINT_MODES.FINGER),
  };
  const live = api.renderPracticeScreen();
  check(live.includes('sprint-timer') && live.includes('sprint-score'), 'sprint view shows the HUD');
  check(live.includes('data-action="sprint-answer"'), 'sprint view offers answer options');
  check(!live.includes('undefined') && !live.includes('NaN'), 'live sprint view has no undefined/NaN');

  api.APP.sprint.finished = true;
  api.APP.sprint.xp = 4;
  const done = api.renderPracticeScreen();
  check(done.includes('sprint-result-score') && done.includes('Play again'), 'finished sprint shows the result');
  check(done.includes('+4 XP'), 'finished sprint shows XP earned');
  check(!done.includes('undefined') && !done.includes('NaN'), 'sprint result has no undefined/NaN');
}

// ── 10. Practice time accumulates and drives the streak ───────────────────
{
  api.APP.motivation = { days: {}, badges: {} };
  api.addPracticeSeconds(60);
  check(api.getTotalPracticeSeconds() === 60, 'practice seconds accumulate');
  api.addPracticeSeconds(90);
  check(api.getTotalPracticeSeconds() === 150, 'practice seconds keep accumulating');

  api.APP.motivation = { days: {}, badges: {} };
  const now = new Date('2026-10-08T10:00:00');
  for (let i = 0; i < 3; i++) {
    const d = new Date(now);
    d.setDate(d.getDate() - i);
    api.APP.motivation.days[api.todayKey(d)] = 30;
  }
  check(api.getCurrentStreak(now) === 3, 'three consecutive days is a 3-day streak');
  const d5 = new Date(now);
  d5.setDate(d5.getDate() - 5);
  api.APP.motivation.days[api.todayKey(d5)] = 30;
  check(api.getCurrentStreak(now) === 3, 'a gap breaks the streak');
}

// ── 11. Levels and avatars scale with XP ──────────────────────────────────
{
  check(api.getLevel(0) === 1, 'zero XP is level 1');
  check(api.getLevel(99) === 1, 'under 100 XP is level 1');
  check(api.getLevel(100) === 2, '100 XP is level 2');
  check(api.getLevel(550) === 6, '550 XP is level 6');
  check(api.getAvatar(1) !== api.getAvatar(12), 'avatar changes across levels');
}

// ── 12. Badges unlock from milestones and only once ───────────────────────
{
  api.APP.motivation = { days: {}, badges: {} };
  api.APP.progress = { violin: { completed: {}, xp: 0, mastery: {} } };
  check(api.evaluateBadges().length === 0, 'no badges are earned with no progress');

  const note = violin.lessons.find(l => !l.type);
  api.APP.progress.violin.completed[note.id] = { stars: 3 };
  const earned = api.evaluateBadges();
  check(earned.some(b => b.id === 'first-steps'), 'completing a lesson unlocks First Steps');
  check(api.hasBadge('first-steps'), 'the earned badge is stored');
  check(api.evaluateBadges().length === 0, 'badges are not re-awarded');
}

// ── 13. A strong finger sprint unlocks Quick Fingers ──────────────────────
{
  api.APP.motivation = { days: {}, badges: {} };
  api.APP.progress = { violin: { completed: {}, xp: 0, mastery: {}, sprints: { [api.SPRINT_MODES.FINGER]: 15 } } };
  const earned = api.evaluateBadges();
  check(earned.some(b => b.id === 'quick-fingers'), 'a 15-point finger sprint unlocks Quick Fingers');
}

// ── 14. Session timing records practice time ──────────────────────────────
{
  api.APP.motivation = { days: {}, badges: {} };
  api.APP.sessionStart = Date.now() - 60000;
  api.endSession();
  check(api.getTotalPracticeSeconds() >= 55, 'ending a session records practice time');
  check(api.APP.sessionStart === null, 'session start is cleared after ending');
  const afterFirst = api.getTotalPracticeSeconds();
  api.endSession();
  check(api.getTotalPracticeSeconds() === afterFirst, 'ending with no active session is a no-op');
}

// ── 15. Student card and badge shelf render on the home screen ────────────
{
  api.APP.motivation = { days: {}, badges: {} };
  api.APP.progress = { violin: { completed: {}, xp: 250, mastery: {} } };
  const card = api.renderStudentCard('Ada');
  check(card.includes('Ada') && card.includes('Lv 3'), 'student card shows name and level');
  check(card.includes('streak') || card.includes('Practice today'), 'student card shows streak state');
  const shelf = api.renderBadgeShelf();
  check(shelf.includes('Badges'), 'badge shelf renders');
  check(shelf.includes('First Steps'), 'badge shelf lists badge names');
  const home = api.renderSelectScreen();
  check(home.includes('student-card') && home.includes('badges-shelf'), 'home shows card and badges');
}

// ── 16. Resetting progress also clears motivation ─────────────────────────
{
  api.APP.progress = { violin: { completed: { 'vl-1': { stars: 3 } }, xp: 10, mastery: {} } };
  api.APP.motivation = { days: { '2026-01-01': 60 }, badges: { 'first-steps': 'x' } };
  api.handleAction('reset-progress', { dataset: {} });
  check(Object.keys(api.APP.progress).length === 0, 'reset clears instrument progress');
  check(Object.keys(api.APP.motivation.badges).length === 0, 'reset clears badges');
  check(Object.keys(api.APP.motivation.days).length === 0, 'reset clears practice days');
}

// Helper: mark every non-song violin lesson complete.
function completeViolinNotes() {
  const prog = { completed: {}, xp: 0, mastery: {}, skills: {} };
  violin.lessons.forEach(l => {
    if (!l.type || l.type === 'review') prog.completed[l.id] = { stars: 3 };
  });
  api.APP.progress = { violin: prog };
  api.APP.instrumentId = 'violin';
  return prog;
}
const violinNotes = violin.lessons.filter(l => !l.type);

// ── 17. Per-note skill tracking records accuracy and streaks ──────────────
{
  api.APP.progress = { violin: { completed: {}, xp: 0, mastery: {} } };
  const ok = api.recordSkill('violin', 'vl-1', true);
  check(ok.correct === 1 && ok.wrong === 0 && ok.streak === 1, 'recordSkill logs a correct answer');
  const miss = api.recordSkill('violin', 'vl-1', false);
  check(miss.correct === 1 && miss.wrong === 1 && miss.streak === 0, 'recordSkill logs a miss and resets the streak');
  check(api.getSkill('violin', 'vl-2').correct === 0, 'getSkill initialises unseen notes');
}

// ── 18. Weakness favours low accuracy and long-overdue notes ──────────────
{
  const prog = { completed: {}, xp: 0, mastery: {}, skills: {} };
  api.APP.progress = { violin: prog };
  api.APP.instrumentId = 'violin';
  const now = Date.parse('2026-03-01T10:00:00');
  prog.skills[violinNotes[0].id] = { correct: 0, wrong: 5, lastSeen: now };
  prog.skills[violinNotes[1].id] = { correct: 5, wrong: 0, lastSeen: now };
  prog.skills[violinNotes[2].id] = { correct: 5, wrong: 0, lastSeen: now - 30 * 86400000 };
  check(
    api.noteWeakness('violin', violinNotes[0].id, now) > api.noteWeakness('violin', violinNotes[1].id, now),
    'a low-accuracy note scores weaker than an accurate one'
  );
  check(
    api.noteWeakness('violin', violinNotes[2].id, now) > api.noteWeakness('violin', violinNotes[1].id, now),
    'a long-unseen note scores weaker than a fresh one'
  );
}

// ── 19. Generated plan prioritises the weakest note, then a sprint and song
{
  const prog = completeViolinNotes();
  const now = Date.parse('2026-03-01T10:00:00');
  prog.skills[violinNotes[0].id] = { correct: 0, wrong: 5, lastSeen: now };
  violinNotes.slice(1).forEach(n => { prog.skills[n.id] = { correct: 9, wrong: 0, lastSeen: now }; });
  const plan = api.generatePlan('violin', now);
  check(plan.items[0].type === 'note' && plan.items[0].targetId === violinNotes[0].id, 'plan starts with the weakest note');
  check(plan.items.some(i => i.type === 'sprint'), 'plan includes a sprint');
  check(plan.items.some(i => i.type === 'song'), 'plan includes an unlocked song');
}

// ── 20. Today's plan persists, then regenerates on a new day ──────────────
{
  completeViolinNotes();
  const day1 = Date.parse('2026-03-01T10:00:00');
  const p1 = api.getTodayPlan('violin', day1);
  p1.items[0].done = true;
  const p2 = api.getTodayPlan('violin', day1);
  check(p2.items[0].done === true, 'plan progress persists within the same day');
  const day2 = Date.parse('2026-03-02T10:00:00');
  const p3 = api.getTodayPlan('violin', day2);
  check(p3.items.every(i => !i.done), 'a fresh plan is generated on a new day');
  check(p3.date === api.todayKey(new Date(day2)), 'the regenerated plan is dated for the new day');
}

// ── 21. Completing every plan item awards bonus XP and the badge once ─────
{
  completeViolinNotes();
  api.APP.motivation = { days: {}, badges: {} };
  const plan = api.getTodayPlan('violin');
  plan.items.forEach(it => {
    if (it.type === 'sprint') api.markPlanItemDone('violin', 'sprint', it.mode);
    else api.markPlanItemDone('violin', it.type, it.targetId);
  });
  check(api.isPlanComplete('violin'), 'the plan reads complete once all items are done');
  check(api.APP.progress.violin.xp >= 20, 'completing the plan awards bonus XP');
  check(api.hasBadge('plan-complete'), 'completing the plan earns the Planner badge');
  const xpAfter = api.APP.progress.violin.xp;
  api.markPlanItemDone('violin', 'note', plan.items[0].targetId);
  check(api.APP.progress.violin.xp === xpAfter, 'the plan bonus is only awarded once');
}

// ── 22. The plan card renders items with start controls ──────────────────
{
  completeViolinNotes();
  const html = api.renderPlanCard('violin');
  check(html.includes('Today') && html.includes('plan-item'), 'plan card renders a headed item list');
  check(html.includes('data-action="plan-start"'), 'plan card offers a start control');
}

// ── 23. Accuracy is null until a note is attempted ────────────────────────
{
  api.APP.progress = { violin: { completed: {}, xp: 0, mastery: {} } };
  check(api.getNoteAccuracy('violin', 'vl-1').accuracy === null, 'accuracy is null with no attempts');
  api.recordSkill('violin', 'vl-1', true);
  api.recordSkill('violin', 'vl-1', false);
  const acc = api.getNoteAccuracy('violin', 'vl-1');
  check(acc.attempts === 2 && acc.accuracy === 0.5, 'accuracy reflects correct over attempts');
}

// ── 24. Weakest-notes list is ordered by weakness ─────────────────────────
{
  const prog = completeViolinNotes();
  const now = Date.now();
  prog.skills[violinNotes[0].id] = { correct: 0, wrong: 6, lastSeen: now };
  violinNotes.slice(1).forEach(n => { prog.skills[n.id] = { correct: 6, wrong: 0, lastSeen: now }; });
  const weak = api.getWeakestNotes('violin', 3);
  check(weak.length === 3, 'weakest-notes list is capped at the requested count');
  check(weak[0].lesson.id === violinNotes[0].id, 'the weakest note is listed first');
}

// ── 25. Weighted picking favours weak notes ───────────────────────────────
{
  const prog = completeViolinNotes();
  const now = Date.now();
  const weakId = violinNotes[0].id;
  prog.skills[weakId] = { correct: 0, wrong: 10, lastSeen: now - 30 * 86400000 };
  violinNotes.slice(1).forEach(n => { prog.skills[n.id] = { correct: 8, wrong: 0, lastSeen: now }; });
  const pool = api.getLearnedNotes('violin');
  const trials = 200;
  let weakPicked = 0;
  for (let i = 0; i < trials; i++) {
    if (api.pickWeightedNote('violin', pool).id === weakId) weakPicked++;
  }
  // Compare against an even split across the pool rather than a fixed count, so
  // the assertion stays valid as instruments gain more notes.
  const fairShare = trials / pool.length;
  check(weakPicked > fairShare * 2, 'a weak note is chosen far more often than strong ones');
  check(api.pickWeightedNote('violin', pool.slice(0, 1)).id === weakId, 'picking from a single-note pool is safe');
}

// ── 26. Focus-areas panel shows weak notes with accuracy ──────────────────
{
  const prog = completeViolinNotes();
  const now = Date.now();
  prog.skills[violinNotes[0].id] = { correct: 1, wrong: 3, lastSeen: now };
  const html = api.renderWeakSpots('violin');
  check(html.includes('Focus areas'), 'focus-areas panel renders a heading');
  check(html.includes(violinNotes[0].noteName), 'focus-areas panel names a weak note');
  check(html.includes('25%'), 'focus-areas panel shows the accuracy percentage');
}

// ── 27. Ear phrases are the right length and avoid repeats ────────────────
{
  completeViolinNotes();
  const phrase = api.buildEarPhrase('violin');
  check(phrase.length === api.earPhraseLength('violin'), 'phrase length matches the learned-note tier');
  check(phrase.every(id => api.getLearnedNotes('violin').some(l => l.id === id)), 'phrase draws only from learned notes');
  let repeats = 0;
  for (let i = 1; i < phrase.length; i++) if (phrase[i] === phrase[i - 1]) repeats++;
  check(repeats === 0, 'phrase does not repeat a note back-to-back');
  api.APP.progress = { violin: { completed: {}, xp: 0, mastery: {} } };
  check(api.buildEarPhrase('violin').length === 0, 'no phrase is built without two learned notes');
}

// ── 28. Grading scores each position correctly ────────────────────────────
{
  const graded = api.gradeEarResponse(['a', 'b', 'c'], ['a', 'x', 'c']);
  check(graded.length === 3 && graded[0] && !graded[1] && graded[2], 'grading flags each position');
  check(api.earScore(graded) === 2, 'score counts correct positions');
}

// ── 29. A perfect echo awards XP and the Golden Ear badge ─────────────────
{
  completeViolinNotes();
  api.APP.motivation = { days: {}, badges: {} };
  const e = api.startEarRound('violin');
  const xpBefore = api.APP.progress.violin.xp;
  e.phrase.forEach(id => api.submitEarPick('violin', id));
  check(api.APP.ear.finished === true, 'the round finishes once every slot is filled');
  check(api.earScore(api.APP.ear.graded) === e.phrase.length, 'echoing the exact phrase scores full marks');
  check(api.APP.progress.violin.xp > xpBefore, 'a completed round awards XP');
  check(api.hasBadge('golden-ear'), 'a perfect phrase earns the Golden Ear badge');
  check(api.APP.progress.violin.earBest === e.phrase.length, 'the best score is recorded');
}

// ── 30. Ear screen renders slots and a note palette ───────────────────────
{
  completeViolinNotes();
  api.startEarRound('violin');
  const html = api.renderEarScreen();
  check(html.includes('ear-slot') && html.includes('ear-key'), 'ear screen renders slots and note keys');
  check(html.includes('data-action="ear-pick"'), 'ear keys are interactive');
  check(html.includes(violinNotes[0].noteName), 'the palette names learned notes');
  api.APP.progress = { violin: { completed: {}, xp: 0, mastery: {} } };
  const locked = api.renderEarScreen();
  check(locked.includes('unlock ear training'), 'ear screen shows a locked message with too few notes');
}

// ── 31. Tempo helpers clamp and convert sensibly ──────────────────────────
{
  check(api.clampBpm(5) === 30 && api.clampBpm(999) === 220, 'BPM clamps to the allowed range');
  check(api.clampBpm(80.6) === 81, 'BPM rounds to a whole number');
  check(api.bpmToIntervalMs(60) === 1000, '60 BPM is one beat per second');
  check(api.bpmToIntervalMs(120) === 500, '120 BPM is two beats per second');
}

// ── 32. Beats advance, wrap, and accent the downbeat ──────────────────────
{
  const m = api.createMetronome(90, 4);
  const first = api.advanceMetronome(m);
  check(first.beat === 0 && first.accent === true, 'the first beat of a bar is accented');
  api.advanceMetronome(m);
  api.advanceMetronome(m);
  const fourth = api.advanceMetronome(m);
  check(fourth.beat === 3 && fourth.accent === false, 'beats count up within the bar');
  const wrap = api.advanceMetronome(m);
  check(wrap.beat === 0 && wrap.accent === true, 'the bar wraps back to an accented downbeat');
}

// ── 33. Tap tempo averages recent taps ────────────────────────────────────
{
  check(api.tapTempo([1000]) === null, 'tap tempo needs at least two taps');
  check(api.tapTempo([0, 500, 1000, 1500]) === 120, 'even 500ms taps give 120 BPM');
}

// ── 33b. Subdivisions, presets, count-in, volume and sound ────────────────
{
  check(api.bpmToTickMs(120, 1) === 500, 'no subdivision ticks at the beat rate');
  check(api.bpmToTickMs(120, 2) === 250, 'eighths tick twice per beat');
  check(api.bpmToTickMs(120, 4) === 125, 'sixteenths tick four times per beat');
  check(api.bpmToTickMs(120, 3) === 167, 'triplets round to the nearest millisecond');

  const m = api.createMetronome(120, 4);
  m.subdivision = 2;
  const t1 = api.metronomeTick(m);
  const t2 = api.metronomeTick(m);
  const t3 = api.metronomeTick(m);
  check(t1.beat === 0 && t1.isBeat === true && t1.accent === true, 'the first tick is an accented downbeat');
  check(t2.beat === 0 && t2.isBeat === false && t2.sub === 1 && t2.accent === false, 'the subdivision between beats does not accent');
  check(t3.beat === 1 && t3.isBeat === true, 'the next beat follows the subdivision');

  const trip = api.createMetronome(120, 2);
  trip.subdivision = 3;
  api.metronomeTick(trip);
  api.metronomeTick(trip);
  const tripThird = api.metronomeTick(trip);
  const tripNext = api.metronomeTick(trip);
  check(tripThird.beat === 0 && tripThird.isBeat === false && tripThird.sub === 2, 'triplets place two subdivisions between beats');
  check(tripNext.beat === 1 && tripNext.isBeat === true, 'the following beat lands after a triplet');

  const vol = api.metronomeClickOpts(m, false).volume;
  const subVol = api.metronomeClickOpts(m, true).volume;
  check(Math.abs(vol - api.METRONOME_DEFAULT_VOLUME) < 1e-9, 'beat clicks carry the set volume');
  check(subVol < vol && subVol > 0, 'subdivisions click softer than the beat');
  const loud = api.createMetronome();
  loud.volume = 1; loud.sound = 'wood';
  check(api.metronomeClickOpts(loud).sound === 'wood' && api.metronomeClickOpts(loud).volume === 1, 'sound choice and full volume pass through');

  const d = api.createMetronome();
  check(d.subdivision === 1 && d.countIn === false && d.sound === 'click', 'metronome starts on plain beats with no count-in');
  check(d.volume === api.METRONOME_DEFAULT_VOLUME && d.countInLeft === 0, 'default volume is applied and count-in is idle');
  check(api.METRONOME_SUBDIVISIONS.map(s => s.value).join(',') === '1,2,3,4', 'four subdivision choices are offered');
  check(api.TEMPO_PRESETS.map(p => p.bpm).join(',') === '60,80,100,120,160', 'tempo presets run slow to fast');
  check(api.METRONOME_SOUNDS.map(s => s.value).join(',') === 'click,wood,beep', 'three click sounds are offered');
}

// ── 34. Pitch detection finds a known sine frequency ──────────────────────
{
  const sampleRate = 44100;
  const n = 2048;
  function sine(freq, amp = 0.6) {
    const b = new Float32Array(n);
    for (let i = 0; i < n; i++) b[i] = amp * Math.sin(2 * Math.PI * freq * i / sampleRate);
    return b;
  }
  function harmonic(freq, amp) {
    const b = new Float32Array(n);
    for (let i = 0; i < n; i++) {
      const t = i / sampleRate;
      b[i] = amp * (Math.sin(2 * Math.PI * freq * t) + 0.6 * Math.sin(2 * Math.PI * 2 * freq * t) +
        0.4 * Math.sin(2 * Math.PI * 3 * freq * t)) / 2;
    }
    return b;
  }
  const a4 = api.detectPitch(sine(440), sampleRate);
  check(Math.abs(a4 - 440) < 15, 'detects A4 near 440 Hz');
  const d4 = api.detectPitch(sine(293.66), sampleRate);
  check(Math.abs(d4 - 293.66) < 15, 'detects D4 near 293.66 Hz');
  const quiet = api.detectPitch(sine(440, 0.1), sampleRate);
  check(Math.abs(quiet - 440) < 15, 'detects a soft A4 a quiet mic used to drop out');
  const low = api.detectPitch(sine(116.54, 0.15), sampleRate);
  check(Math.abs(low - 116.54) < 6, 'detects a soft low Bb2 for low brass');
  check(Math.abs(api.detectPitch(harmonic(220, 0.2), sampleRate) - 220) < 15, 'a harmonic-rich tone keeps its fundamental (no octave error)');
  const silence = new Float32Array(n);
  check(api.detectPitch(silence, sampleRate) === -1, 'silence yields no pitch');
  let seed = 12345;
  const noisy = new Float32Array(n);
  for (let i = 0; i < n; i++) { seed = (seed * 1103515245 + 12345) % 2147483648; noisy[i] = (seed / 2147483648 * 2 - 1) * 0.08; }
  check(api.detectPitch(noisy, sampleRate) === -1, 'noise floor yields no pitch');
}

// ── 35. Frequency maps to the nearest note and cents ──────────────────────
{
  const notes = api.getNoteLessons('violin');
  const openG = notes.find(n => n.noteName === 'G3');
  const exact = api.freqToNoteInfo(openG.freq, notes);
  check(exact.note.id === 'vl-1' && Math.abs(exact.cents) < 1, 'an exact frequency maps to its note, in tune');
  const sharp = api.freqToNoteInfo(openG.freq * Math.pow(2, 10 / 1200), notes);
  check(sharp.note.id === 'vl-1' && Math.abs(sharp.cents - 10) < 1, 'a sharp frequency reports positive cents');
  check(api.centsLabel(0) === 'in tune', 'near-zero cents reads as in tune');
  check(api.centsLabel(12) === '+12 cents sharp', 'positive cents label as sharp');
  check(api.centsLabel(-18) === '-18 cents flat', 'negative cents label as flat');
}

// ── 36. Metronome and tuner panels render their controls ──────────────────
{
  api.APP.metronome = null;
  const metro = api.renderMetronomePanel();
  check(metro.includes('BPM') && metro.includes('80'), 'metronome panel shows the tempo');
  check(metro.includes('data-action="metronome-toggle"') && metro.includes('data-action="metronome-tap"'), 'metronome panel has play and tap controls');
  check(metro.includes('id="tool-preset"') && metro.includes('id="tool-timesig"'), 'metronome panel has preset and time-signature selects');
  check(metro.includes('id="tool-subdivision"') && metro.includes('id="tool-sound"'), 'metronome panel has subdivision and sound selects');
  check(metro.includes('data-action="metronome-countin"') && metro.includes('id="metronome-volume"'), 'metronome panel has count-in and volume controls');
  api.APP.instrumentId = 'violin';
  api.APP.tuner = null;
  const tuner = api.renderTunerPanel();
  check(tuner.includes('data-action="tuner-toggle"'), 'tuner panel shows a listening control');

  const widget = api.renderToolWidget();
  check(typeof widget === 'undefined', 'renderToolWidget tolerates a missing host');
}


// ── 37–40. Teacher / parent practice report ───────────────────────────────
{
  const savedProgress = JSON.parse(JSON.stringify(api.APP.progress));
  const savedMotivation = JSON.parse(JSON.stringify(api.APP.motivation));
  api.APP.progress = {
    violin: {
      completed: { 'vl-1': { stars: 3 }, 'vl-2': { stars: 1 } },
      xp: 120,
      mastery: { 'vl-1': 7, 'vl-2': 3 },
      skills: {
        'vl-1': { correct: 9, wrong: 1, streak: 3, lastSeen: Date.now() },
        'vl-2': { correct: 2, wrong: 8, streak: 0, lastSeen: Date.now() },
      },
    },
  };
  api.APP.motivation = { days: { [api.todayKey()]: 600 }, badges: { 'first-steps': 'x' } };

  // 37. A single-instrument report summarizes notes, XP and focus.
  const ir = api.getInstrumentReport('violin');
  check(ir.notesLearned === 2 && ir.xp === 120, 'instrument report counts learned notes and XP');
  check(ir.notesTotal > 2 && ir.songsTotal >= 1, 'instrument report knows the totals');
  check(ir.mastery.mastered === 1 && ir.mastery.practiced === 1, 'mastery buckets use quiz counts');
  check(ir.weak.length >= 1 && ir.weak[0].name === 'D4' && ir.weak[0].accuracy === 20, 'the weakest note is surfaced first');

  // 38. The whole report aggregates time, level and badges.
  const rep = api.buildPracticeReport('Test');
  check(rep.student === 'Test' && rep.totalMinutes === 10, 'report totals practice minutes');
  check(rep.xp === 120 && rep.level === 2, 'report reports XP and level');
  check(rep.notesLearned === 2, 'report sums learned notes');
  check(rep.badges.length === 1 && rep.badgeTotal === api.BADGES.length, 'report lists earned badges');

  // 39. The copyable text version is plain, readable English.
  const text = api.formatReportText(rep);
  check(text.includes('Practice report — Test'), 'text report has a title');
  check(text.includes('10 min practiced'), 'text report shows minutes');
  check(text.includes('2/' + rep.instruments[0].notesTotal + ' notes'), 'text report lists instrument progress');
  check(text.includes('Focus: D4 (20%)'), 'text report names the focus note');

  // 40. The report screen renders and the select screen links to it.
  const html = api.renderReportScreen();
  check(html.includes('Practice report') && html.includes('Test'), 'report screen shows the student');
  check(html.includes('data-action="copy-report"') && html.includes('data-action="print-report"'), 'report screen has share actions');
  check(html.includes('data-action="close-report"') && html.includes('Violin'), 'report screen lists instruments and can go back');
  check(api.renderSelectScreen().includes('data-action="open-report"'), 'select screen offers the report');

  api.APP.progress = savedProgress;
  api.APP.motivation = savedMotivation;
}

// ── 41–44. Auto-generated weekly digest ───────────────────────────────────
{
  const savedProgress = JSON.parse(JSON.stringify(api.APP.progress));
  const savedMotivation = JSON.parse(JSON.stringify(api.APP.motivation));
  const now = new Date('2024-03-06T12:00:00'); // a Wednesday
  api.APP.progress = { violin: { completed: {}, xp: 40, mastery: {} } };
  api.APP.motivation = {
    days: { '2024-03-04': 120, '2024-03-06': 600, '2024-03-07': 60 },
    badges: { 'first-steps': '2024-03-05T10:00:00Z', 'first-song': '2023-01-01T00:00:00Z' },
  };

  // 41. The week runs Monday to Sunday.
  const start = api.getWeekStart(now);
  check(start.getDay() === 1, 'the week starts on Monday');
  check(api.getWeekKey(now) === '2024-03-04', 'the week key is the Monday date');
  const days = api.getWeekDays(now);
  check(days.length === 7 && days[0].label === 'Mon' && days[6].label === 'Sun', 'seven labelled days, Mon–Sun');
  check(days[0].key === '2024-03-04' && days[6].key === '2024-03-10', 'the week spans Monday to Sunday');

  // 42. The digest aggregates the stored day history.
  const d = api.buildWeeklyDigest('Test', now);
  check(d.weekKey === '2024-03-04' && d.totalMinutes === 13, 'digest totals the week minutes');
  check(d.activeDays === 3, 'digest counts active days');
  check(d.bestDayLabel === 'Wed' && d.bestDayMinutes === 10, 'digest finds the best day');
  check(d.headline.includes('3 days'), 'digest writes a headline for the week');
  check(d.badges.length === 1 && d.badges[0].id === 'first-steps', 'digest lists only badges earned this week');

  // 43. The recap text is plain, readable English.
  const text = api.formatDigestText(d);
  check(text.includes('This week in music — Test'), 'digest text has a title');
  check(text.includes('13 min across 3 days'), 'digest text summarizes minutes and days');
  check(text.includes('Best day: Wed (10 min)'), 'digest text names the best day');
  check(text.includes('Daily: Mon 2') && text.includes('Wed 10'), 'digest text shows the daily values');
  check(text.includes('First Steps'), 'digest text lists new badges');

  // 44. The card and screen render, and opening marks the week seen.
  const card = api.renderDigestCard('Test', now);
  check(card.includes('This week in music') && card.includes('data-action="open-digest"'), 'select card links to the digest');
  check(card.includes('13 min') && card.includes('digest-new'), 'the card shows minutes and a New pill');
  check(card.includes('data-action="dismiss-digest"'), 'the card offers a dismiss button');
  api.APP.digestDismissed = false;
  api.handleAction('dismiss-digest');
  check(api.APP.digestDismissed === true, 'dismissing the card records the choice');
  check(api.renderDigestCard('Test', now) === '', 'the card is hidden once dismissed');
  api.APP.digestDismissed = false;
  const screen = api.renderDigestScreen(now);
  check(screen.includes('Weekly digest') && screen.includes('data-action="close-digest"'), 'digest screen renders with a back button');
  check(screen.includes('data-action="copy-digest"') && screen.includes('data-action="print-digest"'), 'digest screen has share actions');
  check(screen.includes('Active days'), 'digest screen shows activity stats');
  api.APP.motivation.digestSeen = '2024-03-04';
  check(!api.renderDigestCard('Test', now).includes('digest-new'), 'a seen digest drops the New pill');
  api.APP.motivation.digestSeen = undefined;
  api.APP.screen = 'select';
  api.handleAction('open-digest');
  check(api.APP.motivation.digestSeen === api.getWeekKey(), 'opening the digest marks this week seen');
  api.APP.screen = 'select';

  api.APP.progress = savedProgress;
  api.APP.motivation = savedMotivation;
}

// ── 45. Weekly goal progress and the once-a-week reminder ─────────────────
{
  const savedMotivation = JSON.parse(JSON.stringify(api.APP.motivation));
  const now = new Date('2024-03-06T12:00:00');
  api.APP.motivation = { days: { '2024-03-04': 120, '2024-03-06': 600, '2024-03-07': 60 }, badges: {} };

  check(api.getWeeklyGoalMinutes() === 60 && api.DEFAULT_WEEKLY_GOAL === 60, 'weekly goal defaults to 60 minutes');
  check(api.setWeeklyGoalMinutes(5) === 10, 'goal clamps to a sensible minimum');
  check(api.setWeeklyGoalMinutes(9999) === 600, 'goal clamps to a sensible maximum');
  api.setWeeklyGoalMinutes(60);

  const d = api.buildWeeklyDigest('Test', now);
  check(d.goalMinutes === 60 && d.totalMinutes === 13, 'digest carries the goal and the week total');
  check(d.goalMet === false && d.goalRemaining === 47, 'an unfinished goal reports the minutes remaining');
  check(d.goalPct === 22, 'goal progress is a percentage of the target');

  api.setWeeklyGoalMinutes(10);
  const hit = api.buildWeeklyDigest('Test', now);
  check(hit.goalMet === true && hit.goalRemaining === 0 && hit.goalPct === 100, 'a met goal caps at 100% and reports success');

  const screen = api.renderDigestScreen(now);
  check(screen.includes('Weekly goal') && screen.includes('data-action="set-weekly-goal"'), 'digest screen offers goal controls');
  check(screen.includes('data-goal="120"'), 'goal options are selectable');
  check(api.renderDigestCard('Test', now).includes('min goal'), 'the select card shows goal progress');

  api.setWeeklyGoalMinutes(60);
  api.APP.motivation.digestSeen = undefined;
  api.APP.motivation.digestReminded = undefined;
  check(api.shouldRemindDigest(now) === true, 'an unseen active week wants a reminder');
  check(api.maybeRemindDigest(now) === true, 'the weekly reminder fires');
  check(api.shouldRemindDigest(now) === false, 'the reminder does not fire twice');
  api.APP.motivation.digestSeen = '2024-03-04';
  check(api.shouldRemindDigest(now) === false, 'a week already seen needs no reminder');

  api.APP.motivation = savedMotivation;
}

// ── 46. Reaching the weekly goal unlocks a badge ──────────────────────────
{
  const savedProgress = JSON.parse(JSON.stringify(api.APP.progress));
  const savedMotivation = JSON.parse(JSON.stringify(api.APP.motivation));
  const today = api.todayKey();
  api.APP.progress = { violin: { completed: {}, xp: 0, mastery: {} } };

  api.APP.motivation = { days: { [today]: 20 * 60 }, badges: {} };
  api.setWeeklyGoalMinutes(15);
  const won = api.evaluateBadges();
  check(won.some(b => b.id === 'goal-getter'), 'meeting the weekly goal unlocks Goal Getter');
  check(api.hasBadge('goal-getter'), 'the Goal Getter badge is recorded');

  api.APP.motivation = { days: { [today]: 5 * 60 }, badges: {} };
  api.setWeeklyGoalMinutes(30);
  const none = api.evaluateBadges();
  check(!none.some(b => b.id === 'goal-getter'), 'falling short of the goal awards no badge');

  api.APP.progress = savedProgress;
  api.APP.motivation = savedMotivation;
}

// ── 50. Theme preference defaults to light and toggles ───────────────────
{
  const saved = store['preludioStringsTheme'];
  delete store['preludioStringsTheme'];
  check(api.getTheme() === 'light', 'theme defaults to light');
  api.setTheme('dark');
  check(store['preludioStringsTheme'] === 'dark', 'setTheme persists the choice');
  check(api.getTheme() === 'dark', 'getTheme reads the saved choice');
  api.toggleTheme();
  check(api.getTheme() === 'light', 'toggleTheme flips dark back to light');
  api.toggleTheme();
  check(api.getTheme() === 'dark', 'toggleTheme flips light to dark');

  api.APP.screen = 'select';
  api.setTheme('light');
  api.handleAction('toggle-theme', { dataset: {} });
  check(api.getTheme() === 'dark', 'the toggle-theme action flips the theme');

  // Instrument accents resolve to theme variables, not baked hex
  const violinAccent = api.instAccent(violin);
  check(violinAccent === 'var(--accent-violin)', 'instrument accent resolves to a CSS variable');
  check(!/#/.test(violinAccent), 'accent is not a hard-coded hex');

  const staff = api.Graphics.staffSVG({ pos: 0, clef: 'treble', accentColor: api.instAccent(violin), width: 96 });
  check(staff.includes('var(--dg-ink)'), 'staff ink uses a theme variable');
  check(staff.includes('var(--dg-open)'), 'notehead halo uses a theme variable');

  const fing = api.Graphics.fingeringSVG('strings', violin.lessons.find(l => !l.type).fingeringState, api.instAccent(violin), 84);
  check(fing.includes('var(--dg-housing)'), 'instrument body uses the theme housing variable');
  check(!/#[0-9A-Fa-f]{6}/.test(fing), 'fingering SVG has no baked hex colors');
  check(fing.includes('1st position'), 'the fingerboard diagram is drawn');

  api.getMotivation();
  check(api.renderSelectScreen().includes('data-action="toggle-theme"'),
    'the home screen exposes a theme toggle');

  if (saved === undefined) delete store['preludioStringsTheme']; else store['preludioStringsTheme'] = saved;
}

(async () => {
  // ── 47. The record control only appears when the mic API exists ─────────
  {
    api.APP.recorder = null;
    api.APP.recordingUrl = null;
    api.APP.instrumentId = 'violin';
    const note = violin.lessons.find(l => !l.type);

    const withMic = api.renderPlayPhase(violin, note);
    check(withMic.includes('data-action="record-toggle"'), 'play phase offers a record control with mic support');

    const mediaDevices = navigator.mediaDevices;
    delete navigator.mediaDevices;
    check(api.canRecord() === false, 'canRecord is false without mediaDevices');
    const noMic = api.renderPlayPhase(violin, note);
    check(!noMic.includes('data-action="record-toggle"'), 'no record control without mic support');
    navigator.mediaDevices = mediaDevices;
  }

  // ── 48. Recording round-trip: start then stop yields a playable take ────
  {
    api.APP.recorder = null;
    api.APP.recordingUrl = null;
    await api.startRecording();
    check(!!api.APP.recorder, 'startRecording opens a recorder');
    check(api.APP.recorder.mediaRecorder.state === 'recording', 'the recorder is running');
    api.APP.recorder.mediaRecorder.ondataavailable({ data: { size: 10 } });
    api.stopRecording();
    check(api.APP.recordingUrl === 'blob:fake', 'stopping creates a playback URL');
    check(api.APP.recorder === null, 'the recorder is cleared after stopping');
    api.playRecording();
    check(Audio.last && Audio.last.src === 'blob:fake', 'playRecording plays the captured take');
  }

  // ── 49. Cleaning up a recording revokes its object URL ──────────────────
  {
    revoked = [];
    api.cleanupRecording();
    check(api.APP.recordingUrl === null, 'cleanup clears the recording URL');
    check(revoked.includes('blob:fake'), 'cleanup revokes the object URL');
  }

  // ── 50. The home screen focuses on a single instrument once chosen ──────
  {
    const saved = store['preludioStringsInstrument'];
    const savedTutorials = store['preludioStringsTutorials'];
    delete store['preludioStringsInstrument'];
    store['preludioStringsTutorials'] = JSON.stringify(['violin']);
    api.APP.pickingInstrument = false;

    const picker = api.renderSelectScreen();
    check(picker.includes('instrument-grid'), 'home shows every instrument before one is chosen');
    check(!picker.includes('focus-card'), 'no focus card before an instrument is chosen');

    api.handleAction('select-instrument', { dataset: { id: 'violin' } });
    check(api.getSavedInstrument() === 'violin', 'opening an instrument remembers it');
    check(api.APP.screen === 'map', 'opening an instrument goes to its lesson map');

    api.APP.screen = 'select';
    api.APP.pickingInstrument = false;
    const home = api.renderSelectScreen();
    check(home.includes('focus-card') && home.includes('data-id="violin"'),
      'home focuses on the chosen instrument');
    check(!home.includes('instrument-grid'), 'the full instrument grid is hidden in the focused view');
    check(home.includes('data-action="switch-instrument"'), 'the focused view offers a switch control');

    if (saved === undefined) delete store['preludioStringsInstrument']; else store['preludioStringsInstrument'] = saved;
    if (savedTutorials === undefined) delete store['preludioStringsTutorials']; else store['preludioStringsTutorials'] = savedTutorials;
  }

  // ── 51. Switching instruments reveals the picker with a way back ────────
  {
    const saved = store['preludioStringsInstrument'];
    store['preludioStringsInstrument'] = 'cello';
    api.APP.pickingInstrument = false;

    api.handleAction('switch-instrument', { dataset: {} });
    check(api.APP.pickingInstrument === true, 'switch-instrument enters picking mode');
    const picker = api.renderSelectScreen();
    check(picker.includes('instrument-grid'), 'picking mode shows every instrument');
    check(picker.includes('data-action="cancel-instrument-pick"'), 'picking mode offers a way back');

    api.handleAction('cancel-instrument-pick', { dataset: {} });
    check(api.APP.pickingInstrument === false, 'cancelling returns to the focused view');
    check(api.renderSelectScreen().includes('focus-card'), 'the focused view is restored after cancel');

    if (saved === undefined) delete store['preludioStringsInstrument']; else store['preludioStringsInstrument'] = saved;
  }

  // ── 52. The fingerboard markers open an explainer ───────────────────────
  {
    check(api.FINGERING_HELP[1] && api.FINGERING_HELP[1].label.toLowerCase().includes('finger'),
      '1 is explained as the first finger');
    check(!!api.FINGERING_HELP.O && !!api.FINGERING_HELP.P1,
      'the open string and the position each have an explanation');

    api.APP.fingeringHelp = null;
    api.handleAction('fingering-key', { dataset: { key: '1' } });
    check(api.APP.fingeringHelp === '1', 'tapping a finger number opens its explanation');

    api.handleAction('close-fingering-help', { dataset: {} });
    check(api.APP.fingeringHelp === null, 'the explainer can be dismissed');

    // The markers in the diagram carry the action.
    const marker = api.Graphics.stringFingeringSVG({ string: 1, finger: 2 }, { stringNames: ['G', 'D', 'A', 'E'] });
    check(marker.includes('data-action="fingering-key"') && marker.includes('data-key="2"'),
      'the finger markers in the diagram are tappable');
  }

  // ── 53. The app tour opens the first time an instrument is chosen ───────
  {
    const savedInst = store['preludioStringsInstrument'];
    const savedTut = store['preludioStringsTutorials'];
    delete store['preludioStringsInstrument'];
    delete store['preludioStringsTutorials'];
    api.APP.pickingInstrument = false;

    const slides = api.buildTutorialSlides(api.CURRICULUM.violin);
    check(slides.length >= 4, 'the tour has several slides');
    check(slides.every(s => s.title && s.body), 'every tour slide has a title and body');
    check(api.renderTutorialScreen().includes('tutorial-dot'), 'the tour renders progress dots');

    api.handleAction('select-instrument', { dataset: { id: 'violin' } });
    check(api.APP.screen === 'tutorial', 'first time on an instrument opens the tour');
    check(api.getTutorialSeen('violin') === false, 'the tour is only marked seen once finished');

    for (let n = 0; n < slides.length + 1; n++) api.handleAction('tutorial-next', { dataset: {} });
    check(api.APP.screen === 'map', 'finishing the tour drops into the lesson map');
    check(api.getTutorialSeen('violin') === true, 'finishing the tour records it as seen');

    if (savedInst === undefined) delete store['preludioStringsInstrument']; else store['preludioStringsInstrument'] = savedInst;
    if (savedTut === undefined) delete store['preludioStringsTutorials']; else store['preludioStringsTutorials'] = savedTut;
  }

  // ── 54. A seen instrument skips the tour, which can be replayed ─────────
  {
    const savedInst = store['preludioStringsInstrument'];
    const savedTut = store['preludioStringsTutorials'];
    store['preludioStringsTutorials'] = JSON.stringify(['cello']);

    api.handleAction('select-instrument', { dataset: { id: 'cello' } });
    check(api.APP.screen === 'map', 'a seen instrument skips straight to the map');
    check(api.renderMapScreen().includes('data-action="open-tutorial"'),
      'the lesson map offers to replay the tour');

    api.handleAction('open-tutorial', { dataset: {} });
    check(api.APP.screen === 'tutorial' && api.APP.tutorialIndex === 0, 'the map can replay the tour');

    api.handleAction('tutorial-back', { dataset: {} });
    check(api.APP.tutorialIndex === 0, 'back stays on the first slide');

    api.handleAction('tutorial-finish', { dataset: {} });
    check(api.APP.screen === 'map', 'finishing a replay returns to the map');

    if (savedInst === undefined) delete store['preludioStringsInstrument']; else store['preludioStringsInstrument'] = savedInst;
    if (savedTut === undefined) delete store['preludioStringsTutorials']; else store['preludioStringsTutorials'] = savedTut;
  }

// ── 55. A new-note quiz mixes the taught note with previously-learned notes ─
{
  const notes = violin.lessons.filter(l => !l.type);
  api.APP.instrumentId = 'violin';
  api.APP.progress = { violin: { completed: {}, xp: 0, mastery: {}, skills: {} } };

  // First note: nothing else to mix in, so a single question.
  const first = api.buildNoteQuizQueue(violin, notes[0]);
  check(first.length === 1, 'the very first note asks a single question');
  check(first[0].correctId === notes[0].id, 'the first question is the taught note');
  check(first[0].quizType === 'fingering-to-note', 'the first question is fingering-to-note');

  // One prior note learned: two questions, the new note guaranteed once.
  api.APP.progress.violin.completed[notes[0].id] = { stars: 3 };
  const two = api.buildNoteQuizQueue(violin, notes[1]);
  check(two.length === 2, 'the second note asks two questions');
  check(two.some(q => q.correctId === notes[1].id), 'the taught note is always asked');
  check(new Set(two.map(q => q.correctId)).size === 2, 'questions cover distinct notes');

  // More prior notes: the set is capped at three and never repeats a note.
  [notes[0], notes[1], notes[2], notes[3]].forEach(n => {
    api.APP.progress.violin.completed[n.id] = { stars: 3 };
  });
  const three = api.buildNoteQuizQueue(violin, notes[4]);
  check(three.length === 3, 'the set is capped at three questions');
  check(three.some(q => q.correctId === notes[4].id), 'the taught note is always asked');
  check(new Set(three.map(q => q.correctId)).size === 3, 'no note is repeated to pad the set');
  check(three.every(q => q.options.length === 3), 'every question offers three options');
  check(three.every(q => q.options.some(o => o.id === q.correctId)), 'the correct note is among its options');
  check(new Set(three.map(q => q.quizType)).size >= 2, 'the set cycles through unlocked quiz types');

  // Re-quizzing an already-completed note still mixes in the other notes.
  const redo = api.buildNoteQuizQueue(violin, notes[0]);
  check(redo.length === 3, 're-quizzing a learned note also builds a mixed set');
  check(redo.some(q => q.correctId === notes[0].id), 'the re-quizzed note is included');

  // The quiz screen announces where you are in the set and offers choices.
  api.APP.quiz = null;
  const html = api.renderQuizPhase(violin, notes[2]);
  check(html.includes('Question 1 of'), 'the quiz shows the set progress');
  check(html.includes('Next question'), 'a non-final question offers to continue to the next');
  check(!api.APP.quiz.answeredCorrectly, 'the first question starts unanswered');
  api.APP.quiz = null;
    api.APP.quizQueue = [];
    api.APP.quizIndex = 0;
  }

// ── 56. A new-note lesson steps through its mixed quiz before playing ──────
{
  const notes = violin.lessons.filter(l => !l.type);
  const prog = { completed: {}, xp: 0, mastery: {}, skills: {} };
  [notes[0], notes[1], notes[2], notes[3]].forEach(n => { prog.completed[n.id] = { stars: 3 }; });
  api.APP.progress = { violin: prog };
  api.APP.instrumentId = 'violin';

  api.handleAction('open-lesson', { dataset: { index: String(violin.lessons.indexOf(notes[4])) } });
  check(api.APP.phase === 'present', 'a note lesson starts on the present screen');

  api.handleAction('goto-quiz', { dataset: {} });
  check(api.APP.phase === 'quiz' && api.APP.quizQueue.length === 3, 'the quiz opens a three-question set');

  for (let i = 0; i < 3; i++) {
    check(api.APP.quizIndex === i, `question ${i + 1} of the set is active`);
    api.handleAction('quiz-answer', { dataset: { id: api.APP.quiz.correctId } });
    check(api.APP.quiz.answeredCorrectly, `question ${i + 1} can be answered`);
    api.handleAction('goto-play', { dataset: {} });
  }
  check(api.APP.phase === 'play', 'finishing the mixed set opens the play phase');
}

// ── 57. Floating metronome/tuner widget works from every screen ───────────
{
  const savedInst = store['preludioStringsInstrument'];
  api.APP.instrumentId = 'violin';
  store['preludioStringsInstrument'] = 'violin';

  api.APP.screen = 'map';
  check(api.APP.toolsOpen === false, 'the widget starts collapsed');

  api.handleAction('toggle-tools', { dataset: {} });
  check(api.APP.toolsOpen === true, 'tapping the launcher opens the widget');

  api.handleAction('tools-tab', { dataset: { tab: 'tuner' } });
  check(api.APP.toolTab === 'tuner', 'the tuner tab can be selected');
  check(api.APP.toolsOpen === true, 'selecting a tab keeps the widget open');

  api.handleAction('close-tools', { dataset: {} });
  check(api.APP.toolsOpen === false, 'closing collapses the widget');

  if (savedInst === undefined) delete store['preludioStringsInstrument']; else store['preludioStringsInstrument'] = savedInst;
}

// ── Practice speed ─────────────────────────────────────────────────────────
// One multiplier (50%–150%, 10% steps) drives every count-in and song, so the
// count-in always runs at the tempo the song will play.
{
  check(api.clampSpeed(1) === 1, 'speed 100% is unchanged');
  check(api.clampSpeed(0.1) === 0.5, 'speed is clamped up to the 50% floor');
  check(api.clampSpeed(9) === 1.5, 'speed is clamped down to the 150% ceiling');
  check(api.clampSpeed(0.74) === 0.7, 'speed snaps to the nearest 10% step');
  check(api.clampSpeed('nonsense') === 1, 'an unparseable speed falls back to 100%');

  check(Math.round(api.msPerBeatAt(100, 1)) === 600, '100 BPM at 100% is 600 ms/beat');
  check(Math.round(api.msPerBeatAt(100, 0.5)) === 1200, '100 BPM at 50% is 1200 ms/beat');
  check(Math.round(api.msPerBeatAt(80, 1.5)) === 500, '80 BPM at 150% is 500 ms/beat');

  check(api.songSpeedLabelText(1) === '100% (100 BPM)', 'the speed label shows percent and BPM');
  const ctl = api.renderSongSpeedControl();
  check(ctl.includes('data-action="song-speed-up"'), 'the speed control has a faster button');
  check(ctl.includes('data-action="song-speed-down"'), 'the speed control has a slower button');
  check(ctl.includes('song-speed-label'), 'the speed control shows a label');

  const prevSpeed = api.APP.songSpeed;
  api.APP.songSpeed = 1;
  api.APP.instrumentId = 'violin';
  api.APP.songNoteIndex = 0;
  const song = violin.lessons.find(l => l.type === 'song');
  const html = api.renderSongPresentPhase(violin, song);
  check(html.includes('song-playback-controls'), 'the song phase groups playback controls');
  check(html.includes('data-action="song-speed-up"'), 'the song phase offers the speed control');
  api.APP.songSpeed = prevSpeed;

  api.APP.songSpeed = 1;
  api.handleAction('song-speed-up', { dataset: {} });
  check(Math.abs(api.APP.songSpeed - 1.1) < 1e-9, 'the faster action raises the speed by one step');
  for (let i = 0; i < 20; i++) api.handleAction('song-speed-up', { dataset: {} });
  check(api.APP.songSpeed === 1.5, 'the faster action stops at the 150% ceiling');
  for (let i = 0; i < 20; i++) api.handleAction('song-speed-down', { dataset: {} });
  check(api.APP.songSpeed === 0.5, 'the slower action stops at the 50% floor');
  api.APP.songSpeed = 1;
  delete store['preludioStringsSongSpeed'];
}

  if (failures.length) console.log(failures.join('\n'));
  console.log(`\n${pass} passed, ${fail} failed`);
  process.exit(fail ? 1 : 0);
})();