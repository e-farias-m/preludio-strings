// i18n.js — Brazilian Portuguese translation layer for Preludio Strings.
// Loaded before app.js. Exposes globals: LANG, TRANSLATIONS, t, setLang,
// getLang, initLang, applyI18nToDOM.

const LANG_STORAGE_KEY = 'preludioStringsLang';
const OVERRIDE_STORAGE_KEY = 'preludioStringsLangOverrides';

// Default language: browser locale (pt* -> 'pt', else 'en').
function detectDefaultLang() {
  try {
    const saved = localStorage.getItem(LANG_STORAGE_KEY);
    if (saved === 'pt' || saved === 'en' || saved === 'fr') return saved;
  } catch (e) {}
  try {
    const nav = (typeof navigator !== 'undefined' && (navigator.language || navigator.userLanguage)) || 'en';
    if (/^pt/i.test(nav)) return 'pt';
    if (/^fr/i.test(nav)) return 'fr';
  } catch (e) {}
  return 'en';
}

var LANG = detectDefaultLang();

// Translation tables. 'en' is identity (source strings). 'pt' holds PT-BR.
var TRANSLATIONS = { en: {}, pt: {}, fr: {} };

var NOTE_TO_SOLFEGE_PT = {
  'C': 'Dó', 'C#': 'Dó#', 'Cb': 'Sib', 'Db': 'Réb', 'D': 'Ré', 'D#': 'Ré#', 'Eb': 'Mib',
  'E': 'Mi', 'F': 'Fá', 'F#': 'Fá#', 'Gb': 'Solb', 'G': 'Sol', 'G#': 'Sol#', 'Ab': 'Láb',
  'A': 'Lá', 'A#': 'Lá#', 'Bb': 'Sib', 'B': 'Si'
};

function noteToSolfeggio(str) {
  if (typeof str !== 'string') return str;
  if (LANG === 'pt') {
    if (/^[A-G][#b]?$/.test(str.trim())) {
      return NOTE_TO_SOLFEGE_PT[str.trim()] || str;
    }
  }
  return str;
}

// User overrides
function getUserOverrides(lang) {
  try {
    const raw = localStorage.getItem(OVERRIDE_STORAGE_KEY + '_' + lang);
    return raw ? JSON.parse(raw) : {};
  } catch (e) { return {}; }
}
function setUserOverride(lang, key, value) {
  try {
    const overrides = getUserOverrides(lang);
    if (value === null || value === '' || value === TRANSLATIONS[lang]?.[key]) {
      delete overrides[key];
    } else {
      overrides[key] = value;
    }
    localStorage.setItem(OVERRIDE_STORAGE_KEY + '_' + lang, JSON.stringify(overrides));
  } catch (e) {}
}
function clearUserOverrides(lang) {
  try { localStorage.removeItem(OVERRIDE_STORAGE_KEY + '_' + lang); } catch (e) {}
}

function t(str) {
  if (typeof str !== 'string') return str;
  const overrides = getUserOverrides(LANG);
  if (Object.prototype.hasOwnProperty.call(overrides, str)) {
    return overrides[str];
  }
  if (LANG === 'pt') {
    if (TRANSLATIONS.pt && Object.prototype.hasOwnProperty.call(TRANSLATIONS.pt, str)) {
      return TRANSLATIONS.pt[str];
    }
    const sol = noteToSolfeggio(str);
    if (sol !== str) return sol;
  }
  if (LANG === 'fr' && TRANSLATIONS.fr && Object.prototype.hasOwnProperty.call(TRANSLATIONS.fr, str)) {
    return TRANSLATIONS.fr[str];
  }
  return str;
}

function tx(str) {
  if (typeof str !== 'string' || LANG === 'en') return str;
  const trimmed = str.trim();
  if (!trimmed) return str;
  const dict = TRANSLATIONS[LANG] || {};
  if (dict[trimmed]) return str.replace(trimmed, dict[trimmed]);
  return str;
}

// Translate a template and then fill in its {placeholders}. Translations come
// first so a translated template can reorder the placeholders the way the
// language wants them.
function tFill(template, vars) {
  const text = t(template);
  if (typeof text !== 'string') return text;
  if (!vars) return text;
  return text.replace(/\{(\w+)\}/g, (m, key) => (
    Object.prototype.hasOwnProperty.call(vars, key) ? String(vars[key]) : m
  ));
}

function getLang() { return LANG; }
function setLang(lang) {
  if (lang !== 'pt' && lang !== 'en' && lang !== 'fr') return;
  LANG = lang;
  try { localStorage.setItem(LANG_STORAGE_KEY, lang); } catch (e) {}
  if (typeof render === 'function') render();
  applyI18nToDOM();
}
function initLang() {
  LANG = detectDefaultLang();
}

// Apply translations to static DOM nodes tagged with data-i18n.
function applyI18nToDOM() {
  try {
    document.querySelectorAll('[data-i18n]').forEach(el => {
      const key = el.getAttribute('data-i18n');
      if (key) {
        const val = t(key);
        if (el.tagName === 'INPUT' || el.tagName === 'TEXTAREA') {
          if (el.placeholder !== undefined && el.getAttribute('data-i18n-attr') === 'placeholder') el.placeholder = val;
        } else {
          el.textContent = val;
        }
      }
    });
  } catch (e) {}
}

// Some labels mix fixed words with live numbers ("Note 3 of 8", "Badges · 2/11")
// or with a name that has to be translated too ("Fingering chart · Violino").
// Those are matched by pattern instead of by exact text.
var PT_PATTERNS = [
  [/^(\d+) (mastered|practiced|learning)$/, (m, n, word) =>
    n + ' ' + ({ mastered: 'dominadas', practiced: 'praticadas', learning: 'em aprendizado' }[word] || word)],
  [/^(\d+) of (\d+) notes learned$/, (m, a, b) => a + ' de ' + b + ' notas aprendidas'],
  [/^(\d+)\/(\d+) notes · (\d+)\/(\d+) songs$/, (m, a, b, c, d) =>
    a + '/' + b + ' notas · ' + c + '/' + d + ' músicas'],
  [/^(\d+) min to reach your (\d+)-minute goal$/, (m, a, b) =>
    'Faltam ' + a + ' min para alcançar a sua meta de ' + b + ' min'],
  [/^Badges · (\d+)\/(\d+)$/, (m, a, b) => 'Insígnias · ' + a + '/' + b],
  [/^Lv (\d+)$/, (m, n) => 'Nível ' + n],
  [/^Note (\d+) of (\d+)$/, (m, a, b) => 'Nota ' + a + ' de ' + b],
  [/^Question (\d+) of (\d+)$/, (m, a, b) => 'Pergunta ' + a + ' de ' + b],
  [/^✓ Goal met — (\d+) of (\d+) min!$/, (m, a, b) => '✓ Meta cumprida — ' + a + ' de ' + b + ' min!'],
  [/^(\d+)\/(\d+) correct( — golden ear!)?$/, (m, a, b, golden) =>
    a + '/' + b + ' corretas' + (golden ? ' — ouvido de ouro!' : '')],
  [/^Fingering chart · (.+)$/, (m, inst) => 'Tabela de digitações · ' + t(inst)],
  [/^First sound · (.+)$/, (m, inst) => 'Primeiro som · ' + t(inst)],
  [/^Practice · (.+)$/, (m, inst) => 'Prática · ' + t(inst)],
  [/^Switch to (dark|light) theme$/, (m, mode) =>
    'Mudar para o tema ' + (mode === 'dark' ? 'escuro' : 'claro')],
  [/^← Back to (.+)$/, (m, inst) => '← Voltar para ' + t(inst)],
  [/^Review (.+)$/, (m, what) => 'Revisão ' + what],
  [/^Play (.+)$/, (m, what) => 'Tocar ' + t(what)],
  [/^Finger gym sprint$/, () => 'Sprint de ginásio de dedos'],
  [/^Sight-reading sprint$/, () => 'Sprint de leitura à primeira vista'],
  [/^Ready, (.+)\?$/, (m, name) => 'Pronto, ' + name + '?'],
  [/^Best: (\d+) names · (\d+) fingerings$/, (m, a, b) =>
    'Melhor: ' + a + ' nomes · ' + b + ' digitações'],
  [/^Sounds as concert (.+) \((.+) instrument\)\.$/, (m, note, key) =>
    'Soa como concerts ' + note + ' (instrumento em ' + t(key) + ').'],
];

// Translate the visible text of a rendered screen. The markup is already
// built at this point, so the text nodes are complete strings: each one is
// looked up whole, which leaves numbers, note names and the student's own
// words alone. A handful of labels mix words with live numbers ("Note 3 of
// 8"); those are matched by pattern instead.
function translateHtml(html) {
  if (LANG !== 'pt' || typeof html !== 'string' || !html) return html;
  const table = TRANSLATIONS.pt;
  if (!table) return html;
  const has = k => Object.prototype.hasOwnProperty.call(table, k);

  const translateText = text => {
    if (!text) return text;
    const trimmed = text.trim();
    if (!trimmed) return text;
    if (has(trimmed)) return text.replace(trimmed, table[trimmed]);
    // Solfege conversion for note names
    const sol = noteToSolfeggio(trimmed);
    if (sol !== trimmed) return text.replace(trimmed, sol);
    for (let i = 0; i < PT_PATTERNS.length; i++) {
      const re = PT_PATTERNS[i][0];
      const make = PT_PATTERNS[i][1];
      const hit = re.exec(trimmed);
      if (hit) return text.replace(trimmed, make(hit));
    }
    return text;
  };

  // The text between two tags.
  let out = html.replace(/>([^<>]+)</g, (m, body) => '>' + translateText(body) + '<');
  // The attributes that carry a label. A value can hold two labels joined by
  // a colon ("First Steps: Complete your first lesson"), so each half is
  // translated on its own when the whole value is not in the dictionary.
  out = out.replace(/\s(placeholder|title|aria-label|alt)="([^"]*)"/g, (m, attr, value) => {
    const whole = translateText(value);
    if (whole !== value) return ' ' + attr + '="' + whole + '"';
    const parts = value.split(': ');
    if (parts.length > 1) {
      const joined = parts.map(part => translateText(part)).join(': ');
      if (joined !== value) return ' ' + attr + '="' + joined + '"';
    }
    return m;
  });
  return out;
}

