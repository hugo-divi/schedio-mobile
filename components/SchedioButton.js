import { TouchableOpacity, Text, StyleSheet, Platform, View } from 'react-native';
import * as Haptics from 'expo-haptics';
import { tokens } from '../theme/tokens';

export const SchedioButton = ({
    title,
    onPress,
    variant = 'primary',
    size = 'md',
    disabled = false,
    loading = false,
    className = '',
    icon: Icon
}) => {

    const handlePress = () => {
        if (disabled || loading) return;
        if (Platform.OS !== 'web') {
            Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
        }
        onPress?.();
    };

    const isPrimary = variant === 'primary';
    const isSecondary = variant === 'secondary';
    const isOutline = variant === 'outline';

    return (
        <TouchableOpacity
            onPress={handlePress}
            activeOpacity={0.8}
            disabled={disabled || loading}
            className={`flex-row items-center justify-center rounded-full ${className}`}
            style={[
                styles.button,
                isPrimary && styles.primary,
                isSecondary && styles.secondary,
                isOutline && styles.outline,
                size === 'lg' ? styles.lg : styles.md,
                (disabled || loading) && styles.disabled,
                isPrimary && !disabled && styles.primaryShadow
            ]}
        >
            {Icon && <Icon size={size === 'lg' ? 24 : 20} color={isPrimary ? '#fff' : tokens.colors.primary} style={{ marginRight: 8 }} />}
            <Text
                style={[
                    styles.text,
                    isPrimary ? styles.textPrimary : styles.textSecondary,
                    size === 'lg' ? styles.textLg : styles.textMd
                ]}
            >
                {loading ? '...' : title}
            </Text>
        </TouchableOpacity>
    );
};

const styles = StyleSheet.create({
    button: {
        borderWidth: 1.5,
        borderColor: 'transparent',
    },
    primary: {
        backgroundColor: tokens.colors.primary,
        borderColor: tokens.colors.primary,
    },
    secondary: {
        backgroundColor: tokens.colors.fillQuaternary,
        borderColor: 'transparent',
    },
    outline: {
        backgroundColor: 'transparent',
        borderColor: tokens.colors.primary,
    },
    md: {
        paddingVertical: 14,
        paddingHorizontal: 24,
    },
    lg: {
        paddingVertical: 18,
        paddingHorizontal: 32,
    },
    disabled: {
        opacity: 0.5,
    },
    primaryShadow: {
        ...Platform.select({
            ios: {
                shadowColor: tokens.colors.primary,
                shadowOffset: { width: 0, height: 8 },
                shadowOpacity: 0.3,
                shadowRadius: 15,
            },
            android: {
                elevation: 8,
            }
        })
    },
    text: {
        fontWeight: '900',
        textTransform: 'uppercase',
        letterSpacing: 1,
    },
    textPrimary: {
        color: '#FFFFFF',
    },
    textSecondary: {
        color: tokens.colors.primary,
    },
    textMd: {
        fontSize: 12,
    },
    textLg: {
        fontSize: 14,
    }
});
