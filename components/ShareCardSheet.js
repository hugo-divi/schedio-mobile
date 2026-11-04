import { useEffect, useMemo, useRef, useState } from 'react';
import { View, Text, Image, Platform, StyleSheet } from 'react-native';
import { SvgAst, parse } from 'react-native-svg';
import { Share2 } from 'lucide-react-native';
import { tokens } from '../theme/tokens';
import BottomSheet from './ui/BottomSheet';
import Button from './ui/Button';
import { buildShareCardSvg, shareCardText, CARD_WIDTH, CARD_HEIGHT } from '../services/shareCard';
import { prepareShareImage, shareImage, previewSource } from '../services/shareImage';

const font = tokens.typography.families.inter;
const PREVIEW_WIDTH = 216;
const PREVIEW_HEIGHT = Math.round((PREVIEW_WIDTH * CARD_HEIGHT) / CARD_WIDTH);

/**
 * "Compartir" al terminar una sesión: la tarjeta tal cual se va a ver, y el
 * botón que abre la hoja de compartir del sistema.
 *
 * Se enseña antes de compartir porque la comparten menores: que vean
 * exactamente qué sale (minutos, asignatura, racha y plan; nunca su nombre).
 */
export default function ShareCardSheet({ visible, onClose, card }) {
  const svg = useMemo(() => (card ? buildShareCardSvg(card) : null), [card]);
  const ast = useMemo(() => (svg && Platform.OS !== 'web' ? parse(svg) : null), [svg]);
  const svgRef = useRef(null);
  const [prepared, setPrepared] = useState(null);
  const [problem, setProblem] = useState(null);
  const [busy, setBusy] = useState(false);

  // La imagen se prepara al abrir, no al tocar (ver services/shareImage.web.js).
  useEffect(() => {
    if (!visible || !svg) return undefined;
    let cancelled = false;
    setPrepared(null);
    setProblem(null);
    const run = () =>
      prepareShareImage(Platform.OS === 'web' ? svg : svgRef.current)
        .then((result) => !cancelled && setPrepared(result))
        .catch(() => !cancelled && setProblem('No se ha podido preparar la imagen.'));
    // En Android el <Svg> tiene que estar montado y medido antes de leerlo.
    const timer = setTimeout(run, Platform.OS === 'web' ? 0 : 250);
    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
  }, [visible, svg]);

  const onShare = async () => {
    if (!prepared || !card) return;
    setBusy(true);
    setProblem(null);
    try {
      const result = await shareImage(prepared, { text: shareCardText(card) });
      if (result === 'shared' || result === 'downloaded') onClose();
      if (result === 'unavailable') setProblem('Este dispositivo no permite compartir imágenes.');
    } catch {
      setProblem('No se ha podido compartir. Prueba otra vez.');
    } finally {
      setBusy(false);
    }
  };

  return (
    <BottomSheet visible={visible} onClose={onClose} title="Compartir tu sesión">
      <View style={styles.body}>
        <View style={styles.preview}>
          {Platform.OS === 'web' && svg ? (
            <Image
              source={previewSource(svg)}
              style={{ width: PREVIEW_WIDTH, height: PREVIEW_HEIGHT }}
              accessibilityLabel="Vista previa de la tarjeta"
            />
          ) : null}
          {ast ? (
            <SvgAst
              ast={ast}
              override={{
                ref: svgRef,
                width: PREVIEW_WIDTH,
                height: PREVIEW_HEIGHT,
              }}
            />
          ) : null}
        </View>
        <Text style={styles.note}>
          Sale tal cual: sin tu nombre ni tus notas. Perfecta para una historia.
        </Text>
        {problem ? <Text style={styles.problem}>{problem}</Text> : null}
        <Button
          title={prepared ? 'Compartir' : 'Preparando…'}
          icon={<Share2 size={16} color="#FFFFFF" />}
          onPress={onShare}
          loading={busy}
          disabled={!prepared}
          fullWidth
        />
      </View>
    </BottomSheet>
  );
}

const styles = StyleSheet.create({
  body: { alignItems: 'center', gap: 14, paddingTop: 8, paddingBottom: 8 },
  preview: {
    width: PREVIEW_WIDTH,
    height: PREVIEW_HEIGHT,
    borderRadius: 16,
    overflow: 'hidden',
    borderWidth: 1,
    borderColor: tokens.colors.borderDefault,
    backgroundColor: tokens.colors.bgBase,
  },
  note: {
    fontFamily: font.regular,
    fontSize: 13,
    lineHeight: 18,
    color: tokens.colors.textSecondary,
    textAlign: 'center',
  },
  problem: {
    fontFamily: font.medium,
    fontSize: 13,
    color: tokens.colors.danger,
    textAlign: 'center',
  },
});
