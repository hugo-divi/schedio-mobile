import { TouchableOpacity, Text, ActivityIndicator, View } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { tokens } from '../theme/tokens';

export const PrimaryButton = ({ title, onPress, loading, className, icon: Icon }) => {
    return (
        <TouchableOpacity
            activeOpacity={0.8}
            onPress={onPress}
            disabled={loading}
            style={tokens.shadows.primary}
            className={className}
        >
            <LinearGradient
                colors={[tokens.colors.blue, tokens.colors.indigo]}
                start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }}
                style={{ borderRadius: 20, paddingVertical: 16, paddingHorizontal: 32 }}
                className="flex-row items-center justify-center gap-3"
            >
                {Icon && <Icon size={20} color="white" />}
                {loading ? (
                    <ActivityIndicator color="white" />
                ) : (
                    <Text className="text-white font-bold text-lg tracking-wide">{title}</Text>
                )}
            </LinearGradient>
        </TouchableOpacity>
    );
};
