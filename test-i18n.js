// test-i18n.js
// Checks the Brazilian Portuguese layer: every string the strings app can put
// in front of a student must have a translation, and the translated text must
// keep the placeholders the templates rely on.

const fs = require('fs');
const path = require('path');

const read = f => fs.readFileSync(path.join(__dirname, 'js', f), 'utf8');

const sandbox = new Function(`
${read('curriculum.js')}
${read('i18n.js')}
return { CURRICULUM, TRANSLATIONS, t, tFill, getLang, setLang, LANG_STORAGE_KEY };
`);
const api = sandbox();

let pass = 0;
let fail = 0;
const failures = [];
function check(cond, msg) {
  if (cond) { pass++; } else { fail++; failures.push(msg); }
}

const pt = api.TRANSLATIONS.pt;
check(!!pt && Object.keys(pt).length > 0, 'the PT dictionary should not be empty');

// ── 1. Every note guide, tune and card label is translated ──────────────────
const missing = [];
for (const inst of Object.values(api.CURRICULUM)) {
  for (const lesson of inst.lessons) {
    for (const key of ['descriptionTmpl', 'promptTmpl']) {
      const tmpl = lesson[key];
      if (!tmpl) continue;
      if (!(tmpl in pt)) missing.push(`${inst.id}/${lesson.id} ${key}: ${tmpl.slice(0, 48)}…`);
    }
  }
}
check(missing.length === 0, `these strings have no PT translation:\n    ${missing.join('\n    ')}`);

// ── 2. The translations keep the placeholders ───────────────────────────────
for (const inst of Object.values(api.CURRICULUM)) {
  for (const lesson of inst.lessons) {
    for (const key of ['descriptionTmpl', 'promptTmpl']) {
      const tmpl = lesson[key];
      if (!tmpl || !(tmpl in pt)) continue;
      const wanted = (tmpl.match(/\{(\w+)\}/g) || []).sort();
      const got = (pt[tmpl].match(/\{(\w+)\}/g) || []).sort();
      check(wanted.join(',') === got.join(','),
        `${inst.id}/${lesson.id} ${key}: the translation must keep the placeholders ${wanted.join(' ')} (got ${got.join(' ')})`);
    }
  }
}

// ── 3. The first-sound guide and the fingering legend are translated ────────
{
  const app = read('app.js');
  // The strings guide and the finger legend both live in app.js; pull their
  // English text out of the source so the check follows the real content.
  const firstSound = /const FIRST_SOUND_CONTENT = \{[\s\S]*?strings: \{([\s\S]*?)\n  \},\n/.exec(app);
  check(!!firstSound, 'the first-sound guide should live in app.js');
  if (firstSound) {
    // The emoji is decoration, not something to translate.
    const strings = [...firstSound[1].matchAll(/'((?:[^'\\]|\\.)*)'/g)]
      .map(m => m[1])
      .filter(s => !/^\p{Extended_Pictographic}+$/u.test(s));
    check(strings.length >= 8, `the strings guide should have several lines (got ${strings.length})`);
    const notTranslated = strings.filter(s => !(s in pt));
    check(notTranslated.length === 0,
      `these first-sound lines have no PT translation:\n    ${notTranslated.join('\n    ')}`);
  }

  const legend = /const FINGERING_HELP = \{([\s\S]*?)\n\};/.exec(app);
  check(!!legend, 'the fingering legend should live in app.js');
  if (legend) {
    const labels = [...legend[1].matchAll(/label: '((?:[^'\\]|\\.)*)'/g)].map(m => m[1]);
    const texts = [...legend[1].matchAll(/text: '((?:[^'\\]|\\.)*)'/g)].map(m => m[1]);
    check(labels.length === 6 && texts.length === 6,
      `the legend should explain six things (got ${labels.length} labels, ${texts.length} texts)`);
    const notTranslated = labels.concat(texts).filter(s => !(s in pt));
    check(notTranslated.length === 0,
      `these legend lines have no PT translation:\n    ${notTranslated.join('\n    ')}`);
  }
}

// ── 4. The finger card labels are translated ────────────────────────────────
for (const label of ['Finger card', 'String', 'String number', 'Finger', 'Position', 'Open string',
  '{name} string', 'String {n}', 'Finger {n}', '1st position']) {
  check(label in pt, `"${label}" should be translated`);
}

// ── 5. The instrument names are translated ──────────────────────────────────
for (const name of ['Violin', 'Viola', 'Cello']) {
  check(name in pt, `"${name}" should be translated`);
}

// ── 6. The language layer behaves ───────────────────────────────────────────
{
  const sandboxWithStorage = new Function('localStorage', `
    ${read('curriculum.js')}
    ${read('i18n.js')}
    return { t, tFill, getLang, setLang, LANG, TRANSLATIONS };
  `);
  const store = {};
  const api2 = sandboxWithStorage({
    getItem(k) { return k in store ? store[k] : null; },
    setItem(k, v) { store[k] = String(v); },
    removeItem(k) { delete store[k]; },
  });

  api2.setLang('pt');
  check(api2.getLang() === 'pt', 'setLang switches the language');
  check(store[api.LANG_STORAGE_KEY] === 'pt', 'the chosen language is remembered');
  check(api2.t('Finger card') === 'Cartão de dedos', 'a translated string comes back translated');
  check(api2.t('Not in the dictionary') === 'Not in the dictionary', 'an unknown string is left alone');

  // A template is translated first and filled in afterwards.
  const tmpl = Object.keys(pt).find(k => k.includes('{name} string'));
  check(!!tmpl, 'the dictionary should hold a template with a placeholder');
  if (tmpl) {
    const filled = api2.tFill(tmpl, { name: 'Sol' });
    check(filled.includes('Sol') && !filled.includes('{name}'),
      `the template should be filled in (got "${filled}")`);
    check(filled !== tmpl, 'the translated template should differ from the English one');
  }

  api2.setLang('en');
  check(api2.t('Finger card') === 'Finger card', 'switching back to English restores the original');
}

if (failures.length) console.log(failures.join('\n'));
console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
