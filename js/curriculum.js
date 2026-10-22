// curriculum.js
// Instrument and lesson data for Preludio Strings.
//
// A string instrument is not a scale. The four open strings are the
// landmarks; every other note is a left-hand finger stopping one of them.
// This file models that directly instead of pretending a string instrument is
// a series of holes or valves.
//
// degree — a diatonic step counted from the instrument's lowest open string,
//   which is degree 1. Every note an instrument teaches is one rung of that
//   same ladder, so a note's degree is at once its place in the tuning (the
//   open strings land on 1, 5, 9 and 13), its place on the fingerboard, and
//   its scale degree for the shared songs. Every note in the beginner range
//   is a natural, so one ladder serves all three instruments: the violin
//   counts from G, the viola and the cello count from C.
//
// staffStep — position on the staff, counted from the bottom line of the
//   instrument's own clef: 0 = bottom line, +1 = the space above it, and so
//   on. The lines sit on 0, 2, 4, 6 and 8. The treble clef puts E4 on the
//   bottom line, the alto clef F3, and the bass clef G2.
//
// fingeringState — { string, finger } for the left hand.
//   string = 1..4, counted from the lowest string
//     (violin G D A E, viola and cello C G D A)
//   finger = 0 for an open string, 1..4 for the left-hand fingers
//
// freq — concert pitch in Hz (what the app synthesises). Strings are not
//   transposing instruments, so written pitch and sounding pitch agree.

// ── Pitch helpers ──────────────────────────────────────────────────────────
const LETTERS = ['C', 'D', 'E', 'F', 'G', 'A', 'B'];
const LETTER_SEMITONE = { C: 0, D: 2, E: 4, F: 5, G: 7, A: 9, B: 11 };

// Diatonic index with C4 = 0. One step up is +1, so an octave is +7.
function diatonicIndex(letter, octave) {
  return LETTERS.indexOf(letter) + 7 * (octave - 4);
}

function midiFor(letter, octave) {
  return 12 * (octave + 1) + LETTER_SEMITONE[letter];
}

function freqFor(letter, octave) {
  return 440 * Math.pow(2, (midiFor(letter, octave) - 69) / 12);
}

// The pitch that sits on the bottom line of each clef.
const CLEF_BOTTOM_LINE = {
  treble: { letter: 'E', octave: 4 },
  alto: { letter: 'F', octave: 3 },
  bass: { letter: 'G', octave: 2 },
};

function staffStepFor(letter, octave, clef) {
  const anchor = CLEF_BOTTOM_LINE[clef] || CLEF_BOTTOM_LINE.treble;
  return diatonicIndex(letter, octave) - diatonicIndex(anchor.letter, anchor.octave);
}

// Walk the ladder: degree 1 is the root, every degree above it is one
// diatonic step further up.
function ladderPitch(root, degree) {
  const idx = diatonicIndex(root.letter, root.octave) + (degree - 1);
  return {
    letter: LETTERS[((idx % 7) + 7) % 7],
    octave: 4 + Math.floor(idx / 7),
  };
}

// The left hand never moves to a new position in the beginner range, so the
// fingering follows the degree exactly: degrees 1/5/9/13 are the four open
// strings, and everything else is a finger stopping the string below it.
const FINGER_MAP = {
  1:  { string: 1, finger: 0 },
  2:  { string: 1, finger: 1 },
  3:  { string: 1, finger: 2 },
  4:  { string: 1, finger: 3 },
  5:  { string: 2, finger: 0 },
  6:  { string: 2, finger: 1 },
  7:  { string: 2, finger: 2 },
  8:  { string: 2, finger: 3 },
  9:  { string: 3, finger: 0 },
  10: { string: 3, finger: 1 },
  11: { string: 3, finger: 2 },
  12: { string: 3, finger: 3 },
  13: { string: 4, finger: 0 },
  14: { string: 4, finger: 1 },
  15: { string: 4, finger: 2 },
  16: { string: 4, finger: 3 },
  17: { string: 4, finger: 4 },
};

