import { TouchableOpacity, Text, ActivityIndicator } from 'react-native';
import { tokens } from '../../theme/tokens';

/**
 * Design-system button. `primary` is the solid accent action, `secondary` the
 * bordered/transparent one, and `danger` the solid destructive one. Flat by
 * design — no gradients.
 *
 * `textColor` tints the label of a `secondary` button, for destructive actions
 * that shouldn't shout as loudly as a filled red one.
 *
 * Separate from PrimaryButton/SchedioButton, which screens awaiting redesign
 * still use with the old visual language.
 */
export function Button({
  title,
  onPress,
  variant = 'primary',
  fullWidth = false,
  disabled = false,
  loading = false,
  icon = null,
  textColor,
  style,
}) {
  const isPrimary = variant === 'primary';
  const isDanger = variant === 'danger';
  const filled = isPrimary || isDanger;
  const inactive = disabled || loading;

  const label = textColor ?? (filled ? '#FFFFFF' : tokens.colors.textPrimary);

  return (
    <TouchableOpacity
      onPress={onPress}
      disabled={inactive}
      activeOpacity={0.85}
      accessibilityRole="button"
      accessibilityState={{ disabled: inactive }}
      style={[
        {
          flexDirection: 'row',
          alignItems: 'center',
          justifyContent: 'center',
          gap: 8,
          paddingVertical: 12,
          paddingHorizontal: 20,
          borderRadius: tokens.radius.btn,
          backgroundColor: isPrimary
            ? tokens.colors.accent
            : isDanger
              ? tokens.colors.danger
              : 'transparent',
          borderWidth: filled ? 0 : 1,
          borderColor: tokens.colors.borderDefault,
          width: fullWidth ? '100%' : undefined,
          opacity: inactive ? 0.45 : 1,
        },
        style,
      ]}
    >
      {loading ? (
        <ActivityIndicator size="small" color={label} />
      ) : (
        <>
          {icon}
          <Text
            style={{
              fontFamily: tokens.typography.families.inter.semibold,
              fontSize: 15,
              color: label,
            }}
          >
            {title}
          </Text>
        </>
      )}
    </TouchableOpacity>
  );
}

export default Button;
