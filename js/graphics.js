// graphics.js
// Generates all visual elements as inline SVG strings — no image assets.
// Three families: staff notation, fingering diagrams, and the home-screen
// instrument icon set (a small custom line-icon system).

const Graphics = (() => {

  const HALF = 8;           // px per diatonic staff step
  const STAFF_SPACE = 2 * HALF; // px between two adjacent staff lines
  const STAFF_BOTTOM_Y = 140; // y of pos0 (E4, bottom line)
  const STAFF_LEFT_X = 30;
  const STAFF_RIGHT_X = 105;

  // Diagram palette — resolved from CSS custom properties so the same markup
  // renders as bright ink on dark panels and dark ink on white "paper".
  const INK = 'var(--dg-ink)';              // staff lines, clef, strong outlines
  const INK_DIM = 'var(--dg-ink-dim)';      // decorative joints, connectors, labels
  const HOUSING = 'var(--dg-housing)';      // instrument body / tube / casing fill
  const HOUSING_EDGE = 'var(--dg-housing-edge)';
  const OPEN = 'var(--dg-open)';            // open hole / vent interior

  function yForPos(pos) { return STAFF_BOTTOM_Y - pos * HALF; }

  // Ledger lines are drawn for the line positions between the staff and the
  // notehead, never past it: a note in a space hangs off the last line above
  // it (G3 needs C4 and A3, not an extra line at F3 under the head).
  function ledgerPositions(pos) {
    const out = [];
    if (pos > 8) {
      const maxL = (pos % 2 === 0) ? pos : pos - 1;
      for (let p = 10; p <= maxL; p += 2) out.push(p);
    } else if (pos < -1) {
      const minL = (pos % 2 === 0) ? pos : pos + 1;
      for (let p = -2; p >= minL; p -= 2) out.push(p);
    }
    return out;
  }

  // ── CLEF GLYPHS ──────────────────────────────────────────────────────────
  // Every clef has a "reference line" that must land on one specific staff
  // position: the treble clef's spiral sits on the G line, the bass clef's two
  // dots straddle the F line, and the alto clef's arrow heads point at the
  // middle line (that is what makes it an alto clef).
  //
  // The glyphs come from Apple Symbols (U+1D11E, U+1D121, U+1D122), so their
  // metrics are measured from that font and expressed in em: `height` and
  // `width` are the ink size, `xMin` the left side bearing, and `refEm` how far
  // the reference line sits above the text baseline. The baseline is then
  // derived from the reference line, so a clef always points at the right note
  // instead of relying on a hard-coded baseline.
  //
  // Sizes follow the engraved standard: a G clef is 7.02 staff spaces tall and
  // the C and F clefs are 5.26 (SMuFL proportions), not the thumbnail-sized
  // glyphs the diagram used to draw.
  // topEm / bottomEm say how far the ink reaches above and below the text
  // baseline, so a caller can keep the glyph inside its viewBox.
  const CLEF_GLYPH = {
    treble: { refPos: 2, code: 119070, height: 0.730, width: 0.275, xMin: 0.0300, refEm: 0.199,  topEm: 0.655, bottomEm: 0.075 },
    alto:   { refPos: 4, code: 119073, height: 0.677, width: 0.470, xMin: 0.0325, refEm: 0.3346, topEm: 0.677, bottomEm: 0.000 },
    bass:   { refPos: 6, code: 119074, height: 0.640, width: 0.527, xMin: 0.0325, refEm: 0.4511, topEm: 0.656, bottomEm: -0.016 },
  };
  const CLEF_SPACES = { treble: 7.02, alto: 5.26, bass: 5.26 };

  function clefFontSize(clef, space) {
    const g = CLEF_GLYPH[clef] || CLEF_GLYPH.treble;
    return CLEF_SPACES[clef] * space / g.height;
  }

  // `fs` for the default single-note staff (four spaces tall).
  const CLEF_METRICS = {};
  Object.keys(CLEF_GLYPH).forEach(clef => {
    CLEF_METRICS[clef] = Object.assign({}, CLEF_GLYPH[clef], { fs: clefFontSize(clef, STAFF_SPACE) });
  });

  // `yRef` is the y of the clef's reference line on the staff; the baseline is
  // derived from it so the clef always points at the right note.
  function clefText(clef, { x, yRef, fs = null, color = INK }) {
    const m = CLEF_METRICS[clef] || CLEF_METRICS.treble;
    const size = fs || m.fs;
    const baseline = yRef + m.refEm * size;
    return `<text x="${x.toFixed(1)}" y="${baseline.toFixed(1)}" font-size="${size.toFixed(1)}" font-family="'Apple Symbols', 'Noto Music', 'Segoe UI Symbol', serif" fill="${color}">&#${m.code};</text>`;
  }

  // Draw a clef with its left ink edge at `left`, so the horizontal placement
  // is the same for every glyph regardless of its side bearing.
  function clefAt(clef, left, space, yRef, color) {
    const g = CLEF_GLYPH[clef] || CLEF_GLYPH.treble;
    const fs = clefFontSize(clef, space);
    return clefText(clef, { x: left - g.xMin * fs, yRef, fs, color });
  }

  // Where each clef's ink starts. The notehead sits to the right of the clef,
  // so the bass clef (the widest) still clears it.
  const CLEF_STAFF_LEFT = { treble: 20, alto: 8, bass: 4 };
  const CLEF_MELODY_LEFT = { treble: 18, alto: 18, bass: 18 };

  // ── STAFF NOTATION ──────────────────────────────────────────────────────
  function staffSVG({ pos, accidental = null, clef = 'treble', accentColor = 'var(--accent-warm)', width = 130 }) {
    // Nudged right of centre so the full-size clef on the left has room.
    const noteX = (STAFF_LEFT_X + STAFF_RIGHT_X) / 2 + 22;
    const noteY = yForPos(pos);
    const stemUp = pos <= 4;
    const lineColor = INK;
    const renderH = width * (220 / 130);

    let svg = `<svg viewBox="0 0 130 220" width="${width}" height="${renderH}" xmlns="http://www.w3.org/2000/svg">`;

    // Staff lines
    for (let i = 0; i <= 8; i += 2) {
      const y = yForPos(i);
      svg += `<line x1="${STAFF_LEFT_X}" y1="${y}" x2="${STAFF_RIGHT_X}" y2="${y}" stroke="${lineColor}" stroke-width="1.5"/>`;
    }

    // Clef glyph — positioned from the clef's own reference line so the
    // treble, alto and bass clefs all sit on the right staff line.
    const clefName = CLEF_GLYPH[clef] ? clef : 'treble';
    const cmet = CLEF_GLYPH[clefName];
    svg += clefAt(clefName, CLEF_STAFF_LEFT[clefName],
      STAFF_SPACE, yForPos(cmet.refPos), lineColor);

    // Ledger lines
    ledgerPositions(pos).forEach(p => {
      const y = yForPos(p);
      svg += `<line x1="${noteX - 12}" y1="${y}" x2="${noteX + 12}" y2="${y}" stroke="${lineColor}" stroke-width="1.5"/>`;
    });

    // Accidental
    if (accidental) {
      svg += `<text x="${noteX - 24}" y="${noteY + 6}" font-size="22" fill="${accentColor}" font-family="Georgia, serif">${accidental}</text>`;
    }

    // Notehead (filled ellipse, slightly tilted). A dark ring separates it from
    // the bright staff lines so the pitch still reads at thumbnail sizes.
    svg += `<ellipse cx="${noteX}" cy="${noteY}" rx="7.5" ry="5.5" fill="${accentColor}" stroke="${OPEN}" stroke-width="1.5" transform="rotate(-18 ${noteX} ${noteY})"/>`;

    // Stem
    if (stemUp) {
      svg += `<line x1="${noteX + 7}" y1="${noteY}" x2="${noteX + 7}" y2="${noteY - 46}" stroke="${accentColor}" stroke-width="2"/>`;
    } else {
      svg += `<line x1="${noteX - 7}" y1="${noteY}" x2="${noteX - 7}" y2="${noteY + 46}" stroke="${accentColor}" stroke-width="2"/>`;
    }

    svg += `</svg>`;
    return svg;
  }

  // ── MELODY STAFF (a whole tune on one or more systems) ──────────────────
  // `notes` is a list of { pos, accidental, duration } where duration is in
  // beats (1 = quarter, 2 = half, 4 = whole; anything past a whole note is
  // drawn as a whole). The note value is engraved — halves and wholes get an
  // open (hollow) notehead, wholes drop the stem — so the written rhythm
  // matches what the tune actually plays.
  //
  // The tune is laid out in common time (4/4): bar lines fall every four beats
  // and a "4/4" signature is drawn after the clef. When the melody's total is
  // not a whole number of bars, the opening beats are treated as an anacrusis
  // (pickup), so bar lines straddle no note and the final bar is complete.
  //
  // The note at `highlightIndex` is drawn in the accent colour with a soft halo
  // so the tune reads like sheet music with the student's current note called
  // out; the rest stay in ink.
  function melodySVG({ notes = [], highlightIndex = -1, clef = 'treble', accentColor = 'var(--accent-warm)', width = 320, perSystem = 6, beatsPerBar = 4 }) {
    if (!notes.length) return '';
    const VB_W = 360;
    // A full-size treble clef stands 7 staff spaces tall and reaches about a
    // space and a half below the staff, so each system needs room for it.
    const SYSTEM_H = 120;
    const TOP_LINE_Y = 24;
    const sigX = 100;          // time signature, centred
    const leftX = 120;         // first note sits past the clef + time signature
    const lineStartX = 16;
    const rightX = VB_W - 14;
    const systems = [];
    for (let i = 0; i < notes.length; i += perSystem) systems.push(notes.slice(i, i + perSystem));
    const VB_H = systems.length * SYSTEM_H + 8;
    const renderH = width * (VB_H / VB_W);

    // Cumulative beats consumed through each note, plus the pickup length, so
    // bar lines can be placed on the beats that are true bar boundaries.
    const durs = notes.map(n => (typeof n.duration === 'number' && n.duration > 0 ? n.duration : 1));
    const cum = [];
    durs.reduce((acc, d) => { const v = acc + d; cum.push(v); return v; }, 0);
    const totalBeats = cum[cum.length - 1];
    const pickup = totalBeats % beatsPerBar;
    const isBarBoundary = g => {
      if (g >= notes.length - 1) return false;      // never after the last note
      const c = cum[g];
      return c > 0 && (c - pickup) % beatsPerBar === 0;
    };

    let svg = `<svg viewBox="0 0 ${VB_W} ${VB_H}" width="${width}" height="${renderH.toFixed(1)}" xmlns="http://www.w3.org/2000/svg">`;

    systems.forEach((systemNotes, s) => {
      const topLineY = TOP_LINE_Y + s * SYSTEM_H;
      const y = pos => topLineY + (8 - pos) * HALF;

      for (let p = 0; p <= 8; p += 2) {
        svg += `<line x1="${lineStartX}" y1="${y(p)}" x2="${rightX}" y2="${y(p)}" stroke="${INK}" stroke-width="1.3"/>`;
      }
      const clefName = CLEF_GLYPH[clef] ? clef : 'treble';
      const cmet = CLEF_GLYPH[clefName];
      svg += clefAt(clefName, CLEF_MELODY_LEFT[clefName], STAFF_SPACE, y(cmet.refPos), INK);
      // Time signature: "4" over "4" centred on the middle of the staff.
      if (s === 0) {
        svg += `<text x="${sigX}" y="${y(4) - 1}" font-size="26" font-weight="700" text-anchor="middle" font-family="Georgia, serif" fill="${INK}">${beatsPerBar}</text>`;
        svg += `<text x="${sigX}" y="${y(2) + 15}" font-size="26" font-weight="700" text-anchor="middle" font-family="Georgia, serif" fill="${INK}">4</text>`;
      }

      const spacing = (rightX - leftX) / systemNotes.length;
      systemNotes.forEach((note, k) => {
        const g = s * perSystem + k;
        const x = leftX + spacing * (k + 0.5);
        const noteY = y(note.pos);
        const lit = g === highlightIndex;
        const color = lit ? accentColor : INK;
        const duration = durs[g];
        const open = duration >= 2;                       // half and longer: hollow
        const stemmed = duration < 4;                     // whole notes lose the stem

        // Bar line just before this note when the previous note ended a bar.
        if (k > 0 && isBarBoundary(g - 1)) {
          const bx = x - spacing / 2;
          svg += `<line x1="${bx}" y1="${y(8)}" x2="${bx}" y2="${y(0)}" stroke="${INK}" stroke-width="1.3"/>`;
        }

        if (lit) svg += `<circle cx="${x}" cy="${noteY}" r="13" fill="${accentColor}" opacity="0.18"/>`;
        ledgerPositions(note.pos).forEach(p => {
          svg += `<line x1="${x - 10}" y1="${y(p)}" x2="${x + 10}" y2="${y(p)}" stroke="${color}" stroke-width="1.3"/>`;
        });
        if (note.accidental) {
          svg += `<text x="${x - 15}" y="${noteY + 5}" font-size="18" fill="${color}" font-family="Georgia, serif">${note.accidental}</text>`;
        }
        // Hollow noteheads read clearly against the staff, so they skip the dark
        // separating ring a filled head needs; both keep the same rotation.
        const headFill = open ? 'none' : color;
        const headStroke = open ? color : OPEN;
        const headStrokeW = open ? 1.8 : 1.2;
        svg += `<ellipse cx="${x}" cy="${noteY}" rx="6.2" ry="4.6" fill="${headFill}" stroke="${headStroke}" stroke-width="${headStrokeW}" transform="rotate(-18 ${x} ${noteY})"/>`;
        if (stemmed) {
          const stemUp = note.pos <= 4;
          const stemX = stemUp ? x + 6 : x - 6;
          const stemEnd = stemUp ? noteY - 34 : noteY + 34;
          svg += `<line x1="${stemX}" y1="${noteY}" x2="${stemX}" y2="${stemEnd}" stroke="${color}" stroke-width="1.6"/>`;
        }
      });

      // Closing bar line at the end of the tune.
      if (s === systems.length - 1) {
        svg += `<line x1="${rightX}" y1="${y(8)}" x2="${rightX}" y2="${y(0)}" stroke="${INK}" stroke-width="1.3"/>`;
      }
    });

    svg += `</svg>`;
    return svg;
  }

  function fingeringSVG(fingeringType, fingeringState, accentColor, size = 130, extra = {}) {
    return stringFingeringSVG(fingeringState, { ...extra, accentColor, size });
  }

  // ── STRING FINGERBOARD DIAGRAM ───────────────────────────────────────────
  // A miniature of the neck seen from the player's side: the nut is at the
  // top, the four strings run down the board, and a marker shows where the
  // finger lands. A filled disc is a finger stopping the string; a hollow
  // ring sitting on the nut is the string played open.
  //
  // The rows follow real string spacing — a whole step from the nut to the
  // 1st finger, another whole step to the 2nd, a half step to the 3rd, and a
  // whole step to the 4th — so the picture doubles as a spacing reference.
  function stringFingeringSVG(fingeringState, { stringNames = [], accentColor = 'var(--accent-warm)', size = 130 } = {}) {
    const st = fingeringState || {};
    const stringNo = Math.min(Math.max(parseInt(st.string, 10) || 1, 1), 4);
    const fingerNo = Math.min(Math.max(parseInt(st.finger, 10) || 0, 0), 4);

    const BOARD_X = 36, BOARD_W = 58, BOARD_TOP = 32, BOARD_BOTTOM = 196;
    const NUT_TOP = 24, NUT_H = 8, NUT_CY = NUT_TOP + NUT_H / 2;
    const STRING_X = [45, 58, 71, 84];
    const STRING_W = [3.2, 2.7, 2.2, 1.8];
    const FINGER_Y = [NUT_CY, 70, 112, 133, 175];
    const activeX = STRING_X[stringNo - 1];

    let svg = `<svg viewBox="0 0 130 208" width="${size}" height="${(size * 208 / 130).toFixed(1)}" xmlns="http://www.w3.org/2000/svg">`;

    // Fingerboard
    svg += `<rect x="${BOARD_X}" y="${BOARD_TOP}" width="${BOARD_W}" height="${BOARD_BOTTOM - BOARD_TOP}" rx="7" fill="${HOUSING}" stroke="${HOUSING_EDGE}" stroke-width="1.5"/>`;

    // Position bracket: every row shown is first position.
    const midY = (NUT_CY + FINGER_Y[4]) / 2;
    svg += `<path d="M 30 ${NUT_CY} L 24 ${NUT_CY} L 24 ${FINGER_Y[4]} L 30 ${FINGER_Y[4]}" fill="none" stroke="${INK_DIM}" stroke-width="1.5"/>`;
    svg += `<text x="16" y="${midY}" font-size="11" fill="${INK_DIM}" text-anchor="middle" transform="rotate(-90 16 ${midY})">1st position</text>`;

    // Strings — the one being played is lit, the rest stay quiet.
    STRING_X.forEach((x, i) => {
      const active = i === stringNo - 1;
      svg += `<line x1="${x}" y1="${NUT_CY}" x2="${x}" y2="${BOARD_BOTTOM - 4}" stroke="${active ? accentColor : INK_DIM}" stroke-width="${active ? STRING_W[i] + 1.2 : STRING_W[i]}"/>`;
    });

    // Nut
    svg += `<rect x="${BOARD_X - 4}" y="${NUT_TOP}" width="${BOARD_W + 8}" height="${NUT_H}" rx="2.5" fill="${HOUSING_EDGE}"/>`;

    // String names above the nut
    stringNames.slice(0, 4).forEach((nm, i) => {
      if (!nm) return;
      const active = i === stringNo - 1;
      svg += `<text x="${STRING_X[i]}" y="16" font-size="13" font-weight="700" text-anchor="middle" fill="${active ? accentColor : INK_DIM}">${nm}</text>`;
    });

    // Where the other fingers sit on this string, for reference. Every marker
    // is tappable, so tapping a finger number explains what that finger does.
    for (let f = 1; f <= 4; f++) {
      if (f === fingerNo) continue;
      svg += `<circle cx="${activeX}" cy="${FINGER_Y[f]}" r="6" fill="none" stroke="${INK_DIM}" stroke-width="1.2"/>`;
      svg += `<text class="fingering-key" data-action="fingering-key" data-key="${f}" x="${activeX}" y="${FINGER_Y[f] + 3}" font-size="8" text-anchor="middle" fill="${INK_DIM}">${f}</text>`;
    }

    // The marker.
    if (fingerNo === 0) {
      svg += `<circle class="fingering-key" data-action="fingering-key" data-key="O" cx="${activeX}" cy="${NUT_CY}" r="9" fill="${OPEN}" stroke="${accentColor}" stroke-width="3"/>`;
    } else {
      svg += `<circle cx="${activeX}" cy="${FINGER_Y[fingerNo]}" r="9" fill="${accentColor}" stroke="${OPEN}" stroke-width="1.5"/>`;
      svg += `<text class="fingering-key" data-action="fingering-key" data-key="${fingerNo}" x="${activeX}" y="${FINGER_Y[fingerNo] + 3.4}" font-size="10" font-weight="700" text-anchor="middle" fill="${OPEN}">${fingerNo}</text>`;
    }

    svg += `</svg>`;
    return svg;
  }

  // ── INSTRUMENT ICON SET (home screen) ───────────────────────────────────
  // Consistent line-icon language: currentColor stroke, 64x64 viewBox.
  function instrumentIconSVG(id, size = 56) {
    const s = (inner) => `<svg viewBox="0 0 64 64" width="${size}" height="${size}" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round" xmlns="http://www.w3.org/2000/svg">${inner}</svg>`;

    switch (id) {
      case 'violin':
        return s(`
          <circle cx="32" cy="7" r="3.6"/>
          <path d="M28.6 10.4 L28.6 17 M35.4 10.4 L35.4 17"/>
          <circle cx="24.5" cy="13" r="2"/>
          <circle cx="39.5" cy="13" r="2"/>
          <path d="M32 25 C25 25 21 30 23 35 C20 37 20 43 24 44 C22 50 25 57 32 57 C39 57 42 50 40 44 C44 43 44 37 41 35 C43 30 39 25 32 25 Z"/>
          <line x1="26" y1="36" x2="38" y2="36"/>
          <path d="M27.5 30 q-2 4 0 8"/>
          <path d="M36.5 30 q2 4 0 8"/>
        `);
      case 'viola':
        // Same family as the violin but a broader body — the viola is the
        // bigger of the two, and the shape difference reads at icon size.
        return s(`
          <circle cx="32" cy="6" r="3.6"/>
          <path d="M28.6 9.4 L28.6 17 M35.4 9.4 L35.4 17"/>
          <circle cx="23.5" cy="12.5" r="2"/>
          <circle cx="40.5" cy="12.5" r="2"/>
          <path d="M32 22 C23 22 18 29 21 35 C17 37.5 17 45 22 46 C19 52 23 60 32 60 C41 60 45 52 42 46 C47 45 47 37.5 43 35 C46 29 41 22 32 22 Z"/>
          <line x1="24" y1="35" x2="40" y2="35"/>
          <path d="M27 29 q-2.5 4.5 0 9"/>
          <path d="M37 29 q2.5 4.5 0 9"/>
        `);
      case 'cello':
        return s(`
          <circle cx="32" cy="6" r="3.8"/>
          <path d="M28.4 9.4 L28.4 18 M35.6 9.4 L35.6 18"/>
          <circle cx="24" cy="13" r="2"/>
          <circle cx="40" cy="13" r="2"/>
          <path d="M32 19 C22 19 16 27 19 33 C14 36 14 45 20 46 C16 52 22 58 32 58 C42 58 48 52 44 46 C50 45 50 36 45 33 C48 27 42 19 32 19 Z"/>
          <line x1="23" y1="35" x2="41" y2="35"/>
          <path d="M27 29 q-2.5 4 0 8"/>
          <path d="M37 29 q2.5 4 0 8"/>
          <line x1="32" y1="58" x2="32" y2="62"/>
        `);
      default:
        return s(`<circle cx="32" cy="32" r="20"/>`);
    }
  }

  return { staffSVG, melodySVG, fingeringSVG, stringFingeringSVG, instrumentIconSVG, yForPos, ledgerPositions, clefText, CLEF_METRICS, CLEF_GLYPH, CLEF_SPACES, clefFontSize, CLEF_STAFF_LEFT, CLEF_MELODY_LEFT };
})();