// ── Teaching notes ──────────────────────────────────────────────────────────
// One guide per rung of the ladder, written for every instrument at once.
// {s1}..{s4} are the four string names and {note} is the note itself, so
// the same sentence reads correctly on a violin (G D A E) and on a viola or
// cello (C G D A).
const DEGREE_GUIDES = {
  1: {
    where: 'the open {s1} string, the lowest string on your instrument',
    tip: 'Your very first note, and the left hand stays out of it entirely.',
    do: 'Set the bow on the {s1} string near the frog and draw one slow, even down-bow across the whole string. Listen for a clear, singing tone.',
  },
  2: {
    where: 'your 1st finger on the {s1} string',
    tip: 'A whole step above the open string, and the note your hand plays more than any other in first position.',
    do: 'Drop your 1st finger just behind the nut, a whole step above the open {s1}. Keep the hand rounded and the thumb light.',
  },
  3: {
    where: 'your 2nd finger on the {s1} string',
    tip: 'Another whole step up. Two fingers now carry most of the melody.',
    do: 'Place your 2nd finger a whole step above the 1st. Leave a small gap between the fingers so the hand can stay relaxed.',
  },
  4: {
    where: 'your 3rd finger on the {s1} string',
    tip: 'A half step above the 2nd finger, the closest pair of fingers on the instrument.',
    do: 'Set your 3rd finger a half step above the 2nd. They should almost touch, which is what a relaxed hand looks like.',
  },
  5: {
    where: 'the open {s2} string, and also the note your 4th finger reaches on the {s1} string',
    tip: 'Your second open string, a fifth above the first.',
    do: 'Bow the {s2} string for a ringing open sound, or stretch your 4th finger up to it on the {s1} string. Both give this same note.',
  },
  6: {
    where: 'your 1st finger on the {s2} string',
    tip: 'A whole step above the open {s2}. Your arm travels to the new string; only the fingers move.',
    do: 'Bring the whole hand over to the {s2} string and set the 1st finger a whole step above the open string. Keep the thumb opposite the 1st finger.',
  },
  7: {
    where: 'your 2nd finger on the {s2} string',
    tip: 'A whole step above the 1st finger, the same shape you already know.',
    do: 'Set the 2nd finger a whole step above the 1st on the {s2} string. Copy the spacing you used on the {s1} string.',
  },
  8: {
    where: 'your 3rd finger on the {s2} string',
    tip: 'A half step above the 2nd finger, so this note sits close to the one before it.',
    do: 'Set the 3rd finger a half step above the 2nd on the {s2} string. Slide the hand over without lifting it.',
  },
  9: {
    where: 'the open {s3} string, and also the note your 4th finger reaches on the {s2} string',
    tip: 'Your third open string, another fifth higher.',
    do: 'Bow the {s3} string for an open sound, or reach the 4th finger up to it on the {s2} string. Listen for the same clear tone.',
  },
  10: {
    where: 'your 1st finger on the {s3} string',
    tip: 'A whole step above the open {s3}, in the part of the instrument that sings brightest.',
    do: 'Move the hand to the {s3} string and set the 1st finger a whole step above the open string. Keep the elbow soft.',
  },
  11: {
    where: 'your 2nd finger on the {s3} string',
    tip: 'A whole step above the 1st finger, still comfortably inside the neck.',
    do: 'Set the 2nd finger a whole step above the 1st on the {s3} string. Check that the hand still looks like a relaxed curve.',
  },
  12: {
    where: 'your 3rd finger on the {s3} string',
    tip: 'A half step above the 2nd finger.',
    do: 'Set the 3rd finger a half step above the 2nd on the {s3} string. Bow nearer the fingerboard for a brighter, clearer sound.',
  },
  13: {
    where: 'the open {s4} string, the highest string on your instrument',
    tip: 'Your last open string, and the top of the range every beginner piece lives in.',
    do: 'Bow the {s4} string near the fingerboard for a bright, focused tone. Keep the bow moving even.',
  },
  14: {
    where: 'your 1st finger on the {s4} string',
    tip: 'A whole step above the open {s4}, and the highest note most beginners play.',
    do: 'Move the hand to the {s4} string and set the 1st finger a whole step above the open string. Bow close to the fingerboard.',
  },
  15: {
    where: 'your 2nd finger on the {s4} string',
    tip: 'A whole step above the 1st finger.',
    do: 'Set the 2nd finger a whole step above the 1st on the {s4} string. Use less bow up here, because the string speaks quickly.',
  },
  16: {
    where: 'your 3rd finger on the {s4} string',
    tip: 'A half step above the 2nd finger, and the top of the beginner range.',
    do: 'Set the 3rd finger a half step above the 2nd on the {s4} string. Keep the wrist loose so the bow can still travel.',
  },
  17: {
    where: 'your 4th finger on the {s4} string',
    tip: 'The last finger of first position, and the only note in this range you cannot play on an open string.',
    do: 'Reach the 4th finger up to the {s4} string, a whole step above the 3rd. The hand stretches; the arm stays where it is.',
  },
};

