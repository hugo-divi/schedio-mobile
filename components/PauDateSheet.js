import { useEffect, useState } from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { format, isSameDay } from 'date-fns';
import { es } from 'date-fns/locale';

import { tokens } from '../theme/tokens';
import { regionLabelFor } from '../services/onboarding';
import { CalendarPicker } from './ui/CalendarPicker';
import BottomSheet from './ui/BottomSheet';
import Button from './ui/Button';

const font = tokens.typography.families.inter;

/**
 * Cambiar la fecha de la PAU.
 *
 * Existe porque hasta enero o marzo la fecha que enseñamos es una suposición
 * nuestra, y porque las convocatorias se mueven. El estudiante siempre puede
 * ganarle a la app: lo que guarde aquí manda sobre la oficial y sobre la
 * estimada (ver `resolvePauDate`).
 *
 * `fallback` es la fecha que se usaría si no hubiera ninguna suya —la oficial
 * de su comunidad, o la estimación—. Guardar exactamente esa fecha no crea una
 * excepción: se borra la suya y vuelve a seguir a la de su comunidad, que es
 * lo que el estudiante quiere decir cuando elige justo ese día.
 */
export default function PauDateSheet({
  visible,
  onClose,
  date,
  fallback,
  official,
  source,
  region,
  onSave,
}) {
  const [picked, setPicked] = useState(date);

  // La hoja se mantiene montada entre aperturas, así que sin esto conservaría
  // la fecha que el estudiante estuvo mirando la vez anterior y descartó.
  useEffect(() => {
    if (visible) setPicked(date);
  }, [visible, date]);

  const isFallback = picked && fallback && isSameDay(picked, fallback);

  return (
    <BottomSheet
      visible={visible}
      onClose={onClose}
      title="Fecha de tu PAU"
      subtitle={
        region ? `${regionLabelFor(region)} · convocatoria ordinaria` : 'Convocatoria ordinaria'
      }
    >
      <CalendarPicker value={picked} onChange={setPicked} />

      {/* Cuando su comunidad publica una fecha y el estudiante ya tenía la
          suya, no se la cambiamos: se lo contamos, y el botón de abajo es el
          camino de vuelta si quiere seguirla. */}
      {source === 'mine' && official ? (
        <Text style={styles.published}>
          Tu comunidad ha publicado el {format(official, "d 'de' MMMM", { locale: es })}.
        </Text>
      ) : null}

      <Text style={styles.hint}>
        {source === 'official'
          ? 'Esta es la fecha oficial de tu comunidad.'
          : source === 'mine'
            ? 'Estás usando tu propia fecha.'
            : 'Es una estimación: tu comunidad todavía no ha publicado la suya.'}
        {'\n'}
        Si eliges otra, <Text style={styles.hintStrong}>mandará la tuya</Text>: no te la cambiaremos
        aunque se publique la oficial, solo te avisaremos.
      </Text>

      <View style={styles.actions}>
        <Button
          title="Guardar"
          fullWidth
          disabled={!picked}
          onPress={() => {
            // Elegir la fecha que ya seguíamos significa "vuelve a seguirla
            // tú", no "congélame este día": se guarda null y la cuenta atrás
            // vuelve a actualizarse sola cuando su comunidad publique.
            onSave(isFallback ? null : picked);
            onClose();
          }}
        />
        {source === 'mine' && !isFallback ? (
          <Button
            title={
              fallback
                ? `Volver a ${format(fallback, "d 'de' MMMM", { locale: es })}`
                : 'Quitar mi fecha'
            }
            variant="secondary"
            fullWidth
            onPress={() => {
              onSave(null);
              onClose();
            }}
          />
        ) : null}
      </View>
    </BottomSheet>
  );
}

const styles = StyleSheet.create({
  hint: {
    fontFamily: font.regular,
    fontSize: 12.5,
    lineHeight: 18,
    color: tokens.colors.textSecondary,
    marginTop: 14,
  },
  hintStrong: { fontFamily: font.semibold, color: tokens.colors.textPrimary },
  published: {
    fontFamily: font.medium,
    fontSize: 12.5,
    color: tokens.colors.accent,
    marginTop: 14,
  },
  actions: { gap: 10, marginTop: 18 },
});