// PT-BR dictionary (curriculum + UI) for Preludio Strings.
// Every note guide, tune, finger card and first-sound step is here.
TRANSLATIONS.pt = {
  "+ Import Song": "+ Importar música",
  "16th": "Semicolcheia",
  "16ths": "Semicolcheias",
  "1st finger": "1º dedo",
  "1st position": "1ª posição",
  "2nd finger": "2º dedo",
  "3rd finger": "3º dedo",
  "4th finger": "4º dedo",
  "8th": "Colcheia",
  "8ths": "Colcheias",
  "A classic English nursery rhyme using your first three notes.": "Uma cantiga de roda clássica inglesa usando as suas três primeiras notas.",
  "A quick guide to your first sound, before note one.": "Um guia rápido do seu primeiro som, antes da primeira nota.",
  "A round for the whole class, and a good tune for a steady bow.": "Uma canonza para a turma toda, e uma boa melodia para um arco constante.",
  "A step up and a step back down, again and again, on your lowest string.": "Um passo para cima e um passo para baixo, de novo e de novo, na sua corda mais baixa.",
  "A traditional folk melody that steps up and down your first five notes.": "Uma melodia folclórica tradicional que sobe e desce suas cinco primeiras notas.",
  "Accent": "Acento",
  "Active days": "Dias ativos",
  "All four open strings, lowest to highest. This is the whole instrument in one tune.": "As quatro cordas abertas, da mais baixa para a mais alta. É o instrumento inteiro em uma música.",
  "An old American marching tune, and a first for playing a longer phrase.": "Uma antiga marcha americana, e a sua primeira frase mais longa.",
  "An old English folk song, and one of the first pieces every string player learns.": "Uma antiga cantiga popular inglesa, e uma das primeiras peças que todo tocador de cordas aprende.",
  "Appearance": "Aparência",
  "Apply your notes": "Aplique as suas notas",
  "Audio": "Áudio",
  "Audio analysis not supported here.": "A análise de áudio não é suportada aqui.",
  "Audio failed to load.": "Não foi possível carregar o áudio.",
  "Back": "Voltar",
  "Back to my path": "Voltar ao meu caminho",
  "Badges": "Insígnias",
  "Beats": "Batidas",
  "Beep": "Bipe",
  "Beethoven would have approved. A simple tune that climbs and settles back down.": "Beethoven teria aprovado. Uma melodia simples que sobe e depois assenta de novo.",
  "Bow and tone reminders before you play.": "Lembretes de arco e de tom antes de tocar.",
  "Bow the {s2} string for a ringing open sound, or stretch your 4th finger up to it on the {s1} string. Both give this same note.": "Arqueie a corda {s2} para um som aberto e ressonante, ou estique o 4º dedo até lá na corda {s1}. As duas opções dão esta mesma nota.",
  "Bow the {s3} string for an open sound, or reach the 4th finger up to it on the {s2} string. Listen for the same clear tone.": "Arqueie a corda {s3} para um som aberto, ou leve o 4º dedo até lá na corda {s2}. Ouça o mesmo tom claro.",
  "Bow the {s4} string near the fingerboard for a bright, focused tone. Keep the bow moving even.": "Arqueie a corda {s4} perto do taco para um som brilhante e focado. Mantenha o arco sempre em movimento.",
  "BPM": "BPM",
  "Bring the whole hand over to the {s2} string and set the 1st finger a whole step above the open string. Keep the thumb opposite the 1st finger.": "Leve a mão inteira até a corda {s2} e coloque o 1º dedo um tom acima da corda aberta. Mantenha o polegar em frente ao 1º dedo.",
  "Brother John, the French round every beginner strings player learns first.": "Irmão João, a canonza francesa que todo iniciante de cordas aprende primeiro.",
  "Build speed": "Ganhe velocidade",
  "Call & response": "Pergunta e resposta",
  "Cello": "Violoncelo",
  "Check each string before you start. A clean open string sounds like a bell.": "Confira cada corda antes de começar. Uma corda aberta limpa soa como um sino.",
  "Check your pitch against the floating tuner.": "Confirme a sua afinação no afinador flutuante.",
  "Chord": "Acorde",
  "Clear all lesson progress and XP for all instruments. This cannot be undone.": "Apaga todo o progresso das aulas e o XP de todos os instrumentos. Não dá para desfazer.",
  "Click": "Clique",
  "Click sound": "Som do clique",
  "Complete a song": "Complete uma música",
  "Complete your first lesson": "Complete a sua primeira aula",
  "Continue": "Continuar",
  "Continue to quiz": "Continuar para o quiz",
  "Copy failed — try Print instead.": "Não foi possível copiar — tente Imprimir.",
  "Copy recap": "Copiar o resumo",
  "Copy summary": "Copiar o resumo",
  "Could not access the microphone.": "Não foi possível acessar o microfone.",
  "Could not play the recording.": "Não foi possível tocar a gravação.",
  "Count the bars in your head before you start. Steady is faster.": "Conte os compassos na cabeça antes de começar. Constante é mais rápido.",
  "Count-in": "Contagem",
  "Count-in…": "Contagem…",
  "Daily practice (minutes)": "Prática diária (minutos)",
  "Day streak": "Dias seguidos",
  "Delete imported song": "Excluir música importada",
  "Delete recording": "Excluir a gravação",
  "Dim": "Dim.",
  "Done": "Pronto",
  "Dot": "Ponto",
  "Draw the bow slowly across the string, like a sawing motion. Listen for a smooth, singing tone.": "Puxe o arco lentamente pela corda, como quem serra. Ouça um tom liso e cantado.",
  "Drop your 1st finger just behind the nut, a whole step above the open {s1}. Keep the hand rounded and the thumb light.": "Coloque o 1º dedo logo atrás da cravelha, um tom acima da {s1} aberta. Mantenha a mão arredondada e o polegar leve.",
  "Each new note shows its name, sound, and fingering. Tap “Hear it,” then answer a quick check to lock the note in.": "Cada nota nova mostra o nome, o som e a digitação. Toque em “Ouvir” e depois responda a uma pergunta rápida para fixar a nota.",
  "Ear training": "Treino auditivo",
  "Earn 500 XP": "Ganhe 500 XP",
  "Echo a phrase by ear, note for note": "Devolva uma frase de ouvido, nota por nota",
  "Error reading file.": "Erro ao ler o arquivo.",
  "Export MusicXML": "Exportar MusicXML",
  "Faster": "Mais rápido",
  "Finger": "Dedo",
  "Finger card": "Cartão de dedos",
  "Finger gym": "Ginásio de dedos",
  "Finger {n}": "Dedo {n}",
  "Fingering": "Digitação",
  "Fingering chart": "Tabela de digitações",
  "Finish a couple of lessons to unlock the timed drills.": "Termine um par de aulas para liberar os exercícios cronometrados.",
  "Finish a full practice plan": "Termine um plano de prática inteiro",
  "First notes, first wins.": "Primeiras notas, primeiras vitórias.",
  "First Song": "Primeira Música",
  "First sound": "Primeiro som",
  "First Steps": "Primeiros Passos",
  "Focus areas": "Pontos de atenção",
  "Follow your lesson path": "Siga o seu caminho de aulas",
  "Four Open Strings": "Quatro Cordas Abertas",
  "Frere Jacques": "Frère Jacques",
  "Full Octave": "Oitava Completa",
  "Get ready...": "Prepare-se...",
  "Getting there — keep practicing!": "Quase lá — continue praticando!",
  "Goal Getter": "Cumpridor de Metas",
  "Golden Ear": "Ouvido de Ouro",
  "Got it — let\u2019s play!": "Entendi — vamos tocar!",
  "Hear a short phrase, then echo it back — by ear.": "Ouça uma frase curta e devolva nota por nota, de ouvido.",
  "Hear a target note": "Ouça uma nota de referência",
  "Hear it": "Ouvir",
  "Hear the model": "Ouvir o modelo",
  "Hide for now": "Esconder por agora",
  "Hide weekly progress": "Esconder o progresso da semana",
  "Hold the instrument on your left shoulder and let it sit there — do not let it float or press it under your chin.": "Apoie o instrumento no seu ombro esquerdo e deixe-o ali — não deixe ele flutuar nem apertá-lo embaixo do queixo.",
  "Hot Cross Buns": "Hot Cross Buns",
  "I played it!": "Eu toquei!",
  "Import error: ": "Erro de importação: ",
  "Imported \"{name}\"": "Importada \"{name}\"",
  "Imported from MusicXML.": "Importada de um MusicXML.",
  "Imported Song": "Música importada",
  "in tune ✓": "no tom ✓",
  "Instruments": "Instrumentos",
  "Invalid XML: ": "XML inválido: ",
  "It is a dance, so keep the beat buoyant and the bow light.": "É uma dança, então mantenha o compasso saltitante e o arco leve.",
  "Jingle Bells": "Jingle Bells",
  "Keep each string ringing for its full length. Do not rush the change.": "Deixe cada corda soar pelo tempo todo. Não apresse a mudança.",
  "Keep every step even.": "Mantenha cada passo uniforme.",
  "Keep every step even. Listen for the repeating pattern.": "Mantenha cada passo uniforme. Ouça o padrão que se repete.",
  "Keep it fresh": "Mantenha em dia",
  "Keep the fingers close to the nut and the bow moving smoothly.": "Mantenha os dedos perto da cravelha e o arco deslizando com suavidade.",
  "Keep the pulse even all the way to the final note.": "Mantenha o pulso uniforme até a última nota.",
  "Language": "Idioma",
  "Learn": "Aprender",
  "Learn 2 notes to unlock timed drills.": "Aprenda 2 notas para liberar os exercícios cronometrados.",
  "Learn a couple of notes first.": "Aprenda um par de notas primeiro.",
  "Learn all 8 notes on an instrument": "Aprenda todas as 8 notas de um instrumento",
  "Learn two notes to unlock ear training.": "Aprenda duas notas para liberar o treino auditivo.",
  "Lesson complete!": "Aula concluída!",
  "Let the last note ring. There is no rush to get to the end.": "Deixe a última nota soar. Não há pressa para chegar ao fim.",
  "Level": "Nível",
  "Lightly Row": "Lightly Row",
  "Listen back, then compare with the model.": "Ouça de volta e depois compare com o modelo.",
  "Listening for": "Ouvindo",
  "Listening…": "Ouvindo…",
  "Long, Long Ago": "Long, Long Ago",
  "Look up any note's fingering and sound.": "Consulte a digitação e o som de qualquer nota.",
  "Make your first sound": "Faça o seu primeiro som",
  "Marathon": "Maratona",
  "Measure": "Compasso",
  "Meet your next note": "Conheça a sua próxima nota",
  "Merrily We Roll Along": "Merrily We Roll Along",
  "Metronome": "Metrônomo",
  "Metronome / Tuner": "Metrônomo / Afinador",
  "Metronome / tuner": "Metrônomo / afinador",
  "Metronome and tuner": "Metrônomo e afinador",
  "Metronome volume": "Volume do metrônomo",
  "Microphone not available for tuning.": "Microfone indisponível para afinar.",
  "Microphone not available here.": "Microfone indisponível aqui.",
  "Microphone unavailable.": "Microfone indisponível.",
  "Minuet in G": "Minueto em Sol",
  "Minutes": "Minutos",
  "Model": "Modelo",
  "Most of it sits on your lowest string, so keep the hand still and the bow even.": "Quase tudo está na sua corda mais baixa, então mantenha a mão parada e o arco uniforme.",
  "Move the bow to the new string before the note starts, not during it.": "Mude o arco para a nova corda antes de a nota começar, não durante.",
  "Move the hand to the {s3} string and set the 1st finger a whole step above the open string. Keep the elbow soft.": "Leve a mão até a corda {s3} e coloque o 1º dedo um tom acima da corda aberta. Mantenha o cotovelo solto.",
  "Move the hand to the {s4} string and set the 1st finger a whole step above the open string. Bow close to the fingerboard.": "Leve a mão até a corda {s4} e coloque o 1º dedo um tom acima da corda aberta. Arqueie perto do taco.",
  "My First Note": "Minha Primeira Nota",
  "New badges this week": "Novas insígnias esta semana",
  "New here? Make your first sound": "Novo por aqui? Faça o seu primeiro som",
  "Next": "Próximo",
  "Next note": "Próxima nota",
  "Next question": "Próxima pergunta",
  "Next ›": "Próximo ›",
  "Nice. Tap Start to try again, or confirm below.": "Bom. Toque em Iniciar para tentar de novo, ou confirme abaixo.",
  "No badges yet": "Nenhuma insígnia ainda",
  "No finger at all. The string is left open and sounds its own note.": "Nenhum dedo. A corda fica aberta e soa a sua própria nota.",
  "No new badges this week": "Nenhuma insígnia nova esta semana",
  "No playable notes found in MusicXML": "Nenhuma nota tocável encontrada no MusicXML",
  "No practice logged this week — pick a lesson to start.": "Nenhuma prática registrada esta semana — escolha uma aula para começar.",
  "No score yet": "Ainda sem pontuação",
  "Normal": "Normal",
  "Not that note yet — give it another go.": "Ainda não é essa nota — tente de novo.",
  "Octave": "Oitava",
  "Ode to Joy": "Ode à Alegria",
  "On a Roll": "Em Série",
  "On a string instrument the sound comes from a string that is already moving. Your bow starts it, your left hand stops it.": "Em um instrumento de corda, o som vem de uma corda que já está vibrando. O arco começa o som, a mão esquerda o interrompe.",
  "On the staff": "Na partitura",
  "Open string": "Corda aberta",
  "Open the floating metronome and tuner.": "Abra o metrônomo e o afinador flutuantes.",
  "Pick an instrument to start your very first lessons — fingerings, notes, and your first sounds.": "Escolha um instrumento para começar suas primeiras aulas — digitações, notas e seus primeiros sons.",
  "Place your 2nd finger a whole step above the 1st. Leave a small gap between the fingers so the hand can stay relaxed.": "Coloque o 2º dedo um tom acima do 1º. Deixe um pequeno espaço entre os dedos para que a mão continue relaxada.",
  "Planner": "Planejador",
  "Play it like a march: even notes, and no stopping between the phrases.": "Toque como uma marcha: notas uniformes e sem parar entre as frases.",
  "Play it on your instrument": "Toque no seu instrumento",
  "Play it yourself": "Toque no seu instrumento",
  "Play note": "Tocar a nota",
  "Play now!": "Toque agora!",
  "Play one bow stroke per note. Let the last one ring for its full length.": "Toque um arco por nota. Deixe a última soar pelo tempo todo.",
  "Play the call": "Tocar a chamada",
  "Play the first two lines twice, then answer with the next two.": "Toque as duas primeiras frases duas vezes e depois responda com as duas seguintes.",  "Playing…": "Tocando…",
  "Position": "Posição",
  "Practice": "Praticar",
  "Practice 3 days in a row": "Pratique 3 dias seguidos",
  "Practice 7 days in a row": "Pratique 7 dias seguidos",
  "Practice and tools": "Prática e ferramentas",
  "Practice drills": "Exercícios de prática",
  "Practice drills build speed, ear training sharpens your listening, and the metronome and tuner keep you steady and in tune.": "Os exercícios de prática dão velocidade, o treino auditivo afina a sua escuta, e o metrônomo e o afinador mantêm o ritmo e a afinação.",
  "Practice for 30 minutes in total": "Pratique 30 minutos no total",
  "Practice report": "Relatório de prática",
  "Practice today to start a streak!": "Pratique hoje para começar uma sequência!",
  "Practise": "Praticar",
  "Practice": "Prática",
  "Preparing…": "Preparando…",
  "Preset…": "Predefinição…",
  "Press Tune": "Toque em Afinar",
  "Print": "Imprimir",
  "Progress report": "Relatório de progresso",
  "Progress reset.": "Progresso zerado.",
  "Quick Fingers": "Dedos Rápidos",
  "Quick tour": "Tour rápido",
  "Re-record": "Gravar de novo",
  "Reach the 4th finger up to the {s4} string, a whole step above the 3rd. The hand stretches; the arm stays where it is.": "Leve o 4º dedo até a corda {s4}, um tom acima do 3º. A mão se estica; o braço fica onde está.",
  "Reach your weekly practice goal": "Alcance a sua meta semanal de prática",
  "Ready for your first lesson": "Pronto para a sua primeira aula",
  "Ready to play?": "Pronto para tocar?",
  "Ready, ${escapeHtml(studentName)}?": "Pronto, ${escapeHtml(studentName)}?",
  "Record yourself and compare with the model.": "Grave você mesmo e compare com o modelo.",
  "Recording — play now, then tap Stop.": "Gravando — toque agora e depois toque em Parar.",
  "Replay the call": "Repetir a chamada",
  "Report copied to clipboard.": "Relatório copiado para a área de transferência.",
  "Reset all progress": "Zerar todo o progresso",
  "Reset all progress for all instruments? This cannot be undone.": "Zerar todo o progresso de todos os instrumentos? Não dá para desfazer.",
  "Reset progress": "Zerar o progresso",
  "Rest": "Pausa",
  "Rest the bow on the string near the middle of the horsehair, between the frog and the tip.": "Apoie o arco na corda perto do meio dos pelos, entre a sela e a ponta.",
  "Rest your left thumb lightly on the neck, just below where your fingers will work. The thumb guides; it does not squeeze.": "Apoie o polegar esquerdo de leve no braço, logo abaixo de onde os dedos vão trabalhar. O polegar guia; ele não aperta.",
  "Retry": "Tentar de novo",
  "Review 1": "Revisão 1",
  "Review 2": "Revisão 2",
  "Review 3": "Revisão 3",
  "Review complete!": "Revisão concluída!",
  "Review this note": "Revise esta nota",
  "Right note name, wrong octave — try the next partial.": "Nome da nota certo, oitava errada — tente o próximo parcial.",
  "Rising Star": "Estrela em Ascensão",
  "Row, Row, Row Your Boat": "Remo, Remo, Remo o Barco",
  "Save": "Salvar",
  "Score": "Pontuação",
  "Score 15 in a Finger gym sprint": "Faça 15 pontos no ginásio de dedos",
  "Scratching? Move the bow closer to the fingerboard and go slower. A thin, whistly sound usually means the bow is too close to the bridge.": "Está arranhando? Aproxime o arco do taco e devolva mais devagar. Um som fino e assobiado costuma significar que o arco está perto demais da ponte.",
  "See a note name, match its fingering fast.": "Veja o nome da nota e escolha a digitação certa rápido.",
  "See a note on the staff, name it fast.": "Veja a nota na partitura e diga o nome rápido.",
  "See it, then check it": "Veja, depois teste",
  "See summary": "Ver o resumo",
  "Select": "Selecionar",
  "Set the 2nd finger a whole step above the 1st on the {s2} string. Copy the spacing you used on the {s1} string.": "Coloque o 2º dedo um tom acima do 1º na corda {s2}. Repita o espaçamento que você usou na corda {s1}.",
  "Set the 2nd finger a whole step above the 1st on the {s3} string. Check that the hand still looks like a relaxed curve.": "Coloque o 2º dedo um tom acima do 1º na corda {s3}. Verifique se a mão ainda parece uma curva relaxada.",
  "Set the 2nd finger a whole step above the 1st on the {s4} string. Use less bow up here, because the string speaks quickly.": "Coloque o 2º dedo um tom acima do 1º na corda {s4}. Use menos arco para cima aqui, porque a corda fala rápido.",
  "Set the 3rd finger a half step above the 2nd on the {s2} string. Slide the hand over without lifting it.": "Coloque o 3º dedo um semitom acima do 2º na corda {s2}. Deslize a mão até lá sem levantá-la.",
  "Set the 3rd finger a half step above the 2nd on the {s3} string. Bow nearer the fingerboard for a brighter, clearer sound.": "Coloque o 3º dedo um semitom acima do 2º na corda {s3}. Arqueie mais perto do taco para um som mais brilhante e limpo.",
  "Set the 3rd finger a half step above the 2nd on the {s4} string. Keep the wrist loose so the bow can still travel.": "Coloque o 3º dedo um semitom acima do 2º na corda {s4}. Mantenha o pulso solto para o arco continuar correndo.",
  "Set the bow on the {s1} string near the frog and draw one slow, even down-bow across the whole string. Listen for a clear, singing tone.": "Apoie o arco na corda {s1} perto da sela e execute uma volta completa para baixo, lenta e uniforme. Ouça um tom claro e cantado.",
  "Set your 3rd finger a half step above the 2nd. They should almost touch, which is what a relaxed hand looks like.": "Coloque o 3º dedo um semitom acima do 2º. Eles quase se tocam — é assim que uma mão relaxada fica.",
  "Settings": "Configurações",
  "Shaky — needs review": "Trêmula — precisa de revisão",
  "Sheet music": "Partitura",
  "Sight-reading": "Leitura à primeira vista",
  "Six strokes on one note, so you can feel how a down-bow and an up-bow sound different.": "Seis arcos em uma nota, para você sentir como uma volta para baixo e uma para cima soam diferentes.",
  "Skip the tour": "Pular o tour",
  "Slower": "Mais devagar",
  "So close — adjust your pitch a little.": "Quase — ajuste um pouco a afinação.",
  "Solid understanding of this note.": "Boa noção desta nota.",
  "Song complete!": "Música concluída!",
  "Song not found.": "Música não encontrada.",
  "Soon": "Em breve",
  "Start": "Começar",  "Start playing": "Começar a tocar",
  "Start practicing": "Começar a praticar",
  "Step Up and Down": "Subindo e Descendo",  "Stop the string with a finger of your left hand to change the note — your right arm keeps bowing the whole time.": "Pare a corda com um dedo da mão esquerda para mudar a nota — o braço direito continua arcoeando o tempo todo.",
  "String": "Corda",
  "String number": "Número da corda",
  "String {n}": "Corda {n}",
  "Student name": "Nome do aluno",
  "Subdivision": "Subdivisão",
  "Switch between the light \"paper\" theme and the dark theme.": "Alterne entre o tema claro de \"papel\" e o tema escuro.",
  "Switch instrument": "Trocar de instrumento",
  "Take it slowly. Listen for the stepwise motion across the string.": "Toque devagar. Ouça o movimento por degraus ao longo da corda.",
  "Tap": "Toque",
  "Tap play, then follow along with the recording.": "Toque em play e acompanhe a gravação.",
  "Tap Start, then play along on the count.": "Toque em Iniciar e toque junto com a contagem.",
  "Tap the notes in the order you heard them.": "Toque as notas na ordem em que você ouviu.",
  "Teach": "Ensinar",
  "Tempo": "Andamento",
  "Tempo preset": "Andamento predefinido",
  "Text": "Texto",
  "That’s it — hold it steady!": "É isso — segure firme!",
  "The best-known tune in music, now on your instrument.": "A melodia mais conhecida da música, agora no seu instrumento.",
  "The first piece in Leopold Mozart's notebook, and the traditional first concert piece for a young string player.": "A primeira peça do caderno de Leopold Mozart, e a peça de concerto tradicional de todo jovem tocador de cordas.",
  "The hand stays where it started: 1st finger a whole step above the nut, then 2nd, 3rd and 4th. Every note on this chart is played in 1st position.": "A mão fica onde começou: 1º dedo um tom acima da cravelha, depois 2º, 3º e 4º. Toda nota deste quadro é tocada na 1ª posição.",
  "The last two notes repeat, so hold them long and even.": "As duas últimas notas se repetem, então segure-as longas e uniformes.",
  "The tune behind \"Mary Had a Little Lamb\", walking down and back up.": "A melodia de \"Maria tinha um carneirinho\", que desce e sobe de novo.",
  "The tune repeats, so let the pattern settle in before you worry about the bow.": "A melodia se repete, então deixe o padrão se firmar antes de se preocupar com o arco.",
  "The winter song, in the key your instrument plays most easily.": "A cantiga de inverno, na tonalidade que o seu instrumento toca com mais facilidade.",
  "Then play the note on your instrument. On a device with a microphone you can record a take and listen back to compare.": "Depois toque a nota no seu instrumento. Em um aparelho com microfone você pode gravar uma tomada e ouvir de volta para comparar.",
  "Three Open Strings": "Três Cordas Abertas",
  "Time signature": "Assinatura de tempo",
  "Timed games to build speed and confidence.": "Jogos cronometrados para ganhar velocidade e confiança.",
  "Tip": "Dica",
  "Today’s Plan": "O plano de hoje",
  "Triplet": "Tercina",
  "Triplets": "Tercinas",
  "Try another": "Tentar outra",
  "Tuner": "Afinador",
  "Twinkle Twinkle Little Star": "Estrela Estrelinha",
  "Two Open Strings": "Duas Cordas Abertas",
  "Unit 1 · First Notes": "Unidade 1 · Primeiras notas",
  "Viola": "Viola",
  "Violin": "Violino",
  "Warm up your sound": "Aqueça o seu som",
  "Watch yourself grow": "Veja você crescer",
  "Week Strong": "Semana Forte",
  "Weekly digest": "Resumo da semana",
  "Weekly goal": "Meta da semana",
  "Weekly recap copied.": "Resumo da semana copiado.",
  "Welcome to Preludio Strings!": "Bem-vindo ao Preludio Strings!",
  "Welcome! This is a one-minute tour of how the app works. You can skip it and replay it any time from your lesson map.": "Bem-vindo! Este é um tour de um minuto sobre como o app funciona. Você pode pular e repetir quando quiser no seu mapa de aulas.",
  "What note is on the staff?": "Qual nota está na partitura?",
  "What's your name?": "Qual é o seu nome?",
  "Which fingering plays this note?": "Qual digitação toca esta nota?",
  "Which note does this fingering play?": "Qual nota esta digitação toca?",
  "Which note is this?": "Qual é esta nota?",
  "Which one is correct?": "Qual é a correta?",
  "Which staff position matches this note?": "Qual posição na partitura corresponde a esta nota?",
  "Wood": "Madeira",
  "🔊 Hear a target note": "🔊 Ouvir uma nota de referência",
  "🔊 Hear it": "🔊 Ouvir",
  "New": "Nova",
  "Learning": "Aprendendo",
  "Practiced": "Praticada",
  "Mastered": "Dominada",
  "Mon": "Seg",
  "Tue": "Ter",
  "Wed": "Qua",
  "Thu": "Qui",
  "Fri": "Sex",
  "Sat": "Sáb",
  "Sun": "Dom",
  "XP": "XP",
  "B♭": "Si♭",
  "B": "Si",
  "Yankee Doodle": "Yankee Doodle",
  "You earn XP, streaks, and badges as you play, and the weekly recap shows how much you practiced. Ready? Let’s play!": "Você ganha XP, sequências e insígnias ao tocar, e o resumo da semana mostra quanto você praticou. Pronto? Vamos tocar!",
  "You got the basics down!": "Você domina o básico!",
  "You really know this note well!": "Você realmente domina esta nota!",
  "You're set up on ${savedInst.shortName}. Pick up where you left off.": "Você está configurado em ${savedInst.shortName}. Continue de onde parou.",
  "You're set up on {inst}": "Você está configurado em {inst}",
  "You're set up on {inst}. Pick up where you left off.": "Você está configurado em {inst}. Continue de onde parou.",
  "Your drills will favour the notes you miss most.": "Os seus exercícios vão priorizar as notas que você mais erra.",
  "Your first three open strings in one little phrase.": "Suas três primeiras cordas abertas em uma pequena frase.",
  "Your first two open strings, trading places. This is what crossing strings feels like.": "Suas duas primeiras cordas abertas, trocando de lugar. É assim que se sente mudar de corda.",
  "Your index finger. It is the strongest finger and it stops the string a whole step above the open string.": "Seu dedo indicador. É o dedo mais forte, e para a corda um tom acima da corda aberta.",
  "Your little finger. It reaches a whole step above the 3rd finger.": "Seu dedo mindinho. Alcança um tom acima do 3º dedo.",
  "Your middle finger. It stops the string another whole step up.": "Seu dedo médio. Para a corda mais um tom acima.",
  "What's your name?": "Qual é o seu nome?",
  "Your name...": "Seu nome...",
  "Start practicing": "Começar a praticar",
  "Your notes": "As suas notas",
  "Your ring finger. It sits a half step above the 2nd finger — that small gap is why the 3rd finger lands where it does.": "Seu dedo anelar. Fica um semitom acima do 2º dedo — é esse espacinho que faz o 3º dedo cair onde cai.",
  "{icon} Badge unlocked: {name}": "{icon} Insígnia desbloqueada: {name}",
  "{icon} Plan complete! +{bonus} XP": "🎉 Plano concluído! +{bonus} XP",
  "{inst} is coming soon!": "{inst} está chegando em breve!",
  "{name} string": "Corda {name}",
  "{note} — the open {s1} string, the lowest string on your instrument. Your very first note, and the left hand stays out of it entirely.": "{note} — a corda {s1} aberta, a corda mais baixa do seu instrumento. A sua primeira nota, e a mão esquerda nem encosta nela.",
  "{note} — the open {s2} string, and also the note your 4th finger reaches on the {s1} string. Your second open string, a fifth above the first.": "{note} — a corda {s2} aberta, e também a nota que o seu 4º dedo alcança na corda {s1}. A sua segunda corda aberta, uma quinta acima da primeira.",
  "{note} — the open {s3} string, and also the note your 4th finger reaches on the {s2} string. Your third open string, another fifth higher.": "{note} — a corda {s3} aberta, e também a nota que o seu 4º dedo alcança na corda {s2}. A sua terceira corda aberta, mais uma quinta acima.",
  "{note} — the open {s4} string, the highest string on your instrument. Your last open string, and the top of the range every beginner piece lives in.": "{note} — a corda {s4} aberta, a corda mais alta do seu instrumento. A sua última corda aberta, e o topo da faixa em que vivem as peças de iniciante.",
  "{note} — your 1st finger on the {s1} string. A whole step above the open string, and the note your hand plays more than any other in first position.": "{note} — o seu 1º dedo na corda {s1}. Um tom acima da corda aberta, e a nota que a sua mão mais toca na 1ª posição.",
  "{note} — your 1st finger on the {s2} string. A whole step above the open {s2}. Your arm travels to the new string; only the fingers move.": "{note} — o seu 1º dedo na corda {s2}. Um tom acima da {s2} aberta. O braço vai até a nova corda; só os dedos se movem.",
  "{note} — your 1st finger on the {s3} string. A whole step above the open {s3}, in the part of the instrument that sings brightest.": "{note} — o seu 1º dedo na corda {s3}. Um tom acima da {s3} aberta, na parte do instrumento que soa mais brilhante.",
  "{note} — your 1st finger on the {s4} string. A whole step above the open {s4}, and the highest note most beginners play.": "{note} — o seu 1º dedo na corda {s4}. Um tom acima da {s4} aberta, e a nota mais alta que a maioria dos iniciantes toca.",
  "{note} — your 2nd finger on the {s1} string. Another whole step up. Two fingers now carry most of the melody.": "{note} — o seu 2º dedo na corda {s1}. Mais um tom acima. Agora são dois dedos que carregam quase toda a melodia.",
  "{note} — your 2nd finger on the {s2} string. A whole step above the 1st finger, the same shape you already know.": "{note} — o seu 2º dedo na corda {s2}. Um tom acima do 1º dedo, o mesmo formato que você já conhece.",
  "{note} — your 2nd finger on the {s3} string. A whole step above the 1st finger, still comfortably inside the neck.": "{note} — o seu 2º dedo na corda {s3}. Um tom acima do 1º dedo, ainda bem dentro do braço do instrumento.",
  "{note} — your 2nd finger on the {s4} string. A whole step above the 1st finger.": "{note} — o seu 2º dedo na corda {s4}. Um tom acima do 1º dedo.",
  "{note} — your 3rd finger on the {s1} string. A half step above the 2nd finger, the closest pair of fingers on the instrument.": "{note} — o seu 3º dedo na corda {s1}. Um semitom acima do 2º dedo, o par de dedos mais próximo um do outro no instrumento.",
  "{note} — your 3rd finger on the {s2} string. A half step above the 2nd finger, so this note sits close to the one before it.": "{note} — o seu 3º dedo na corda {s2}. Um semitom acima do 2º dedo, então esta nota fica pertinho da anterior.",
  "{note} — your 3rd finger on the {s3} string. A half step above the 2nd finger.": "{note} — o seu 3º dedo na corda {s3}. Um semitom acima do 2º dedo.",
  "{note} — your 3rd finger on the {s4} string. A half step above the 2nd finger, and the top of the beginner range.": "{note} — o seu 3º dedo na corda {s4}. Um semitom acima do 2º dedo, e o topo da faixa de iniciante.",
  "{note} — your 4th finger on the {s4} string. The last finger of first position, and the only note in this range you cannot play on an open string.": "{note} — o seu 4º dedo na corda {s4}. O último dedo da 1ª posição, e a única nota desta faixa que você não pode tocar em corda aberta.",
  "‹ Prev": "‹ Anterior",
  "⏹ Stop recording": "⏹ Parar a gravação",
  "⏺ Record yourself": "⏺ Grave você mesmo",
  "■ Stop": "■ Parar",
  "▶ My take": "▶ A minha tomada",
  "▶ Play whole melody": "▶ Tocar a melodia inteira",
  "▶ Play with recording": "▶ Tocar com gravação",
  "▶ Replay count-in": "▶ Repetir a contagem",
  "▶ Start": "▶ Iniciar",
  "▶ Start count-in": "▶ Iniciar a contagem",
  "▶ Tune": "▶ Afinar",
  "☀️ Light theme": "☀️ Tema claro",
  "✕ Delete": "✕ Excluir",
  "❔ How this app works": "❔ Como este app funciona",
  "🌙 Dark theme": "🌙 Tema escuro",
  "🎉 All done — nice work!": "🎉 Tudo pronto — bom trabalho!",
  "🎉 You found it! Keep it going.": "🎉 Você achou! Continue assim.",
  "🎼 Fingering chart": "🎼 Tabela de digitações",
  "👂 Golden ear! Perfect echo.": "👂 Ouvido de ouro! Eco perfeito.",
  "📈 Your week in music is ready!": "📈 A sua semana de música está pronta!",
  "📋 Progress report": "📋 Relatório de progresso",
};