// ── Shared songs ────────────────────────────────────────────────────────────
// Every tune is written once, as a sequence of degrees on the instrument's
// own ladder, so a violin, a viola and a cello all play the same melody
// transposed into their own key. Durations are in beats (1 = quarter,
// 2 = half, 4 = whole).
const CANONICAL_SONGS = {
  'My First Note': {
    degrees: [1, 1, 1, 1, 1, 1],
    durations: [1, 1, 2, 1, 1, 2],
  },
  'Two Open Strings': {
    degrees: [1, 5, 1, 5, 1, 5, 1, 5],
    durations: [1, 1, 1, 1, 1, 1, 1, 2],
  },
  'Three Open Strings': {
    degrees: [1, 5, 9, 5, 1, 5, 9],
    durations: [1, 1, 1, 1, 1, 1, 2],
  },
  'Four Open Strings': {
    degrees: [1, 5, 9, 13, 9, 5, 1],
    durations: [1, 1, 1, 1, 1, 1, 2],
  },
  'Step Up and Down': {
    degrees: [1, 2, 1, 2, 1, 2, 1, 2, 1, 2, 1],
    durations: [1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 2],
  },
  'Hot Cross Buns': {
    degrees: [3, 2, 1, 3, 2, 1, 1, 1, 1, 1, 2, 2, 2, 2, 3, 2, 1],
    durations: [1, 1, 2, 1, 1, 2, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 2],
  },
  'Frere Jacques': {
    degrees: [1, 2, 3, 1, 1, 2, 3, 1, 3, 4, 5, 3, 4, 5],
    durations: [1, 1, 1, 2, 1, 1, 1, 2, 2, 2, 2, 1, 1, 2],
  },
  'Merrily We Roll Along': {
    degrees: [3, 2, 1, 2, 3, 3, 3, 2, 2, 2, 3, 3, 3, 3, 2, 1, 2, 3, 3, 3, 2, 2, 3, 2, 1],
    durations: [1, 1, 1, 1, 1, 1, 2, 1, 1, 2, 1, 1, 1, 2, 1, 1, 1, 1, 1, 2, 1, 1, 1, 1, 2],
  },
  'Lightly Row': {
    degrees: [5, 3, 3, 4, 2, 2, 1, 2, 3, 4, 5, 5, 5, 5, 3, 3, 4, 2, 2, 1, 3, 5, 5, 1],
    durations: [1, 1, 2, 1, 1, 2, 1, 1, 1, 1, 1, 1, 2, 1, 1, 2, 1, 1, 1, 2, 2, 1, 1, 2],
  },
  'Long, Long Ago': {
    degrees: [5, 5, 3, 3, 4, 4, 2, 2, 3, 3, 1, 1, 2, 5, 5],
    durations: [1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 2],
  },
  'Twinkle Twinkle Little Star': {
    degrees: [1, 1, 5, 5, 6, 6, 5, 4, 4, 3, 3, 2, 2, 1],
    durations: [1, 1, 1, 1, 1, 1, 2, 1, 1, 1, 1, 1, 1, 2],
  },
  'Ode to Joy': {
    degrees: [3, 3, 4, 5, 5, 4, 3, 2, 1, 1, 2, 3, 3, 2, 2],
    durations: [1, 1, 1, 2, 1, 1, 1, 2, 1, 1, 1, 2, 1, 1, 2],
  },
  'Jingle Bells': {
    degrees: [3, 3, 3, 3, 3, 3, 3, 5, 1, 2, 3, 4, 4, 4, 4, 4, 3, 3, 3, 3, 2, 2, 3, 2, 1],
    durations: [1, 1, 2, 1, 1, 2, 1, 1, 1, 1, 1, 1, 1, 1, 2, 1, 1, 1, 1, 2, 1, 1, 1, 1, 2],
  },
  'Row, Row, Row Your Boat': {
    degrees: [1, 1, 1, 2, 3, 1, 1, 1, 2, 3, 1, 1, 1, 5, 5, 4, 4, 3, 3, 2, 2, 1],
    durations: [1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 2],
  },
  'Yankee Doodle': {
    degrees: [5, 5, 1, 1, 2, 2, 1, 5, 5, 1, 1, 2, 2, 1, 5, 5, 1, 1, 5, 5, 2, 2, 1, 7, 7, 6, 6, 5, 5, 4],
    durations: [1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 2],
  },
  'Minuet in G': {
    degrees: [5, 1, 1, 2, 3, 4, 5, 5, 4, 5, 4, 3, 2, 3, 1, 2, 3, 4, 3, 2, 1, 2],
    durations: [1, 1, 1, 1, 1, 1, 1, 2, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 2],
  },
};

