import { View, Text, TouchableOpacity, StyleSheet } from 'react-native';
import { Layers } from 'lucide-react-native';
import { BottomSheet } from './ui/BottomSheet';
import { Button } from './ui/Button';
import { tokens } from '../theme/tokens';

const font = tokens.typography.families.inter;

/**
 * The sheet that appears when a free-tier limit blocks an action (materias,
 * Mochila uploads, …). Mirrors Paywall-01 in the design system: icon, plain
 * explanation of what just happened, and a single clear way forward.
 */
export function PrimeLimitSheet({
  visible,
  onClose,
  title,
  description,
  onUpgrade,
  icon: Icon = Layers,
}) {
  return (
    <BottomSheet visible={visible} onClose={onClose}>
      <View style={styles.body}>
        <View style={styles.iconCircle}>
          <Icon size={40} strokeWidth={1.5} color={tokens.colors.accent} />
        </View>
        <Text style={styles.title}>{title}</Text>
        {description ? <Text style={styles.description}>{description}</Text> : null}
      </View>

      <View style={styles.actions}>
        <Button title="Ver planes Schedio Prime" onPress={onUpgrade} fullWidth />
        <TouchableOpacity onPress={onClose} style={styles.dismiss}>
          <Text style={styles.dismissText}>Ahora no</Text>
        </TouchableOpacity>
      </View>
    </BottomSheet>
  );
}

export default PrimeLimitSheet;

const styles = StyleSheet.create({
  body: {
    alignItems: 'center',
    gap: 20,
    paddingTop: 8,
    paddingBottom: 12,
  },
  iconCircle: {
    width: 88,
    height: 88,
    borderRadius: 44,
    backgroundColor: tokens.colors.surfaceHover,
    borderWidth: 1,
    borderColor: tokens.colors.borderDefault,
    alignItems: 'center',
    justifyContent: 'center',
  },
  title: {
    fontFamily: font.bold,
    fontSize: 20,
    lineHeight: 27,
    color: tokens.colors.textPrimary,
    textAlign: 'center',
  },
  description: {
    fontFamily: font.regular,
    fontSize: 15,
    lineHeight: 22,
    color: tokens.colors.textSecondary,
    textAlign: 'center',
  },
  actions: {
    alignItems: 'center',
    gap: 14,
    marginTop: 24,
  },
  dismiss: {
    padding: 8,
  },
  dismissText: {
    fontFamily: font.medium,
    fontSize: 14,
    color: tokens.colors.textDisabled,
  },
});
