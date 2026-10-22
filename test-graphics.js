// test-graphics.js
// Renders every fingering and staff diagram in js/graphics.js and checks the
// SVG output is well-formed. Also pins the design decisions that matter for
// string playing: where the clef points, where the finger marker lands, and
// which string is lit.

const fs = require('fs');
const path = require('path');

const read = f => fs.readFileSync(path.join(__dirname, 'js', f), 'utf8');

const sandbox = new Function(`
${read('curriculum.js')}
${read('graphics.js')}
return { Graphics, CURRICULUM };
`);
const { Graphics, CURRICULUM } = sandbox();

let pass = 0;
let fail = 0;
const failures = [];
function check(cond, msg) {
  if (cond) { pass++; } else { fail++; failures.push(msg); }
}
function isSvg(s) {
  return typeof s === 'string' && s.startsWith('<svg') && s.endsWith('</svg>');
}
// Every circle must sit inside the diagram's viewBox, otherwise a marker can
// be clipped at the edges.
function circlesWithinViewBox(svg) {
  const vb = svg.match(/viewBox="0 0 (\d+(?:\.\d+)?) (\d+(?:\.\d+)?)"/);
  if (!vb) return false;
  const [, w, h] = vb.map(Number);
  const re = /<circle cx="(-?\d+(?:\.\d+)?)" cy="(-?\d+(?:\.\d+)?)" r="(\d+(?:\.\d+)?)"/g;
  let m;
  while ((m = re.exec(svg))) {
    const [cx, cy, r] = [Number(m[1]), Number(m[2]), Number(m[3])];
    if (cx - r < -0.01 || cy - r < -0.01 || cx + r > w + 0.01 || cy + r > h + 0.01) return false;
  }
  return true;
}

// The fingerboard geometry, mirrored from js/graphics.js so the tests check
// the picture rather than repeat the drawing code.
const FINGERBOARD = {
  strings: [45, 58, 71, 84],
  nutCentre: 28,
  rows: [28, 70, 112, 133, 175],   // index 0 = the nut, 1..4 = the fingers
};

const SIZES = [46, 72, 84, 100, 120];
let diagrams = 0;

// ── Every note of every instrument renders ─────────────────────────────────
for (const inst of Object.values(CURRICULUM)) {
  for (const lesson of inst.lessons) {
    if (!lesson.fingeringState) continue;
    for (const size of SIZES) {
      const svg = Graphics.fingeringSVG(inst.fingeringType, lesson.fingeringState, inst.accentColor, size, { stringNames: inst.stringNames });
      diagrams++;
      check(isSvg(svg), `${inst.id}/${lesson.id} fingering @${size} is not valid SVG`);
      check(!svg.includes('undefined') && !svg.includes('NaN'),
        `${inst.id}/${lesson.id} fingering @${size} contains undefined/NaN`);
      check(circlesWithinViewBox(svg),
        `${inst.id}/${lesson.id} fingering @${size} has a marker outside its viewBox`);
    }
    const staff = Graphics.staffSVG({ pos: lesson.staffStep, accidental: lesson.accidental, clef: inst.clef, accentColor: inst.accentColor, width: 96 });
    check(isSvg(staff), `${inst.id}/${lesson.id} staff is not valid SVG`);
    check(!staff.includes('undefined') && !staff.includes('NaN'),
      `${inst.id}/${lesson.id} staff contains undefined/NaN`);
  }
}
check(diagrams > 0, 'no fingering diagrams rendered');

