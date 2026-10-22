// test-musicxml.js
// Validates the MusicXML export in js/app.js. app.js normally runs in a
// browser, so it is evaluated here with a tiny document/localStorage stub.
// Checks:
//   1. every measure is exactly 4 beats (padding short final measures)
//   2. all <duration> values are positive integers (divisions chosen sanely)
//   3. notes that cross a barline are split with ties between the measures
//   4. the melody's total duration is preserved through the split
//   5. the pitches and the clef written into the file are the ones the
//      instrument actually plays

const fs = require('fs');
const path = require('path');

const read = f => fs.readFileSync(path.join(__dirname, 'js', f), 'utf8');

function makeEl() {
  return {
    textContent: '', innerHTML: '', value: '', style: {}, dataset: {},
    classList: { add() {}, remove() {}, contains() { return false; } },
    appendChild() {}, addEventListener() {}, focus() {}, remove() {},
    querySelector() { return null; }, querySelectorAll() { return []; },
    setAttribute() {}, hasAttribute() { return false; },
  };
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

const sandbox = new Function('document', 'localStorage', 'window', `
${read('curriculum.js')}
${read('graphics.js')}
${read('i18n.js')}
${read('app.js')}
return { exportSongMusicXML, CURRICULUM, APP };
`);
const api = sandbox(document, localStorage, {});

let pass = 0;
let fail = 0;
const failures = [];
function check(cond, msg) {
  if (cond) { pass++; } else { fail++; failures.push(msg); }
}

function divisionsOf(xml) {
  const m = xml.match(/<divisions>(\d+)<\/divisions>/);
  return m ? parseInt(m[1], 10) : 1;
}
function measuresOf(xml) {
  return xml.split('<measure ').slice(1).map(s => s.split('</measure>')[0]);
}
function notesOf(measure) {
  return measure.split('<note>').slice(1).map(s => s.split('</note>')[0]);
}
function durationOf(note) {
  const m = note.match(/<duration>(\d+)<\/duration>/);
  return m ? parseInt(m[1], 10) : null;
}
// Time-advancing notes only: chords sound together, rests do advance.
function beatsInMeasure(measure) {
  return notesOf(measure)
    .filter(n => !n.includes('<chord/>'))
    .reduce((sum, n) => sum + (durationOf(n) || 0), 0);
}
function melodyBeats(xml) {
  return measuresOf(xml)
    .flatMap(notesOf)
    .filter(n => !n.includes('<chord/>') && !n.includes('<rest/>'))
    .reduce((sum, n) => sum + (durationOf(n) || 0), 0);
}
// The melody as written: chord notes, rests and the second half of a tied
// note are left out, so what is left is the tune the student plays.
function pitchesOf(xml) {
  const out = [];
  measuresOf(xml).flatMap(notesOf).forEach(n => {
    if (n.includes('<chord/>') || n.includes('<rest/>') || n.includes('<tie type="stop"/>')) return;
    const m = n.match(/<step>([A-G])<\/step>(?:<alter>-?1<\/alter>)?<octave>(\d+)<\/octave>/);
    if (m) out.push(m[1] + m[2]);
  });
  return out;
}

// ── 1. Every song: integers, full measures, preserved duration ──────────────
const instruments = Object.values(api.CURRICULUM);
let songCount = 0;
for (const inst of instruments) {
  api.APP.instrumentId = inst.id;
  for (const lesson of inst.lessons) {
    if (lesson.type !== 'song') continue;
    songCount++;
    const xml = api.exportSongMusicXML(inst, lesson);
    const divisions = divisionsOf(xml);
    const expected = 4 * divisions;
    const measures = measuresOf(xml);

    // all durations positive integers
    const allDurations = measures.flatMap(notesOf).map(durationOf);
    check(allDurations.every(d => Number.isInteger(d) && d > 0),
      `${inst.id}/${lesson.id} non-integer or zero duration: ${allDurations}`);

    // every measure is a full 4 beats
    measures.forEach((m, i) => {
      check(beatsInMeasure(m) === expected,
        `${inst.id}/${lesson.id} measure ${i + 1} has ${beatsInMeasure(m)} != ${expected}`);
    });

    // melody total preserved
    const total = lesson.durations.reduce((a, b) => a + b, 0);
    check(melodyBeats(xml) === Math.round(total * divisions),
      `${inst.id}/${lesson.id} melody beats ${melodyBeats(xml)} != ${Math.round(total * divisions)}`);

    // The clef in the file is the one the instrument is written in.
    const clef = inst.clef === 'bass' ? '<sign>F</sign><line>4</line>'
      : inst.clef === 'alto' ? '<sign>C</sign><line>3</line>'
      : '<sign>G</sign><line>2</line>';
    check(xml.includes(clef), `${inst.id}/${lesson.id} should be written in ${inst.clef} clef`);

    // The pitches are the notes the instrument actually plays.
    const played = lesson.noteIds.map(id => {
      const l = inst.lessons.find(x => x.id === id);
      return l.noteName;
    });
    const written = pitchesOf(xml);
    check(written.length === played.length && written.every((p, i) => p === played[i]),
      `${inst.id}/${lesson.id} pitches should be ${played.join(' ')} (got ${written.join(' ')})`);
  }
}
check(songCount > 0, 'no songs found to test');

// ── 2. A short final measure is padded with a rest ─────────────────────────
{
  const inst = api.CURRICULUM.violin;
  api.APP.instrumentId = 'violin';
  const synth = { id: 's', type: 'song', noteName: 'Pad', noteIds: ['vl-1'], durations: [1], bpm: 100 };
  const xml = api.exportSongMusicXML(inst, synth);
  const measures = measuresOf(xml);
  check(measures.length === 1, 'padded song should be one measure');
  check(measures[0].includes('<rest/>'), 'short final measure should be padded with a rest');
  check(beatsInMeasure(measures[0]) === 4, 'padded measure should be 4 beats');
}

// ── 3. A note that crosses a barline is split and tied ──────────────────────
{
  const inst = api.CURRICULUM.violin;
  api.APP.instrumentId = 'violin';
  const synth = { id: 's', type: 'song', noteName: 'Tie', noteIds: ['vl-1'], durations: [5], bpm: 100 };
  const xml = api.exportSongMusicXML(inst, synth);
  const measures = measuresOf(xml);
  check(measures.length === 2, 'straddling note should span two measures');
  check(measures[0].includes('<tie type="start"/>'), 'first piece should tie into next measure');
  check(measures[1].includes('<tie type="stop"/>'), 'second piece should tie from previous measure');
  check(measures[0].includes('<tied type="start"/>'), 'first piece should carry tied notation');
  check(beatsInMeasure(measures[0]) === 4 && beatsInMeasure(measures[1]) === 4,
    'both split measures should be 4 beats');
  check(melodyBeats(xml) === 5, 'split melody should preserve its 5 beats');
}

// ── 4. Fractional (eighth-note) durations pick matching divisions ──────────
{
  const inst = api.CURRICULUM.violin;
  api.APP.instrumentId = 'violin';
  const synth = { id: 's', type: 'song', noteName: 'Eighths', noteIds: ['vl-1'], durations: [0.5], bpm: 100 };
  const xml = api.exportSongMusicXML(inst, synth);
  check(divisionsOf(xml) === 2, 'half-beat duration should force divisions >= 2');
  check(beatsInMeasure(measuresOf(xml)[0]) === 8, 'measure should still be a full 4 beats');
}

// ── 5. The cello writes its notes an octave below the violin's ─────────────
{
  const cello = api.CURRICULUM.cello;
  api.APP.instrumentId = 'cello';
  const song = cello.lessons.find(l => l.type === 'song');
  const xml = api.exportSongMusicXML(cello, song);
  const played = song.noteIds.map(id => cello.lessons.find(x => x.id === id).noteName);
  const written = pitchesOf(xml);
  check(written[0] === played[0], `the cello should write ${played[0]} (got ${written[0]})`);
  check(written[0].startsWith('C'), 'the cello starts on its C string');
}

if (failures.length) console.log(failures.join('\n'));
console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
