// test-curriculum.js
// Validates js/curriculum.js for the string instruments against reference
// data rebuilt here from scratch, so the checks do not simply repeat the
// curriculum's own arithmetic:
//   1. every note's written name, octave and frequency agree
//   2. every note sits at the right place on the staff for its clef
//   3. every fingering really produces that pitch: the finger's distance
//      above the open string is both the right number of semitones and the
//      right number of diatonic steps
//   4. the open strings land on degrees 1, 5, 9 and 13 — a fifth apart
//   5. the range of each instrument matches the range it promises
//   6. every tune is only offered once all of its notes have been taught
//
// String layout used by the app (js/graphics.js stringFingeringSVG):
//   fingeringState = { string: 1..4, finger: 0..4 }
//     string = 1 is the lowest string (left of the fingerboard picture)
//     finger = 0 is the open string, 1..4 are the left-hand fingers
//   In first position on a string in fifths the fingers sit:
//     finger 1 -> 2 semitones, 1 diatonic step  (a whole step)
//     finger 2 -> 4 semitones, 2 diatonic steps (a whole step)
//     finger 3 -> 5 semitones, 3 diatonic steps (a half step)
//     finger 4 -> 7 semitones, 4 diatonic steps (a whole step)

const fs = require('fs');
const path = require('path');

const src = fs.readFileSync(path.join(__dirname, 'js', 'curriculum.js'), 'utf8');
const { CURRICULUM, INSTRUMENT_ORDER, CANONICAL_SONGS } =
  new Function(src + '\nreturn { CURRICULUM, INSTRUMENT_ORDER, CANONICAL_SONGS };')();

let pass = 0;
let fail = 0;
const failures = [];
function check(cond, msg) {
  if (cond) { pass++; } else { fail++; failures.push(msg); }
}

// ── Reference tables, built here rather than imported ──────────────────────
const LETTER = { C: 0, D: 2, E: 4, F: 5, G: 7, A: 9, B: 11 };
const LETTERS = ['C', 'D', 'E', 'F', 'G', 'A', 'B'];
const CLEF_BOTTOM = { treble: 'E4', alto: 'F3', bass: 'G2' };

// Semitones and diatonic steps above the open string for each finger.
const FINGER_SEMITONES = { 0: 0, 1: 2, 2: 4, 3: 5, 4: 7 };
const FINGER_STEPS = { 0: 0, 1: 1, 2: 2, 3: 3, 4: 4 };

const midiOf = (letter, octave) => 12 * (octave + 1) + LETTER[letter];
const freqOf = (letter, octave) => 440 * Math.pow(2, (midiOf(letter, octave) - 69) / 12);

// Diatonic index counted from C0, so pitches can be compared and stepped.
const diatonicOf = (letter, octave) => octave * 7 + LETTERS.indexOf(letter);
const letterOfDiatonic = d => LETTERS[((d % 7) + 7) % 7];
const octaveOfDiatonic = d => Math.floor(d / 7);

// The pitch a given degree of the ladder carries, counting diatonic steps
// from the instrument's lowest open string (degree 1).
const pitchAtDegree = (root, degree) => {
  const d = diatonicOf(root.letter, root.octave) + (degree - 1);
  return { letter: letterOfDiatonic(d), octave: octaveOfDiatonic(d) };
};

// The four open strings, a fifth apart, sit on degrees 1, 5, 9 and 13.
const OPEN_DEGREES = [1, 5, 9, 13];

const EXPECTED = {
  violin: { clef: 'treble', strings: ['G', 'D', 'A', 'E'], root: { letter: 'G', octave: 3 }, low: 'G3', high: 'A5', notes: 16 },
  viola:  { clef: 'alto',   strings: ['C', 'G', 'D', 'A'], root: { letter: 'C', octave: 3 }, low: 'C3', high: 'E5', notes: 17 },
  cello:  { clef: 'bass',   strings: ['C', 'G', 'D', 'A'], root: { letter: 'C', octave: 2 }, low: 'C2', high: 'E4', notes: 17 },
};

// ── The roster ─────────────────────────────────────────────────────────────
check(Array.isArray(INSTRUMENT_ORDER) && INSTRUMENT_ORDER.length === 3,
  'the roster should hold exactly the three string instruments');
for (const id of Object.keys(EXPECTED)) {
  check(!!CURRICULUM[id], `${id} should be in the curriculum`);
  check(INSTRUMENT_ORDER.indexOf(id) !== -1, `${id} should be in the roster order`);
}
for (const id of INSTRUMENT_ORDER) {
  const inst = CURRICULUM[id];
  check(!!inst, `${id} in the roster must exist in the curriculum`);
  check(inst.family === 'strings', `${id} must declare the strings family`);
  check(inst.fingeringType === 'strings', `${id} must use the strings fingering diagram`);
  check(inst.available !== false, `${id} must be available to students`);
  check(typeof inst.accentColor === 'string' && /^#[0-9A-Fa-f]{6}$/.test(inst.accentColor),
    `${id} must declare a hex accent colour`);
}

