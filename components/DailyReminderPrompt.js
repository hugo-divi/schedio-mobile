import { View, Text, TouchableOpacity, StyleSheet } from 'react-native';
import { BellRing } from 'lucide-react-native';
import { tokens } from '../theme/tokens';
import Card from './ui/Card';

const font = tokens.typography.families.inter;

/**
 * The invitation to the daily reminder, under "Hoy" on Inicio, until the
 * student either sets it up or says not now (remembered per account on the
 * device). It asks with the reason in hand — the plan right above it — which
 * is when a notification permission has the best chance of being a yes.
 */
export default function DailyReminderPrompt({ onChoose, onDismiss }) {
  return (
    <Card padding={16}>
      <View style={styles.row}>
        <View style={styles.icon}>
          <BellRing size={18} color={tokens.colors.accent} strokeWidth={1.75} />
        </View>
        <View style={styles.body}>
          <Text style={styles.title}>¿Te aviso cada día con tu plan?</Text>
          <Text style={styles.text}>
            A la hora que elijas, con lo que te toca. Una vez al día, y solo si te queda algo.
          </Text>
        </View>
      </View>
      <View style={styles.actions}>
        <TouchableOpacity onPress={onDismiss} style={styles.secondary} accessibilityRole="button">
          <Text style={styles.secondaryText}>Ahora no</Text>
        </TouchableOpacity>
        <TouchableOpacity onPress={onChoose} style={styles.primary} accessibilityRole="button">
          <Text style={styles.primaryText}>Elegir hora</Text>
        </TouchableOpacity>
      </View>
    </Card>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: 'row', gap: 12, alignItems: 'flex-start' },
  icon: {
    width: 34,
    height: 34,
    borderRadius: tokens.radius.pill,
    backgroundColor: tokens.colors.accentSoftBg,
    alignItems: 'center',
    justifyContent: 'center',
  },
  body: { flex: 1, minWidth: 0 },
  title: { fontFamily: font.semibold, fontSize: 15, color: tokens.colors.textPrimary },
  text: {
    fontFamily: font.regular,
    fontSize: 13,
    lineHeight: 18,
    color: tokens.colors.textSecondary,
    marginTop: 2,
  },
  actions: { flexDirection: 'row', justifyContent: 'flex-end', gap: 8, marginTop: 12 },
  secondary: { paddingHorizontal: 14, paddingVertical: 9 },
  secondaryText: { fontFamily: font.medium, fontSize: 14, color: tokens.colors.textSecondary },
  primary: {
    paddingHorizontal: 14,
    paddingVertical: 9,
    borderRadius: tokens.radius.btn,
    backgroundColor: tokens.colors.accent,
  },
  primaryText: { fontFamily: font.semibold, fontSize: 14, color: '#FFFFFF' },
});
