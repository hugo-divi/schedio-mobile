/**
 * Checks for the share card.  ·  npm run check:share-card
 *
 * services/shareCard.js draws the story-sized card shared at the end of a
 * session. This runs the real file and checks that what it says is right,
 * that the SVG is well-formed whatever the subject is called (it is parsed
 * with sax, strict), that long names still fit, and that nothing about the
 * student but the session itself can end up on it.
 *
 * Copies services/shareCard.js to a temp .mjs for the same reason as the
 * other check-*.mjs. The repository isn't touched.
 */
import { readFileSync, writeFileSync, mkdtempSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { tmpdir } from 'node:os';
import { fileURLToPath } from 'node:url';
import { createRequire } from 'node:module';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const here = mkdtempSync(join(tmpdir(), 'schedio-share-card-'));
writeFileSync(
  join(here, 'shareCard.mjs'),
  readFileSync(join(root, 'services', 'shareCard.js'), 'utf8')
);
const S = await import(`file://${join(here, 'shareCard.mjs')}`);
const sax = createRequire(import.meta.url)(join(root, 'node_modules', 'sax'));

let failures = 0;
const ok = (label, condition, detail = '') => {
  if (!condition) failures++;
  console.log(`${condition ? 'ok  ' : 'FALLA'} ${label}${detail ? `: ${detail}` : ''}`);
};

const wellFormed = (xml) => {
  const parser = sax.parser(true);
  let error = null;
  parser.onerror = (e) => {
    error = e;
  };
  try {
    parser.write(xml).close();
  } catch (e) {
    error = e;
  }
  return error ? String(error.message).split('\n')[0] : null;
};
const texts = (xml) =>
  [...xml.matchAll(/<(?:text|tspan)[^>]*>([^<]+)<\/(?:text|tspan)>/g)].map((m) => m[1]);

console.log('\n── lo que dice ──');
const base = {
  minutes: 45,
  subjectName: 'Química',
  subjectColor: '#22C55E',
  streak: 12,
  planDone: 2,
  planTotal: 3,
};
let l = S.shareCardLines(base);
ok('minutos y asignatura', l.big === '45' && l.subject.text === 'Química');
ok(
  'racha y plan',
  l.badges.join(' | ') === '12 días de racha | Plan de hoy: 2 de 3',
  l.badges.join(' | ')
);
l = S.shareCardLines({ ...base, streak: 1, planDone: 3 });
ok(
  'racha de 1 no se enseña; plan completo',
  l.badges.join(' | ') === 'Plan de hoy completado',
  l.badges.join(' | ')
);
l = S.shareCardLines({ ...base, streak: 0, planTotal: 0 });
ok('sin racha ni plan → sin etiquetas', l.badges.length === 0);
ok('nunca 0 minutos', S.shareCardLines({ ...base, minutes: 0.2 }).big === '1');
ok(
  'sin asignatura → "Estudio"',
  S.shareCardLines({ ...base, subjectName: '  ' }).subject.text === 'Estudio'
);
ok(
  'el texto que acompaña',
  S.shareCardText(base) === '45 min de Química con Schedio · schedio.es',
  S.shareCardText(base)
);

console.log('\n── el SVG ──');
const svg = S.buildShareCardSvg(base);
ok('bien formado', wellFormed(svg) === null, wellFormed(svg) || '');
ok('tamaño de historia', svg.includes('width="1080"') && svg.includes('height="1920"'));
ok('lleva el color de la asignatura', svg.includes('#22C55E'));
const nasty = S.buildShareCardSvg({ ...base, subjectName: 'Lengua <b>& "Lit"</b>\'s' });
ok('nombres con < & " \' no rompen nada', wellFormed(nasty) === null, wellFormed(nasty) || '');
ok(
  'un color raro no se cuela en el SVG',
  !S.buildShareCardSvg({ ...base, subjectColor: 'red" onload="x' }).includes('onload')
);
const long = S.fitSubject('Lengua Castellana y Literatura II');
ok('un nombre largo se recorta', long.text.length <= 26 && long.text.endsWith('…'), long.text);
ok(
  'y cabe: letra más pequeña, ~920 px de ancho',
  long.size < 96 && (long.text.length + 3) * 0.56 * long.size <= 920,
  `${long.size}px`
);
ok('uno corto va grande', S.fitSubject('Inglés').size === 96);

console.log('\n── privacidad ──');
const withPersonal = S.buildShareCardSvg({
  ...base,
  name: 'Lucía',
  displayName: 'Lucía García',
  email: 'lucia@example.com',
  grade: 9.5,
  school: 'IES Ejemplo',
});
ok(
  'ni nombre, ni correo, ni nota, ni instituto aunque lleguen',
  !/Lucía|@|9[.,]5|IES/.test(withPersonal)
);
ok(
  'todo lo que se lee está previsto',
  texts(svg).every((t) =>
    [
      'Schedio',
      'HOY HE ESTUDIADO',
      '45',
      'min',
      'de Química',
      '12 días de racha',
      'Plan de hoy: 2 de 3',
      'Mi plan de estudio, en Schedio',
      'schedio.es',
    ].includes(t)
  ),
  texts(svg).join(' / ')
);

console.log(failures === 0 ? '\n✅ todo correcto' : `\n❌ ${failures} comprobación(es) fallan`);
process.exit(failures === 0 ? 0 : 1);
