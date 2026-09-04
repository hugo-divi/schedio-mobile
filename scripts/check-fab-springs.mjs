/**
 * Checks for the "+" button's springs.  ·  npm run check:fab-springs
 *
 * Reproduce la fórmula exacta que usa react-native-reanimated para un muelle
 * infra-amortiguado (subamortiguado) — leída de su propio código fuente
 * instalado (node_modules/react-native-reanimated/.../spring/springUtils.js,
 * función `underDampedSpringCalculations`), no aproximada:
 *
 *   ζ  = damping / (2·√(stiffness·mass))
 *   ω0 = √(stiffness/mass)
 *   ω1 = ω0·√(1-ζ²)
 *   x(t) = toValue + e^(-ζ·ω0·t) · [ sin(ω1·t)·((v0+ζ·ω0·x0)/ω1) + x0·cos(ω1·t) ]
 *
 * Con esto se puede contestar, con números y no a ojo: ¿se pasa el muelle de
 * su valor final? ¿cuánto? ¿cuánto tarda en asentarse? — para las cinco
 * animaciones del "+"/sheet/pestaña que hay en la app.
 */

/** Un muelle subamortiguado, con la misma física que usa Reanimated. */
const spring = ({ damping, stiffness, mass, from, to, v0 = 0 }) => {
  const zeta = damping / (2 * Math.sqrt(stiffness * mass));
  const omega0 = Math.sqrt(stiffness / mass);
  const omega1 = omega0 * Math.sqrt(1 - zeta ** 2);
  const x0 = from - to;

  // `t` en segundos — omega0 tiene unidades de rad/s con estas magnitudes de
  // stiffness/mass (verificado: da frecuencias de unos pocos Hz, el rango
  // normal de un muelle de interfaz).
  //
  // Dos ramas, y se eligen con el mismo criterio exacto que Reanimated:
  // `zeta < 1 ? underDampedSpringCalculations : criticallyDampedSpringCalculations`
  // (animation/spring/spring.js del paquete instalado). Importa porque a
  // partir de ζ=1 la fórmula deja de tener término oscilatorio — o sea, no es
  // que rebote poco, es que no puede pasarse de la meta.
  const at =
    zeta < 1
      ? (t) => {
          const envelope = Math.exp(-zeta * omega0 * t);
          return (
            to +
            envelope *
              (Math.sin(omega1 * t) * ((v0 + zeta * omega0 * x0) / omega1) +
                x0 * Math.cos(omega1 * t))
          );
        }
      : (t) => {
          const envelope = Math.exp(-omega0 * t);
          return to + envelope * (x0 + (v0 + omega0 * x0) * t);
        };

  // Barrido fino para encontrar el pico real del rebote (por definición, el
  // valor más alejado de `to` en el sentido *contrario* al que venía x0 — o
  // sea, cuánto se pasa después de cruzar la meta, no el punto de partida,
  // que siempre sería "el más lejano" con un criterio de distancia sin signo)
  // y cuándo se asienta dentro de un 1% de la distancia total, para siempre.
  const STEP = 0.0005; // 0,5ms
  const MAX_T = 2; // 2s de sobra para cualquiera de estos muelles
  const rising = to > from;
  let peak = to; // si no hay rebote, "el pico" es la propia meta
  let peakT = 0;
  const threshold = Math.abs(x0) * 0.01;
  let lastExceedanceT = 0; // última vez que estuvo fuera del margen del 1%

  for (let t = 0; t <= MAX_T; t += STEP) {
    const x = at(t);
    // El pico del rebote: el valor más alto (si sube) o más bajo (si baja)
    // alcanzado en todo el recorrido — así SÍ distingue "pasarse de la meta"
    // de "todavía no haber llegado".
    if (rising ? x > peak : x < peak) {
      peak = x;
      peakT = t;
    }
    if (Math.abs(x - to) > threshold) lastExceedanceT = t;
  }

  // Se asienta justo después de la última vez que se salió del margen — a
  // partir de ahí, por construcción del propio barrido, ya no vuelve a salir.
  const settleT = lastExceedanceT;

  return { zeta, peak, peakT, settleT, from, to };
};

let failures = 0;
const ok = (label, condition, detail = '') => {
  if (!condition) failures++;
  console.log(`${condition ? 'ok  ' : 'FALLA'} ${label}${detail ? `: ${detail}` : ''}`);
};

const report = (name, { damping, stiffness, mass }, from, to) => {
  const r = spring({ damping, stiffness, mass, from, to });
  // Cuánto se pasa MÁS ALLÁ de la meta, en el sentido del rebote — no la
  // distancia al origen, que es lo que medía antes por error y daba
  // disparates como "se pasa 1.002" en un valor que va de 1 a 0.
  const overshoot = to > from ? r.peak - to : to - r.peak;
  console.log(
    `  ${name.padEnd(28)} ζ=${r.zeta.toFixed(3)}  pico ${r.peak.toFixed(3)} en ${(r.peakT * 1000).toFixed(0)}ms  ` +
      `asienta a los ${(r.settleT * 1000).toFixed(0)}ms  ` +
      `${overshoot > 0.001 ? `se pasa ${overshoot.toFixed(3)}` : 'sin rebote'}`
  );
  return r;
};

console.log('── las cinco animaciones reales, con sus valores exactos ──\n');

// Píldora de pestaña y rotación del "+" comparten config — mismo muelle,
// documentado a propósito así en el código.
const pillIn = report('píldora / rotación · entra', { damping: 18, stiffness: 260, mass: 0.6 }, 0, 1);
const pillOut = report('píldora / rotación · sale', { damping: 18, stiffness: 260, mass: 0.6 }, 1, 0);

