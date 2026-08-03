import { TouchableOpacity } from 'react-native';
import { tokens } from '../../theme/tokens';

/** Circular bordered icon button (36px) used in the home header. */
export function IconButton({ children, onPress, size = 36, accessibilityLabel }) {
  return (
    <TouchableOpacity
      onPress={onPress}
      activeOpacity={0.7}
      accessibilityRole="button"
      accessibilityLabel={accessibilityLabel}
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