// A short, friendly description and a playing prompt for each tune.
const SONG_META = {
  'My First Note': {
    description: 'Six strokes on one note, so you can feel how a down-bow and an up-bow sound different.',
    prompt: 'Play one bow stroke per note. Let the last one ring for its full length.',
  },
  'Two Open Strings': {
    description: 'Your first two open strings, trading places. This is what crossing strings feels like.',
    prompt: 'Move the bow to the new string before the note starts, not during it.',
  },
  'Three Open Strings': {
    description: 'Your first three open strings in one little phrase.',
    prompt: 'Keep each string ringing for its full length. Do not rush the change.',
  },
  'Four Open Strings': {
    description: 'All four open strings, lowest to highest. This is the whole instrument in one tune.',
    prompt: 'Check each string before you start. A clean open string sounds like a bell.',
  },
  'Step Up and Down': {
    description: 'A step up and a step back down, again and again, on your lowest string.',
    prompt: 'Keep the fingers close to the nut and the bow moving smoothly.',
  },
  'Hot Cross Buns': {
    description: 'A classic English nursery rhyme using your first three notes.',
    prompt: 'The tune repeats, so let the pattern settle in before you worry about the bow.',
  },
  'Frere Jacques': {
    description: 'Brother John, the French round every beginner strings player learns first.',
    prompt: 'Play the first two lines twice, then answer with the next two.',
  },
  'Merrily We Roll Along': {
    description: 'The tune behind "Mary Had a Little Lamb", walking down and back up.',
    prompt: 'Keep every step even. Listen for the repeating pattern.',
  },
  'Lightly Row': {
    description: 'A traditional folk melody that steps up and down your first five notes.',
    prompt: 'Take it slowly. Listen for the stepwise motion across the string.',
  },
  'Long, Long Ago': {
    description: 'An old English folk song, and one of the first pieces every string player learns.',
    prompt: 'Let the last note ring. There is no rush to get to the end.',
  },
  'Twinkle Twinkle Little Star': {
    description: 'The best-known tune in music, now on your instrument.',
    prompt: 'Most of it sits on your lowest string, so keep the hand still and the bow even.',
  },
  'Ode to Joy': {
    description: 'Beethoven would have approved. A simple tune that climbs and settles back down.',
    prompt: 'The last two notes repeat, so hold them long and even.',
  },
  'Jingle Bells': {
    description: 'The winter song, in the key your instrument plays most easily.',
    prompt: 'Count the bars in your head before you start. Steady is faster.',
  },
  'Row, Row, Row Your Boat': {
    description: 'A round for the whole class, and a good tune for a steady bow.',
    prompt: 'Keep the pulse even all the way to the final note.',
  },
  'Yankee Doodle': {
    description: 'An old American marching tune, and a first for playing a longer phrase.',
    prompt: 'Play it like a march: even notes, and no stopping between the phrases.',
  },
  'Minuet in G': {
    description: 'The first piece in Leopold Mozart\'s notebook, and the traditional first concert piece for a young string player.',
    prompt: 'It is a dance, so keep the beat buoyant and the bow light.',
  },
};