// El muelle del `layout` de la barra: lo que mueve el ancho de la píldora que
// se abre y, con él, la posición de las otras tres. Mismo stiffness y misma
// masa que el de arriba — misma frecuencia, mismo tiempo de llegada — pero
// amortiguado hasta ζ≥1 justo para que no se pase de la meta.
const layoutIn = report('layout de la barra · abre', { damping: 25, stiffness: 260, mass: 0.6 }, 0, 1);
const layoutOut = report('layout de la barra · cierra', { damping: 25, stiffness: 260, mass: 0.6 }, 1, 0);

const fabIn = report('+ presencia · entra', { damping: 18, stiffness: 260, mass: 0.6 }, 0, 1);
const fabOut = report('+ presencia · sale', { damping: 24, stiffness: 300, mass: 0.6 }, 1, 0);

const sheetIn = report('sheet · abre', { damping: 22, stiffness: 240, mass: 0.7 }, 0, 1);
const sheetOut = report('sheet · cierra', { damping: 28, stiffness: 300, mass: 0.7 }, 1, 0);

console.log('\n── por qué opacity va recortada a los dos lados en fabPresenceStyle ──');
// Las dos direcciones se pasan de su meta (todo muelle con ζ<1 lo hace), así
// que si solo se recortara un lado (como estaba antes de este mismo cambio,
// `opacity: Math.min(1, v)`) la salida podría pintar una opacidad negativa.
ok(
  'la entrada del + se pasa de 1',
  fabIn.peak > 1.001,
  `pico ${fabIn.peak.toFixed(3)}`
);
ok(
  'la salida del + se pasa de 0 hacia negativo',
  fabOut.peak < -0.001,
  `pico ${fabOut.peak.toFixed(3)}`
);
// Lo que se movía "un milisegundo hacia la derecha y volvía": la píldora que
// se abre con el muelle poco amortiguado se pasaba de ancho, empujaba a las
// vecinas más allá de donde acaban, y volvían. Con el muelle del layout eso
// no puede pasar — y esta es la comprobación de que no puede, no de que pasa
// poco.
ok(
  'el layout de la barra NO se pasa de su meta al abrir (nada de tirón a la derecha)',
  layoutIn.peak <= 1 + 1e-9,
  `pico ${layoutIn.peak.toFixed(6)}`
);
ok(
  'el layout de la barra NO se pasa de su meta al cerrar',
  layoutOut.peak >= -1e-9,
  `pico ${layoutOut.peak.toFixed(6)}`
);
ok(
  'el layout está al menos críticamente amortiguado (ζ≥1) — por eso no puede rebotar',
  layoutIn.zeta >= 1,
  `ζ=${layoutIn.zeta.toFixed(4)}`
);
ok(
  'y llega en un tiempo parecido al muelle del color, para que se lean como el mismo movimiento',
  Math.abs(layoutIn.settleT - pillIn.settleT) < 0.12,
  `layout ${(layoutIn.settleT * 1000).toFixed(0)}ms contra color ${(pillIn.settleT * 1000).toFixed(0)}ms`
);

const worstNegative = Math.min(0, fabOut.peak);
console.log(
  `  sin recortar por abajo, esa opacidad de ${worstNegative.toFixed(3)} se pintaría tal cual —` +
    ` pequeña y probablemente inofensiva, pero es justo el tipo de detalle que no conviene dejar` +
    ` a que "probablemente" lo trate bien el motor nativo. Ya recortado a los dos lados en el código real.`
);

console.log('\n── las dos direcciones asientan rápido (menos de 400ms) ──');
// No se exige que "cerrar" asiente antes que "abrir": con amortiguación casi
// crítica (ζ cerca de 1) la curva deja de oscilar pero se acerca más despacio
// al valor exacto, así que puede cruzar el margen del 1% por última vez unos
// milisegundos más tarde — aun sin rebotar ni una vez. Lo que de verdad
// importa para que "cerrar" se sienta decidido es que no rebote (la
// comprobación de abajo) y que siga siendo rápido en términos absolutos, no
// que gane una carrera contra "abrir" con una regla que la física no promete.
[
  ['píldora entra', pillIn],
  ['píldora sale', pillOut],
  ['+ entra', fabIn],
  ['+ sale', fabOut],
  ['sheet abre', sheetIn],
  ['sheet cierra', sheetOut],
].forEach(([label, r]) => {
  ok(`${label} asienta en menos de 400ms`, r.settleT < 0.4, `${(r.settleT * 1000).toFixed(0)}ms`);
});

console.log('\n── el cierre rebota menos que la apertura, en las dos (más "decidido") ──');
ok(
  '+ : salir tiene menos rebote que entrar',
  Math.abs(fabOut.peak - 0) < Math.abs(fabIn.peak - 1) || fabOut.zeta > fabIn.zeta,
  `ζ entra ${fabIn.zeta.toFixed(3)}, ζ sale ${fabOut.zeta.toFixed(3)}`
);
ok(
  'sheet: cerrar tiene menos rebote que abrir',
  sheetOut.zeta > sheetIn.zeta,
  `ζ abre ${sheetIn.zeta.toFixed(3)}, ζ cierra ${sheetOut.zeta.toFixed(3)}`
);

console.log(
  failures === 0 ? '\n✅ todo correcto' : `\n❌ ${failures} comprobación(es) fallan`
);
process.exit(failures === 0 ? 0 : 1);