// ── The fingerboard shows the right finger on the right string ─────────────
for (const inst of Object.values(CURRICULUM)) {
  for (const lesson of inst.lessons) {
    if (!lesson.fingeringState) continue;
    const fs = lesson.fingeringState;
    const svg = Graphics.stringFingeringSVG(fs, { stringNames: inst.stringNames, accentColor: inst.accentColor, size: 120 });
    const tag = `${inst.id}/${lesson.id}`;

    // The marker sits on the string being played, at the row of the finger.
    const wantX = FINGERBOARD.strings[fs.string - 1];
    const wantY = FINGERBOARD.rows[fs.finger];
    const markers = [...svg.matchAll(/<circle[^>]*cx="([\d.]+)"[^>]*cy="([\d.]+)"[^>]*r="9"/g)]
      .map(m => [Number(m[1]), Number(m[2])]);
    const active = markers.filter(([x, y]) => Math.abs(x - wantX) < 0.5 && Math.abs(y - wantY) < 0.5);
    check(active.length === 1 && markers.length === 1,
      `${tag}: exactly one marker should sit on string ${fs.string} at row ${fs.finger} (expected ${wantX},${wantY}; got ${JSON.stringify(markers)})`);

    // The lit string is drawn in the accent colour; the others stay quiet.
    const lit = [...svg.matchAll(/<line x1="([\d.]+)" y1="[\d.]+" x2="[\d.]+" y2="[\d.]+" stroke="([^"]+)"/g)]
      .filter(m => m[1] === String(wantX));
    check(lit.length === 1 && lit[0][2] === inst.accentColor,
      `${tag}: the string being played should be drawn in the accent colour`);

    // The string names sit above the nut.
    inst.stringNames.forEach((name, i) => {
      check(svg.includes(`>${name}</text>`), `${tag}: the diagram should name the ${name} string`);
    });

    // The position bracket is there.
    check(svg.includes('1st position'), `${tag}: the diagram should mark first position`);
  }
}
check(diagrams > 0, 'no fingerboard diagrams rendered');

// ── An open string is marked on the nut, a stopped note at a finger row ────
{
  const open = Graphics.stringFingeringSVG({ string: 1, finger: 0 }, { stringNames: ['G', 'D', 'A', 'E'], accentColor: '#F2C24E', size: 120 });
  check(open.includes(`cx="${FINGERBOARD.strings[0]}" cy="${FINGERBOARD.nutCentre}" r="9" fill="var(--dg-open)"`),
    'an open string should be a hollow ring sitting on the nut');
  check(open.includes('data-key="O"'), 'the open string marker is tappable');
  const stopped = Graphics.stringFingeringSVG({ string: 2, finger: 3 }, { stringNames: ['G', 'D', 'A', 'E'], accentColor: '#F2C24E', size: 120 });
  check(stopped.includes(`cx="${FINGERBOARD.strings[1]}" cy="${FINGERBOARD.rows[3]}" r="9" fill="#F2C24E"`),
    'a stopped note should be a filled disc on the finger row');
  check(stopped.includes('>3</text>'), 'the marker should carry the finger number');
  // The other fingers are shown as faint reference dots.
  const faint = (stopped.match(/r="6" fill="none"/g) || []).length;
  check(faint === 3, `the three unused finger positions should be shown (got ${faint})`);
  // On an open string all four finger positions stay as reference dots.
  const faintOpen = (open.match(/r="6" fill="none"/g) || []).length;
  check(faintOpen === 4, `an open string should show all four finger positions (got ${faintOpen})`);
}

