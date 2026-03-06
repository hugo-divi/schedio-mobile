import { View, ActivityIndicator } from 'react-native';

// Placeholder component for session redirect in tab bar
// The actual navigation is handled by the tab bar listener
export default function SessionRedirect() {
    return (
        <View style={{ flex: 1, backgroundColor: '#000000', justifyContent: 'center', alignItems: 'center' }}>
            <ActivityIndicator size="large" color="#4A90E2" />
        </View>
    );
}
