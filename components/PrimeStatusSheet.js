import { useEffect, useState } from 'react';
import { View, Text, TouchableOpacity, Linking, StyleSheet } from 'react-native';
import { Crown, Check } from 'lucide-react-native';

import { tokens } from '../theme/tokens';
import { getPrimeStatus } from '../services/revenuecat';
import BottomSheet from './ui/BottomSheet';

const font = tokens.typography.families.inter;

const PLAY_SUBSCRIPTIONS = 'https://play.google.com/store/account/subscriptions';

/** Kept in step with the real gates in services/permissions.js. */
const UNLOCKED = [
  'Hasta 20 materias, cada una con su color',
  '15 subidas por semana a la Mochila',
  'Vista de Plan del mes completo',
  'Exportar tus notas y exámenes en PDF',
];

const formatSince = (value) => {
  if (!value) return null;
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return null;
  return date.toLocaleDateString('es-ES', { day: 'numeric', month: 'long', year: 'numeric' });
};

/**
 * What a Prime student gets when they tap their own badge.
 *
 * It replaces a floating one-line message that picked randomly from three
 * canned thank-yous: it was clipped by the header it hung under, and tapping
 * your own membership mark to be told a random sentence is a dead end. This
 * says what they have, since when, and how to manage it — which is also the
 * second door Play likes to see for cancelling.
 */
export default function PrimeStatusSheet({ visible, onClose }) {
  const [status, setStatus] = useState(null);

  useEffect(() => {
    if (!visible) return;
    let cancelled = false;
    getPrimeStatus().then((result) => {
      if (!cancelled) setStatus(result);
    });
    return () => {
      cancelled = true;
    };
  }, [visible]);

  const since = formatSince(status?.since);

  return (
    <BottomSheet visible={visible} onClose={onClose}>
      <View style={styles.head}>
        <Crown size={20} color={tokens.colors.premiumText} fill={tokens.colors.premiumText} />
        <Text style={styles.title}>Schedio Prime</Text>
      </View>
      {/* No date until RevenueCat answers — better a line that isn't there yet
          than a placeholder that reads like a real value. */}
      <Text style={styles.since}>{since ? `Activo desde el ${since}` : 'Activo'}</Text>

      <View style={styles.card}>
        {UNLOCKED.map((item) => (
          <View key={item} style={styles.row}>
            <Check size={14} color={tokens.colors.premiumText} strokeWidth={2.5} />
            <Text style={styles.rowText}>{item}</Text>
          </View>
        ))}
      </View>

      <TouchableOpacity
        activeOpacity={0.8}
        onPress={() => Linking.openURL(status?.managementURL || PLAY_SUBSCRIPTIONS)}
        accessibilityRole="button"
        style={styles.manage}
      >
        <Text style={styles.manageText}>Gestionar en Google Play</Text>
      </TouchableOpacity>

      <Text style={styles.thanks}>Gracias por sostener un proyecto pequeño.</Text>
    </BottomSheet>
  );
}

const styles = StyleSheet.create({
  head: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  title: {
    fontFamily: font.semibold,
    fontSize: 18,
    color: tokens.colors.textPrimary,
  },
  since: {
    fontFamily: font.regular,
    fontSize: 13,
    color: tokens.colors.textSecondary,
    marginTop: 4,
    marginBottom: 18,
  },
  card: {
    backgroundColor: tokens.colors.surfaceCard,
    borderWidth: 1,
    borderColor: tokens.colors.premiumBorder,
    borderRadius: tokens.radius.card,
    padding: 14,
    gap: 10,
  },
  row: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 10,
  },
  rowText: {
    flex: 1,
    fontFamily: font.regular,
    fontSize: 13,
    lineHeight: 19,
    color: tokens.colors.textPrimary,
  },
  manage: {
    marginTop: 16,
    paddingVertical: 13,
    alignItems: 'center',
    borderRadius: tokens.radius.btn,
    borderWidth: 1,
    borderColor: tokens.colors.borderDefault,
  },
  manageText: {
    fontFamily: font.medium,
    fontSize: 14,
    color: tokens.colors.textSecondary,
  },
  thanks: {
    fontFamily: font.regular,
    fontSize: 12,
    lineHeight: 18,
    textAlign: 'center',
    color: tokens.colors.textDisabled,
    marginTop: 14,
  },
});
