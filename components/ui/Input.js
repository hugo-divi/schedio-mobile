import { useState } from 'react';
import { View, Text, TextInput, TouchableOpacity, StyleSheet } from 'react-native';
import { Eye, EyeOff } from 'lucide-react-native';
import { tokens } from '../../theme/tokens';

const font = tokens.typography.families.inter;

/**
 * Labelled text field of the redesigned language: flat surface, hairline
 * border that turns accent on focus. Mirrors components/forms/Input.jsx in the
 * design system.
 *
 * `secure` adds the show/hide toggle rather than making callers rebuild it.
 */
export function Input({
  label,
  value,
  onChangeText,
  placeholder,
  secure = false,
  autoCapitalize = 'none',
  keyboardType,
  autoComplete,
  textContentType,
  returnKeyType,
  onSubmitEditing,
  editable = true,
  style,
}) {
  const [focused, setFocused] = useState(false);
  const [revealed, setRevealed] = useState(false);

  return (
    <View style={style}>
      {label ? <Text style={styles.label}>{label}</Text> : null}
      <View style={styles.field}>
        <TextInput
          style={[styles.input, focused && styles.inputFocused, secure && styles.inputSecure]}
          value={value}
          onChangeText={onChangeText}
          placeholder={placeholder}
          placeholderTextColor={tokens.colors.textDisabled}
          secureTextEntry={secure && !revealed}
          autoCapitalize={autoCapitalize}
          autoCorrect={false}
          keyboardType={keyboardType}
          autoComplete={autoComplete}
          textContentType={textContentType}
          returnKeyType={returnKeyType}
          onSubmitEditing={onSubmitEditing}
          editable={editable}
          onFocus={() => setFocused(true)}
          onBlur={() => setFocused(false)}
        />
        {secure ? (
          <TouchableOpacity
            onPress={() => setRevealed((v) => !v)}
            style={styles.toggle}
            accessibilityRole="button"
            accessibilityLabel={revealed ? 'Ocultar contraseña' : 'Mostrar contraseña'}
            hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
          >
            {revealed ? (
              <EyeOff size={18} color={tokens.colors.textSecondary} strokeWidth={1.75} />
            ) : (
              <Eye size={18} color={tokens.colors.textSecondary} strokeWidth={1.75} />
            )}
          </TouchableOpacity>
        ) : null}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  label: {
    fontFamily: font.medium,
    fontSize: 13,
    color: tokens.colors.textSecondary,
    marginBottom: 6,
  },
  field: {
    justifyContent: 'center',
  },
  input: {
    backgroundColor: tokens.colors.surfaceCard,
    borderWidth: 1,
    borderColor: tokens.colors.borderDefault,
    borderRadius: tokens.radius.btn,
    paddingHorizontal: 12,
    paddingVertical: 12,
    fontFamily: font.regular,
    fontSize: 15,
    color: tokens.colors.textPrimary,
  },
  inputFocused: {
    borderColor: tokens.colors.accent,
  },
  inputSecure: {
    paddingRight: 44,
  },
  toggle: {
    position: 'absolute',
    right: 4,
    width: 36,
    height: 36,
    alignItems: 'center',
    justifyContent: 'center',
  },
});

export default Input;
