import { View, Text } from 'react-native';
import { tokens } from '../../theme/tokens';

/** Section heading: 17/600, sits above a card or list. */
export function SectionTitle({ children, right = null }) {
  return (
    <View
      style={{
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'space-between',
        gap: 6,
        marginBottom: 12,
      }}
    >
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6, flexShrink: 1 }}>
        {typeof children === 'string' ? (
          <Text
            style={{
              fontFamily: tokens.typography.families.inter.semibold,
              fontSize: tokens.typography.sectionTitle.size,
              color: tokens.colors.textPrimary,
            }}
          >
            {children}
          </Text>
        ) : (
          children
        )}
      </View>
      {right}
    </View>
  );
}

/** Small uppercase label used inside cards ("HOY", "PRÓXIMOS EXÁMENES"). */
export function OverlineLabel({ children, style }) {
  return (
    <Text
      style={[
        {
          fontFamily: tokens.typography.families.inter.semibold,
          fontSize: 13,
          letterSpacing: 0.4,
          textTransform: 'uppercase',
          color: tokens.colors.textSecondary,
        },
        style,
      ]}
    >
      {children}
    </Text>
  );
}

export default SectionTitle;
