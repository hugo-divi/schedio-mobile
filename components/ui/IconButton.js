import { TouchableOpacity } from 'react-native';
import { tokens } from '../../theme/tokens';

/**
 * Circular bordered icon button (36px) used in the home header. The visible
 * circle stays 36px by design, but the tap target is padded out to the
 * ~44pt/48dp platform-recommended minimum via `hitSlop` rather than by
 * inflating the circle itself.
 */
export function IconButton({ children, onPress, size = 36, accessibilityLabel }) {
  const slop = Math.max(0, Math.ceil((44 - size) / 2));

  return (
    <TouchableOpacity
      onPress={onPress}
      activeOpacity={0.7}
      accessibilityRole="button"
      accessibilityLabel={accessibilityLabel}
      hitSlop={{ top: slop, bottom: slop, left: slop, right: slop }}
      style={{
        width: size,
        height: size,
        borderRadius: tokens.radius.pill,
        borderWidth: 1,
        borderColor: tokens.colors.borderDefault,
        alignItems: 'center',
        justifyContent: 'center',
      }}
    >
      {children}
    </TouchableOpacity>
  );
}

export default IconButton;