// Which tune lands after which step of the teaching order. The order is the
// same shape on all three instruments, so one schedule covers them all.
const PROGRESSION_SCHEDULE = {
  1:  { songs: ['My First Note'] },
  2:  { songs: ['Two Open Strings'] },
  3:  { songs: ['Three Open Strings'] },
  4:  { songs: ['Four Open Strings'] },
  5:  { songs: ['Step Up and Down'] },
  6:  { songs: ['Hot Cross Buns'] },
  7:  { songs: ['Frere Jacques'] },
  8:  { songs: ['Merrily We Roll Along'] },
  9:  { songs: ['Lightly Row'] },
  10: { songs: ['Long, Long Ago'] },
  11: { songs: ['Twinkle Twinkle Little Star'] },
  12: { songs: ['Ode to Joy'] },
  13: { songs: ['Jingle Bells'] },
  14: { songs: ['Row, Row, Row Your Boat'] },
  15: { songs: ['Yankee Doodle'] },
  16: { songs: ['Minuet in G'] },
};

// Review sessions, placed after the notes they look back on.
const REVIEW_SCHEDULE = {
  8:  { name: 'Review 1', count: 7 },
  13: { name: 'Review 2', count: 12 },
  16: { name: 'Review 3', count: 15 },
};

// ── Instrument specifications ───────────────────────────────────────────────
const STRING_SPECS = {
  violin: {
    id: 'violin',
    prefix: 'vl',
    name: 'Violin',
    shortName: 'Violin',
    clef: 'treble',
    fingeringType: 'strings',
    family: 'strings',
    accentColor: '#F2C24E',
    available: true,
    root: { letter: 'G', octave: 3 },
    stringNames: ['G', 'D', 'A', 'E'],
    order: [1, 5, 9, 13, 2, 3, 4, 6, 7, 8, 10, 11, 12, 14, 15, 16],
  },
  viola: {
    id: 'viola',
    prefix: 'va',
    name: 'Viola',
    shortName: 'Viola',
    clef: 'alto',
    fingeringType: 'strings',
    family: 'strings',
    accentColor: '#C98AFF',
    available: true,
    root: { letter: 'C', octave: 3 },
    stringNames: ['C', 'G', 'D', 'A'],
    order: [1, 5, 9, 13, 2, 3, 4, 6, 7, 8, 10, 11, 12, 14, 15, 16, 17],
  },
  cello: {
    id: 'cello',
    prefix: 'vc',
    name: 'Cello',
    shortName: 'Cello',
    clef: 'bass',
    fingeringType: 'strings',
    family: 'strings',
    accentColor: '#5FC9E8',
    available: true,
    root: { letter: 'C', octave: 2 },
    stringNames: ['C', 'G', 'D', 'A'],
    order: [1, 5, 9, 13, 2, 3, 4, 6, 7, 8, 10, 11, 12, 14, 15, 16, 17],
  },
};

// ── Lesson builder ──────────────────────────────────────────────────────────
// Fill {note} and {s1}..{s4} into a guide sentence.
function fillTemplate(text, vars) {
  return String(text).replace(/\{(\w+)\}/g, (m, key) => (
    Object.prototype.hasOwnProperty.call(vars, key) ? String(vars[key]) : m
  ));
}

