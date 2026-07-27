import { View } from 'react-native';
import { tokens } from '../../theme/tokens';

/**
 * Flat surface of the redesigned language: solid fill + hairline border, no
 * blur or shadow. Mirrors components/surfaces/Card.jsx in the design system.
 *
 * Not a replacement for GlassCard — that one is still used by screens awaiting
 * redesign.
 */
export function Card({ children, padding = 20, style }) {
  return (
    <View
      style={[
        {
          backgroundColor: tokens.colors.surfaceCard,
          borderWidth: 1,
          borderColor: tokens.colors.borderDefault,
          borderRadius: tokens.radius.card,
          padding,
        },
        style,
      ]}
    >
      {children}
    </View>
  );
}

export default Card;