// ── Every note of every instrument ─────────────────────────────────────────
for (const id of INSTRUMENT_ORDER) {
  const inst = CURRICULUM[id];
  const spec = EXPECTED[id];
  const root = { letter: inst.rootLetter, octave: inst.rootOctave };
  check(root.letter === spec.root.letter && root.octave === spec.root.octave,
    `${id} should start its ladder on ${spec.root.letter}${spec.root.octave} (got ${root.letter}${root.octave})`);

  check(inst.clef === spec.clef, `${id} should be written in ${spec.clef} clef`);
  check(JSON.stringify(inst.stringNames) === JSON.stringify(spec.strings),
    `${id} should have the strings ${spec.strings.join(' ')}`);

  const noteLessons = inst.lessons.filter(l => !l.type);
  check(noteLessons.length === spec.notes,
    `${id} should teach ${spec.notes} notes (got ${noteLessons.length})`);

  // Lesson ids are unique across the whole curriculum.
  const ids = new Set(inst.lessons.map(l => l.id));
  check(ids.size === inst.lessons.length, `${id} lesson ids must be unique`);

  // The bottom line of the clef, as a diatonic index.
  const bottom = CLEF_BOTTOM[inst.clef];
  const bottomD = diatonicOf(bottom[0], Number(bottom[1]));

  const seenDegrees = new Set();
  const seenNotes = new Set();
  let lowest = null;
  let highest = null;

  for (const lesson of noteLessons) {
    const tag = `${id} ${lesson.id}`;
    const m = /^([A-G])(\d)$/.exec(lesson.noteName || '');
    check(!!m, `${tag}: note name should look like "A4" (got ${JSON.stringify(lesson.noteName)})`);
    if (!m) continue;
    const letter = m[1];
    const octave = Number(m[2]);
    seenNotes.add(lesson.noteName);

    // Frequency.
    const expectedFreq = freqOf(letter, octave);
    check(Math.abs(lesson.freq - expectedFreq) < 0.02,
      `${tag}: ${lesson.noteName} should be ${expectedFreq.toFixed(2)} Hz (got ${lesson.freq})`);

    // Staff position, counted in diatonic steps from the bottom line.
    const step = diatonicOf(letter, octave) - bottomD;
    check(lesson.staffStep === step,
      `${tag}: ${lesson.noteName} should sit at staff step ${step} in ${inst.clef} (got ${lesson.staffStep})`);

    // The fingering really produces this pitch.
    const fs = lesson.fingeringState || {};
    check(fs.string >= 1 && fs.string <= 4, `${tag}: string should be 1..4 (got ${fs.string})`);
    check(fs.finger >= 0 && fs.finger <= 4, `${tag}: finger should be 0..4 (got ${fs.finger})`);
    const openDegree = OPEN_DEGREES[fs.string - 1];
    const open = pitchAtDegree(root, openDegree);
    const expectedLetter = letterOfDiatonic(diatonicOf(open.letter, open.octave) + FINGER_STEPS[fs.finger]);
    const expectedOctave = octaveOfDiatonic(diatonicOf(open.letter, open.octave) + FINGER_STEPS[fs.finger]);
    check(expectedLetter === letter && expectedOctave === octave,
      `${tag}: ${fs.finger === 0 ? 'open' : fs.finger + (fs.finger === 1 ? 'st' : fs.finger === 2 ? 'nd' : fs.finger === 3 ? 'rd' : 'th')} finger on string ${fs.string} of ${id} plays ${expectedLetter}${expectedOctave}, not ${lesson.noteName}`);

    // The degree of the ladder this note belongs to.
    const degree = diatonicOf(letter, octave) - diatonicOf(root.letter, root.octave) + 1;
    check(lesson.degree === degree,
      `${tag}: degree should be ${degree} (got ${lesson.degree})`);
    check(!seenDegrees.has(degree), `${tag}: degree ${degree} is taught twice`);
    seenDegrees.add(degree);

    // The open strings are a fifth apart: degrees 1, 5, 9 and 13.
    if (fs.finger === 0) {
      check(OPEN_DEGREES.indexOf(degree) !== -1,
        `${tag}: an open string should sit on degree 1, 5, 9 or 13 (got ${degree})`);
    }

    if (!lowest || diatonicOf(letter, octave) < lowest.d) lowest = { d: diatonicOf(letter, octave), name: lesson.noteName };
    if (!highest || diatonicOf(letter, octave) > highest.d) highest = { d: diatonicOf(letter, octave), name: lesson.noteName };
  }

  // The range the instrument promises.
  check(lowest && lowest.name === spec.low, `${id} should start on ${spec.low} (got ${lowest && lowest.name})`);
  check(highest && highest.name === spec.high, `${id} should reach ${spec.high} (got ${highest && highest.name})`);
  check(seenNotes.size === spec.notes, `${id} should teach ${spec.notes} different notes`);

  // The first four notes are the open strings, in order.
  const firstFour = noteLessons.slice(0, 4);
  check(firstFour.every(l => l.fingeringState.finger === 0),
    `${id} should open with the four open strings`);
  check(firstFour.every((l, i) => l.fingeringState.string === i + 1),
    `${id} should open with string 1, 2, 3, 4 in turn`);
  check(firstFour.map(l => l.degree).join(',') === '1,5,9,13',
    `${id} should open on degrees 1, 5, 9, 13 (got ${firstFour.map(l => l.degree).join(',')})`);
}

