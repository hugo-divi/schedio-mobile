import { BlurView } from 'expo-blur';
import { View, Platform } from 'react-native';
import { tokens } from '../theme/tokens';

export const GlassCard = ({ children, className, intensity = tokens.blur.base }) => {
    return (
        <BlurView
            intensity={intensity}
            tint="dark"
            className={`overflow-hidden border border-white/10 ${className}`}
            style={{ borderRadius: tokens.radius.lg }}
        >
            <View className="bg-white/5" style={{ padding: tokens.spacing.lg }}>
                {children}
            </View>
        </BlurView>
    );
};
