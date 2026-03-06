import { BlurView } from 'expo-blur';
import { View, StyleSheet, Platform } from 'react-native';
import { tokens } from '../theme/tokens';

/**
 * Standard Schedio Glass Card Component
 * Replicates the Web MVP's .glass class with 1:1 fidelity.
 */
export const GlassCard = ({
    children,
    className,
    style,
    intensity = tokens.blur.base,
    radius = tokens.radius.lg,
    padding = tokens.spacing.lg
}) => {
    return (
        <View style={[styles.outerContainer, { borderRadius: radius }, style]}>
            <BlurView
                intensity={intensity}
                tint="dark"
                className={`overflow-hidden border border-white/10 ${className}`}
                style={{ borderRadius: radius }}
            >
                <View
                    style={{
                        padding: padding,
                        backgroundColor: tokens.colors.fillQuaternary
                    }}
                >
                    {children}
                </View>
            </BlurView>
        </View>
    );
};

const styles = StyleSheet.create({
    outerContainer: {
        backgroundColor: 'transparent',
        ...Platform.select({
            ios: tokens.shadows.md,
            android: { elevation: 5 }
        })
    }
});
