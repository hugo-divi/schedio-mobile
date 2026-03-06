import { View, Text, TextInput, StyleSheet } from 'react-native';
import { useState } from 'react';
import { tokens } from '../theme/tokens';

export const SchedioInput = ({
    label,
    value,
    onChangeText,
    placeholder,
    secureTextEntry,
    autoCapitalize = 'none',
    keyboardType = 'default'
}) => {
    const [isFocused, setIsFocused] = useState(false);

    return (
        <View className="mb-6">
            {label && (
                <Text
                    className="text-textTertiary font-black uppercase mb-2 ml-1"
                    style={{ fontSize: 10, letterSpacing: 2 }}
                >
                    {label}
                </Text>
            )}
            <View
                style={[
                    styles.container,
                    isFocused && styles.focusedContainer
                ]}
            >
                <TextInput
                    className="text-white font-semibold text-base py-4 px-5"
                    placeholder={placeholder}
                    placeholderTextColor={tokens.colors.textTertiary}
                    value={value}
                    onChangeText={onChangeText}
                    onFocus={() => setIsFocused(true)}
                    onBlur={() => setIsFocused(false)}
                    secureTextEntry={secureTextEntry}
                    autoCapitalize={autoCapitalize}
                    keyboardType={keyboardType}
                    selectionColor={tokens.colors.primary}
                />
            </View>
        </View>
    );
};

const styles = StyleSheet.create({
    container: {
        backgroundColor: tokens.colors.fillQuaternary,
        borderRadius: tokens.radius.sm,
        borderWidth: 1.5,
        borderColor: 'transparent',
    },
    focusedContainer: {
        borderColor: tokens.colors.primary,
        backgroundColor: tokens.colors.fillTertiary,
    }
});