// ── The clefs point where they should ──────────────────────────────────────
// Each clef has a reference line that must land on one staff position: the
// treble clef's spiral on the G line, the alto clef's arrow heads on the
// middle line, the bass clef's dots around the F line.
{
  check(Graphics.CLEF_METRICS.treble.refPos === 2, 'the treble clef should point at the G line');
  check(Graphics.CLEF_METRICS.alto.refPos === 4, 'the alto clef should point at the middle line');
  check(Graphics.CLEF_METRICS.bass.refPos === 6, 'the bass clef should point at the F line');
  check(Graphics.CLEF_METRICS.treble.code === 119070, 'the treble clef glyph is U+1D11E');
  check(Graphics.CLEF_METRICS.alto.code === 119073, 'the alto clef glyph is U+1D121');
  check(Graphics.CLEF_METRICS.bass.code === 119074, 'the bass clef glyph is U+1D122');

  // The clef's baseline is derived from its reference line, not hard-coded.
  const staff = Graphics.staffSVG({ pos: 4, clef: 'alto', accentColor: '#F2C24E', width: 130 });
  check(staff.includes('&#119073;'), 'the staff should draw the alto clef');
  const y = Number((staff.match(/<text[^>]*y="([\d.]+)"[^>]*>&#119073;<\/text>/) || [])[1]);
  const expected = 108 + Graphics.CLEF_METRICS.alto.refEm * Graphics.CLEF_METRICS.alto.fs;
  check(Math.abs(y - expected) < 0.6, `the alto clef should be placed from the middle line (expected y≈${expected.toFixed(1)}, got ${y})`);

  const melody = Graphics.melodySVG({ notes: [{ pos: 4, duration: 1 }], clef: 'bass', accentColor: '#5FC9E8' });
  check(melody.includes('&#119074;'), 'the melody staff should draw the bass clef');
}

// ── Ledger lines stop at the notehead ──────────────────────────────────────
// A note in a space hangs off the last line above it; nothing is drawn past
// the head. G3, the violin's first note, is the space under the A3 ledger
// line, so it gets C4 and A3 — not an extra line at F3 underneath.
{
  const cases = [
    [-2, [-2]], [-3, [-2]], [-4, [-2, -4]], [-5, [-2, -4]], [-6, [-2, -4, -6]],
    [-1, []], [0, []], [8, []], [9, []], [10, [10]], [11, [10]], [12, [10, 12]],
  ];
  for (const [pos, want] of cases) {
    const got = Graphics.ledgerPositions(pos);
    check(JSON.stringify(got) === JSON.stringify(want),
      `pos ${pos} should have ledger lines ${JSON.stringify(want)}, got ${JSON.stringify(got)}`);
  }

  const g3 = Graphics.staffSVG({ pos: -5, clef: 'treble', accentColor: '#F2C24E', width: 130 });
  const ledgerYs = [...g3.matchAll(/<line x1="[\d.]+" y1="([\d.]+)" x2="[\d.]+" y2="[\d.]+" stroke="var\(--dg-ink\)" stroke-width="1.5"\/>/g)]
    .map(m => Number(m[1]));
  // Staff lines sit on 140..76; the ledger lines are the ones below 140.
  const below = ledgerYs.filter(y => y > 140).sort((a, b) => a - b);
  check(JSON.stringify(below) === JSON.stringify([156, 172]),
    `G3 should get exactly the C4 and A3 ledger lines (got y=${JSON.stringify(below)})`);

  const noteY = 140 - (-5) * 8;
  check(!below.some(y => y > noteY), 'G3 should not have a ledger line under the notehead');
}

// ── Home-screen icons render for every instrument ──────────────────────────
for (const inst of Object.values(CURRICULUM)) {
  const icon = Graphics.instrumentIconSVG(inst.id, 56);
  check(isSvg(icon), `${inst.id} home icon is not valid SVG`);
  check(!icon.includes('undefined'), `${inst.id} home icon contains undefined`);
}
{
  // Each string instrument gets its own outline, and the cello is the only one
  // with an endpin.
  const violin = Graphics.instrumentIconSVG('violin', 56);
  const viola = Graphics.instrumentIconSVG('viola', 56);
  const cello = Graphics.instrumentIconSVG('cello', 56);
  check(violin !== viola && viola !== cello && violin !== cello,
    'the three string instruments should have their own icons');
  check(cello.includes('y1="58" x2="32" y2="62"'), 'the cello icon should have an endpin');
  check(!violin.includes('y2="62"'), 'the violin icon should not have an endpin');
}

// ── Melody staff draws every note, wraps, and highlights one ───────────────
{
  const notes = [
    { pos: -2, accidental: null }, { pos: -1, accidental: null },
    { pos: 0, accidental: null }, { pos: 1, accidental: '♭' },
    { pos: 2, accidental: null }, { pos: 3, accidental: null },
    { pos: 4, accidental: null }, { pos: 5, accidental: null },
  ];
  const svg = Graphics.melodySVG({ notes, highlightIndex: 3, clef: 'treble', accentColor: '#e0a020', width: 320 });
  check(isSvg(svg), 'melody staff is valid SVG');
  const heads = (svg.match(/<ellipse/g) || []).length;
  check(heads === notes.length, `melody staff should draw one notehead per note (got ${heads})`);
  const systems = (svg.match(/<text[^>]*>&#1190(70|74);<\/text>/g) || []).length;
  check(systems >= 2, 'a melody longer than one system wraps onto more staves');
  check(svg.includes('#e0a020'), 'the highlighted note uses the accent colour');
  check(svg.includes('♭'), 'an accidental note prints its accidental');
  check(!svg.includes('undefined') && !svg.includes('NaN'), 'melody staff contains no undefined/NaN');
  check(Graphics.melodySVG({ notes: [], highlightIndex: 0 }) === '', 'an empty melody renders nothing');
}

// ── Melody staff engraves note values (quarter / half / whole) ─────────────
{
  const heads = svg => (svg.match(/<ellipse/g) || []).length;
  const headAt = (svg, i) => (svg.match(/<ellipse[^>]*>/g) || [])[i];
  const stems = svg => (svg.match(/<line x1="[^"]*" y1="[^"]*" x2="[^"]*" y2="[^"]*" stroke="var\(--dg-ink\)" stroke-width="1.6"\/>/g) || []).length;
  const notes = [
    { pos: 0, accidental: null, duration: 1 },
    { pos: 2, accidental: null, duration: 2 },
    { pos: 4, accidental: null, duration: 4 },
  ];
  const svg = Graphics.melodySVG({ notes, accentColor: '#e0a020' });
  check(heads(svg) === 3, 'three-notes of mixed values draw three heads');
  check((headAt(svg, 0) || '').includes('fill="var(--dg-ink)"'), 'a quarter note is a filled notehead');
  check(!(headAt(svg, 1) || '').includes('fill="var(--dg-ink)"') && (headAt(svg, 1) || '').includes('fill="none"'), 'a half note is a hollow notehead');
  check(!(headAt(svg, 2) || '').includes('fill="var(--dg-ink)"') && (headAt(svg, 2) || '').includes('fill="none"'), 'a whole note is a hollow notehead');
  check(stems(svg) === 2, `quarter and half notes carry stems, whole does not (got ${stems(svg)})`);
  check(Graphics.melodySVG({ notes: [{ pos: 0 }] }).includes('fill="var(--dg-ink)"'), 'a note without a duration defaults to a filled quarter note');
}

// ── Melody staff shows 4/4 and places bar lines on the beats ───────────────
{
  const barLines = svg => {
    const lines = svg.match(/<line x1="([\d.]+)" y1="([\d.]+)" x2="([\d.]+)" y2="([\d.]+)" stroke="var\(--dg-ink\)" stroke-width="1.3"\/>/g) || [];
    return lines.filter(l => {
      const m = l.match(/x1="([\d.]+)" y1="([\d.]+)" x2="([\d.]+)" y2="([\d.]+)"/);
      return m[1] === m[3] && m[2] !== m[4];
    }).length;
  };
  const q = n => Array.from({ length: n }, () => ({ pos: 2, accidental: null, duration: 1 }));
  const sig = Graphics.melodySVG({ notes: q(8), accentColor: '#e0a020' });
  check(sig.includes('>4</text>'), 'the 4/4 time signature is drawn');
  const sigTexts = (sig.match(/>4<\/text>/g) || []).length;
  check(sigTexts === 2, `the time signature shows two 4s (got ${sigTexts})`);
  check(barLines(sig) === 2, `8 quarter notes in 4/4 draw 2 bar lines (got ${barLines(sig)})`);
  check(barLines(Graphics.melodySVG({ notes: q(4), accentColor: '#e0a020' })) === 1,
    'a one-bar tune draws only the closing bar line');
  check(barLines(Graphics.melodySVG({ notes: q(3), accentColor: '#e0a020' })) === 1,
    'an incomplete pickup bar draws only the closing bar line');
  check(barLines(Graphics.melodySVG({ notes: q(5), accentColor: '#e0a020' })) === 2,
    'a 1-beat pickup plus a full bar draws one interior bar line');
  const half = [{ pos: 2, duration: 1 }, { pos: 2, duration: 1 }, { pos: 2, duration: 1 }, { pos: 2, duration: 2 }];
  check(barLines(Graphics.melodySVG({ notes: half, accentColor: '#e0a020' })) === 2,
    'a half note is never split by a bar line');
}

if (failures.length) console.log(failures.join('\n'));
console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
