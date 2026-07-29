import {
  View,
  Text,
  Modal,
  StyleSheet,
  KeyboardAvoidingView,
  Platform,
  Pressable,
} from 'react-native';
import Animated, { SlideInDown } from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { tokens } from '../../theme/tokens';

const font = tokens.typography.families.inter;

/**
 * The sheet every home-screen modal sits in: dimmed backdrop, rounded top,
 * grab handle, slide-up entrance. Tapping the backdrop dismisses; taps inside
 * the sheet don't bubble out to it.
 *
 * Pass `title`/`subtitle` for the standard heading, or render your own header
 * in `children` and leave them out.
 */
export function BottomSheet({
  visible,
  onClose,
  title,
  subtitle,
  children,
  avoidKeyboard = false,
}) {
  const insets = useSafeAreaInsets();

  const sheet = (
    <Pressable onPress={() => {}}>
      <Animated.View
        entering={SlideInDown.duration(300)}
        style={[styles.sheet, { paddingBottom: 24 + insets.bottom }]}
      >
        <View style={styles.handle} />
        {title ? <Text style={styles.title}>{title}</Text> : null}
        {subtitle ? <Text style={styles.subtitle}>{subtitle}</Text> : null}
        {children}
      </Animated.View>
    </Pressable>
  );

  return (
    <Modal animationType="fade" transparent visible={visible} onRequestClose={onClose}>
      <Pressable style={styles.overlay} onPress={onClose}>
        {avoidKeyboard ? (
          <KeyboardAvoidingView
            behavior={Platform.OS === 'ios' ? 'padding' : undefined}
            style={styles.keyboardView}
          >
            {sheet}
          </KeyboardAvoidingView>
        ) : (
          sheet
        )}
      </Pressable>
    </Modal>
  );
}

/** Small caps label above a field or group. */
export function FieldLabel({ children, style }) {
  return <Text style={[styles.label, style]}>{children}</Text>;
}

export const sheetStyles = StyleSheet.create({
  /** Helper text under a field; turns red via `helperError`. */
  helper: {
    fontFamily: font.regular,
    fontSize: 13,
    color: tokens.colors.textSecondary,
    marginTop: 8,
  },
  helperError: {
    color: tokens.colors.danger,
  },
  /** Side-by-side footer buttons. */
  actions: {
    flexDirection: 'row',
    gap: 12,
    marginTop: 24,
  },
  actionButton: {
    flex: 1,
  },
});

const styles = StyleSheet.create({
  overlay: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.55)',
    justifyContent: 'flex-end',
  },
  keyboardView: {
    justifyContent: 'flex-end',
  },
  sheet: {
    backgroundColor: tokens.colors.surfaceCard,
    borderTopWidth: 1,
    borderTopColor: tokens.colors.borderDefault,
    borderTopLeftRadius: tokens.radius.sheet,
    borderTopRightRadius: tokens.radius.sheet,
    paddingHorizontal: 24,
    paddingTop: 12,
  },
  handle: {
    width: 36,
    height: 4,
    borderRadius: tokens.radius.pill,
    backgroundColor: tokens.colors.borderDefault,
    alignSelf: 'center',
    marginBottom: 20,
  },
  title: {
    fontFamily: font.bold,
    fontSize: 22,
    color: tokens.colors.textPrimary,
  },
  subtitle: {
    fontFamily: font.regular,
    fontSize: 15,
    color: tokens.colors.textSecondary,
    marginTop: 4,
  },
  label: {
    fontFamily: font.medium,
    fontSize: 13,
    color: tokens.colors.textSecondary,
    marginBottom: 6,
  },
});

export default BottomSheet;