// ── Tunes and reviews ──────────────────────────────────────────────────────
for (const id of INSTRUMENT_ORDER) {
  const inst = CURRICULUM[id];
  const noteLessons = inst.lessons.filter(l => !l.type);
  const byId = {};
  noteLessons.forEach(l => { byId[l.id] = l; });

  // Which degrees have been taught by the end of each step.
  const taughtAfter = [];
  let count = 0;
  inst.lessons.forEach(l => {
    if (!l.type) { count++; taughtAfter[count] = new Set((taughtAfter[count - 1] || new Set()).add(l.degree)); }
  });

  const songs = inst.lessons.filter(l => l.type === 'song');
  const reviews = inst.lessons.filter(l => l.type === 'review');
  check(songs.length === 16, `${id} should offer 16 tunes (got ${songs.length})`);
  check(reviews.length === 3, `${id} should offer 3 reviews (got ${reviews.length})`);

  songs.forEach(song => {
    const canonical = CANONICAL_SONGS[song.noteName];
    check(!!canonical, `${id}: tune "${song.noteName}" should exist in the song catalogue`);
    if (!canonical) return;
    check(Array.isArray(song.noteIds) && song.noteIds.length === canonical.degrees.length,
      `${id}: tune "${song.noteName}" should list one note id per degree`);

    // Every note of the tune is a real lesson, and the right one.
    const degrees = canonical.degrees;
    (song.noteIds || []).forEach((noteId, i) => {
      const lesson = byId[noteId];
      check(!!lesson, `${id}: tune "${song.noteName}" points at unknown lesson ${noteId}`);
      if (lesson) {
        check(lesson.degree === degrees[i],
          `${id}: tune "${song.noteName}" note ${i + 1} should be degree ${degrees[i]} (got ${lesson.degree})`);
      }
    });

    // The tune is only offered once all of its notes have been taught.
    const step = noteLessons.filter(l => inst.lessons.indexOf(l) < inst.lessons.indexOf(song)).length;
    const known = taughtAfter[step] || new Set();
    const missing = degrees.filter(d => !known.has(d));
    check(missing.length === 0,
      `${id}: tune "${song.noteName}" is offered at step ${step} but degrees ${missing.join(',')} are not taught yet`);
  });

  reviews.forEach(review => {
    check(Array.isArray(review.reviewLessonIds) && review.reviewLessonIds.length > 0,
      `${id}: review "${review.noteName}" should list the notes it asks about`);
    (review.reviewLessonIds || []).forEach(id2 => {
      check(!!byId[id2], `${id}: review "${review.noteName}" points at unknown lesson ${id2}`);
    });
  });
}

// ── The tuning itself ──────────────────────────────────────────────────────
// Strings in fifths: each open string is a fifth above the one below it.
for (const id of INSTRUMENT_ORDER) {
  const inst = CURRICULUM[id];
  const root = { letter: inst.rootLetter, octave: inst.rootOctave };
  inst.stringNames.forEach((name, i) => {
    const degree = OPEN_DEGREES[i];
    const pitch = pitchAtDegree(root, degree);
    check(pitch.letter === name,
      `${id}: string ${i + 1} should be tuned to ${name} (got ${pitch.letter})`);
  });
}

// ── Report ─────────────────────────────────────────────────────────────────
console.log(`test-curriculum: ${pass} passed, ${fail} failed`);
if (fail) {
  failures.forEach(f => console.log('  FAIL: ' + f));
  process.exit(1);
}