function buildInstrument(spec) {
  const lessons = [];
  const noteByDegree = {};
  const noteLessons = [];

  // 1. The note lessons, in teaching order.
  spec.order.forEach((degree, i) => {
    const pitch = ladderPitch(spec.root, degree);
    const fingering = FINGER_MAP[degree];
    const guide = DEGREE_GUIDES[degree];
    const noteName = pitch.letter + pitch.octave;
    const vars = {
      note: noteName,
      s1: spec.stringNames[0],
      s2: spec.stringNames[1],
      s3: spec.stringNames[2],
      s4: spec.stringNames[3],
    };
    const descTmpl = '{note} — ' + guide.where + '. ' + guide.tip;
    const lesson = {
      id: `${spec.prefix}-${i + 1}`,
      degree,
      noteName,
      octave: pitch.octave,
      staffStep: staffStepFor(pitch.letter, pitch.octave, spec.clef),
      accidental: null,
      freq: Math.round(freqFor(pitch.letter, pitch.octave) * 100) / 100,
      fingeringState: { string: fingering.string, finger: fingering.finger },
      stringNumber: fingering.string,
      finger: fingering.finger,
      // The text is kept as a template plus its values so the translation
      // layer can swap the template and fill it in afterwards.
      descriptionTmpl: descTmpl,
      promptTmpl: guide.do,
      description: fillTemplate(descTmpl, vars),
      prompt: fillTemplate(guide.do, vars),
      vars,
    };
    noteLessons.push(lesson);
    noteByDegree[degree] = lesson.id;
    lessons.push(lesson);
  });

  // 2. The tunes and the reviews, slotted in after the step they belong to.
  const scheduled = [];
  spec.order.forEach((degree, i) => {
    const step = i + 1;
    const sched = PROGRESSION_SCHEDULE[step];
    if (sched) {
      for (const name of sched.songs || []) {
        if (!CANONICAL_SONGS[name]) continue;
        const meta = SONG_META[name] || {};
        scheduled.push({
          step,
          id: `${spec.prefix}-song-${name.toLowerCase().replace(/[^a-z0-9]+/g, '-')}`,
          type: 'song',
          noteName: name,
          degree: null,
          audioUrl: null,
          bpm: 100,
          descriptionTmpl: meta.description || '',
          promptTmpl: meta.prompt || '',
          description: meta.description || '',
          prompt: meta.prompt || '',
          vars: {},
        });
      }
    }
    const review = REVIEW_SCHEDULE[step];
    if (review) {
      const earlier = noteLessons.slice(0, review.count).map(l => l.id);
      scheduled.push({
        step,
        id: `${spec.prefix}-review-${review.name.toLowerCase().replace(/\s+/g, '-')}`,
        type: 'review',
        noteName: review.name,
        degree: null,
        reviewLessonIds: earlier,
        description: `Mix up your first ${earlier.length} notes and check that they have stuck.`,
        prompt: 'Take your time. A wrong answer just means you get to play that note again.',
      });
    }
  });

  // 3. Interleave: the note first, then whatever belongs after it.
  const merged = [];
  spec.order.forEach((degree, i) => {
    merged.push(noteLessons[i]);
    const due = scheduled.filter(s => s.step === i + 1);
    due.forEach(s => merged.push(s));
  });

  return {
    id: spec.id,
    name: spec.name,
    shortName: spec.shortName,
    clef: spec.clef,
    fingeringType: spec.fingeringType,
    family: spec.family,
    accentColor: spec.accentColor,
    available: spec.available,
    rootLetter: spec.root.letter,
    rootOctave: spec.root.octave,
    stringNames: spec.stringNames.slice(),
    lessons: merged,
    noteByDegree,
  };
}

const CURRICULUM = {};
for (const id of Object.keys(STRING_SPECS)) {
  CURRICULUM[id] = buildInstrument(STRING_SPECS[id]);
}

// Resolve every song's degrees into the note ids of its own instrument, so a
// melody can never drift away from the notes that instrument actually teaches.
for (const inst of Object.values(CURRICULUM)) {
  const ordered = inst.lessons.filter(l => !l.type && l.degree != null);
  for (const lesson of inst.lessons) {
    if (lesson.type !== 'song') continue;
    const song = CANONICAL_SONGS[lesson.noteName];
    if (!song) continue;
    const idFor = d => {
      if (d === 'FIRST') return (ordered[0] || {}).id;
      if (d === 'SECOND') return (ordered[1] || {}).id;
      return inst.noteByDegree[String(d)];
    };
    const noteIds = song.degrees.map(idFor).filter(Boolean);
    lesson.noteIds = noteIds;
    lesson.durations = song.durations.slice();
    lesson.prerequisiteIds = [...new Set(noteIds)];
  }
}

// Ordered list for the home screen.
const INSTRUMENT_ORDER = ['violin', 'viola', 'cello'];