// French (Canadian French) translations - starter set
TRANSLATIONS.fr = {
  "Language": "Langue",
  "Welcome to Preludio Strings!": "Bienvenue au Preludio Strings !",
  "What's your name?": "Quel est votre nom ?",
  "Your name...": "Votre nom...",
  "Start practicing": "Commencer à pratiquer",
  "Lesson": "Leçon",
  "Map": "Carte",
  "Practice": "Pratique",
  "Settings": "Paramètres",
  "Report": "Rapport",
  "Fingering chart": "Doigtés",
  "Metronome": "Métronome",
  "Tuner": "Accordeur",
  "Play": "Jouer",
  "Listen": "Écouter",
  "Next": "Suivant",
  "Back": "Retour",
  "Complete": "Terminé",
  "Review": "Réviser",
  "Song": "Chanson",
  "Notes": "Notes",
  "Level": "Niveau",
  "Badges": "Badges",
  "Start": "Démarrer",
  "Stop": "Arrêter",
  "Save": "Enregistrer",
  "Cancel": "Annuler",
  "Done": "Terminé",
  "Close": "Fermer",
  "Back to my path": "Retour à mon parcours",
  "Got it — let's play!": "Compris — jouons !",
  "Ready to play?": "Prêt à jouer ?",
  "Continue": "Continuer",
  "Switch instrument": "Changer d'instrument",
  "Ready for your first lesson": "Prêt pour votre première leçon",
  "First notes, first wins.": "Premières notes, premières victoires.",
  "Practice today to start a streak!": "Pratiquez aujourd'hui pour commencer une série !",
  "No badges yet": "Aucun badge pour l'instant",
  "Focus areas": "Points à travailler",
  "Learn a couple of notes first.": "Apprenez quelques notes d'abord.",
  "How many can you get?": "Combien pouvez-vous en avoir ?",
  "Finish a couple of lessons to unlock the timed drills.": "Terminez quelques leçons pour débloquer les exercices chronométrés.",
  "Sight-reading": "Lecture à vue",
  "Finger gym": "Gymnastique des doigts",
  "Which note is this?": "Quelle est cette note ?",
  "Play again": "Rejouer",
  "Back": "Retour",
  "Instruments": "Instruments",
  "No practice recorded yet — play a lesson to start the report.": "Aucune pratique enregistrée — jouez une leçon pour commencer le rapport.",
  "New here? Make your first sound": "Nouveau ? Faites votre premier son",
  "Warm up your sound": "Échauffez votre son",
  "Practice drills": "Exercices de pratique",
  "Timed games to build speed and confidence.": "Jeux chronométrés pour gagner en vitesse et confiance.",
  "Learn 2 notes to unlock timed drills.": "Apprenez 2 notes pour débloquer les exercices chronométrés.",
  "Sight Reading Challenge": "Défi de lecture à vue",
  "How this app works": "Comment fonctionne cette app",
  "Review this note": "Réviser cette note",
  "Meet your next note": "Rencontrez votre prochaine note",
  "Fingering": "Doigté",
  "On the staff": "Sur la portée",
  "Sheet music": "Partition",
  "Note": "Note",
  "of": "de",
  "Prev": "Précédent",
  "Next": "Suivant",
  "Replay": "Rejouer",
  "Play whole melody": "Jouer la mélodie entière",
  "No notes to show yet.": "Aucune note à afficher pour l'instant.",
  "Student name": "Nom de l'élève",
  "Save": "Enregistrer",
  "Reset progress": "Réinitialiser le progrès",
  "Switch instrument": "Changer d'instrument",
  "My path": "Mon parcours",
  "Continue": "Continuer",
  "notes": "notes",
  "songs": "chansons",
  "Your Stats": "Vos statistiques",
  "Total XP": "XP total",
  "Lessons done": "Leçons terminées",
  "Day streak": "Jours consécutifs",
  "Per instrument": "Par instrument",
  "Recent activity": "Activité récente",
  "Clear analytics data": "Effacer les données d'analyse",
  "Play again": "Rejouer",
  "Badges": "Badges",
  "Focus:": "Focus :",
  "Tune": "Accorder",
  "Count-in": "Compte",
  "Stop": "Arrêter",
  "Start": "Démarrer",
  "Lessons": "Leçons",
  "Hear it": "Entendre",
  "Play note": "Jouer la note",
  "Hear the model": "Entendre le modèle",
  "Listen to how it sounds...": "Écoutez comme ça sonne...",
  "Listen...": "Écoutez...",
  "Get ready...": "Préparez-vous...",
  "Go!": "Allez !",
  "Try again": "Réessayez",
  "Next note": "Note suivante",
  "Skip": "Passer",
  "Hint": "Indice",
  "Practice": "Pratique",
  "Practice report": "Rapport de pratique",
  "Quick tour": "Visite rapide",
  "First sound": "Premier son",
  "Back to": "Retour à",
  "Back to my path": "Retour à mon parcours",
  "Got it — let's play!": "Compris — jouons !",
  "Ready,": "Prêt,",
  "You're set up on": "Vous êtes configuré sur",
  "Pick up where you left off.": "Continuez où vous vous êtes arrêté.",
  "Continue": "Continuer",
  "Ready for your first lesson": "Prêt pour votre première leçon",
  "notes": "notes",
  "songs": "chansons",
  "First notes, first wins.": "Premières notes, premières victoires.",
  "Language": "Langue",
  "Welcome to Preludio Strings!": "Bienvenue au Preludio Strings !",
};
