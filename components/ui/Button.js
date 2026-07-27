import { TouchableOpacity, Text, ActivityIndicator } from 'react-native';
import { tokens } from '../../theme/tokens';

/**
 * Design-system button. `primary` is the solid accent action, `secondary` is
 * the bordered/transparent one. Flat by design — no gradients.
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
  style,
}) {
  const isPrimary = variant === 'primary';
  const inactive = disabled || loading;

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
          backgroundColor: isPrimary ? tokens.colors.accent : 'transparent',
          borderWidth: isPrimary ? 0 : 1,
          borderColor: tokens.colors.borderDefault,
          width: fullWidth ? '100%' : undefined,
          opacity: inactive ? 0.45 : 1,
        },
        style,
      ]}
    >
      {loading ? (
        <ActivityIndicator size="small" color={isPrimary ? '#FFFFFF' : tokens.colors.textPrimary} />
      ) : (
        <>
          {icon}
          <Text
            style={{
              fontFamily: tokens.typography.families.inter.semibold,
              fontSize: 15,
              color: isPrimary ? '#FFFFFF' : tokens.colors.textPrimary,
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
