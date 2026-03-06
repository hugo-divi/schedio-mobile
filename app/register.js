import { useState } from 'react';
import { View, Text, KeyboardAvoidingView, Platform, ScrollView, TouchableOpacity, TextInput, StyleSheet } from 'react-native';
import { useRouter } from 'expo-router';
import { Eye, EyeOff, ArrowLeft } from 'lucide-react-native';
import Svg, { Path } from 'react-native-svg';
import * as Haptics from 'expo-haptics';
import useAuthStore from '../store/authStore';
import { signUp, signInWithGoogle } from '../services/auth';
import { tokens } from '../theme/tokens';

export default function Register() {
    const router = useRouter();
    const [displayName, setDisplayName] = useState('');
    const [email, setEmail] = useState('');
    const [password, setPassword] = useState('');
    const [confirmPassword, setConfirmPassword] = useState('');
    const [showPassword, setShowPassword] = useState(false);
    const [showConfirmPassword, setShowConfirmPassword] = useState(false);
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState(null);

    const setUser = useAuthStore(state => state.setUser);

    const handleRegister = async () => {
        if (!email || !password || !displayName) return;

        if (password !== confirmPassword) {
            setError('Las contraseñas no coinciden');
            return;
        }

        setLoading(true);
        setError(null);
        try {
            const user = await signUp(email, password, displayName);
            setUser(user);
            if (Platform.OS !== 'web') Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
            router.replace('/onboarding');
        } catch (err) {
            setError(err.message || 'Error al crear la cuenta. Inténtalo de nuevo.');
            if (Platform.OS !== 'web') Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error);
        } finally {
            setLoading(false);
        }
    };

    const handleGoogleSignUp = async () => {
        setLoading(true);
        setError(null);
        try {
            const user = await signInWithGoogle();
            setUser(user);
            if (Platform.OS !== 'web') Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
            router.replace('/onboarding');
        } catch (err) {
            setError('Google Sign-In falló. Inténtalo de nuevo.');
            if (Platform.OS !== 'web') Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error);
        } finally {
            setLoading(false);
        }
    };

    return (
        <View style={styles.container}>
            {/* Subtle Background Blobs */}
            <View style={[styles.blob, styles.blobTop]} />
            <View style={[styles.blob, styles.blobBottom]} />

            <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : 'height'} style={styles.keyboardView}>
                <ScrollView
                    contentContainerStyle={styles.scrollContent}
                    showsVerticalScrollIndicator={false}
                >
                    {/* Back Button */}
                    <TouchableOpacity
                        onPress={() => router.back()}
                        style={styles.backButton}
                        hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
                    >
                        <ArrowLeft size={24} color="#FFFFFF" />
                    </TouchableOpacity>

                    {/* Header */}
                    <View style={styles.header}>
                        <Text style={styles.title}>Crear cuenta</Text>
                        <Text style={styles.subtitle}>Únete al ecosistema de estudio inteligente</Text>
                    </View>

                    {/* Social Login Button */}
                    <TouchableOpacity
                        style={[styles.socialButton, loading && styles.buttonDisabled]}
                        onPress={handleGoogleSignUp}
                        disabled={loading}
                        activeOpacity={0.7}
                    >
                        <Svg width={20} height={20} viewBox="0 0 24 24" style={styles.socialIcon}>
                            <Path d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z" fill="#4285F4" />
                            <Path d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" fill="#34A853" />
                            <Path d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z" fill="#FBBC05" />
                            <Path d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z" fill="#EA4335" />
                        </Svg>
                        <Text style={styles.socialButtonText}>Continue with Google</Text>
                    </TouchableOpacity>

                    {/* Divider */}
                    <View style={styles.divider}>
                        <View style={styles.dividerLine} />
                        <Text style={styles.dividerText}>or</Text>
                        <View style={styles.dividerLine} />
                    </View>

                    {/* Username Input */}
                    <View style={styles.inputWrapper}>
                        <Text style={styles.label}>Username</Text>
                        <View style={styles.inputContainer}>
                            <TextInput
                                style={styles.input}
                                placeholder="username"
                                placeholderTextColor="#666666"
                                value={displayName}
                                onChangeText={(text) => {
                                    setDisplayName(text);
                                    setError(null);
                                }}
                                autoCapitalize="none"
                            />
                        </View>
                    </View>

                    {/* Email Input */}
                    <View style={styles.inputWrapper}>
                        <Text style={styles.label}>Email</Text>
                        <View style={styles.inputContainer}>
                            <TextInput
                                style={styles.input}
                                placeholder="email"
                                placeholderTextColor="#666666"
                                value={email}
                                onChangeText={(text) => {
                                    setEmail(text);
                                    setError(null);
                                }}
                                autoCapitalize="none"
                                keyboardType="email-address"
                            />
                        </View>
                    </View>

                    {/* Password Input */}
                    <View style={styles.inputWrapper}>
                        <Text style={styles.label}>Password</Text>
                        <View style={styles.inputContainer}>
                            <TextInput
                                style={styles.input}
                                placeholder="password"
                                placeholderTextColor="#666666"
                                value={password}
                                onChangeText={(text) => {
                                    setPassword(text);
                                    setError(null);
                                }}
                                secureTextEntry={!showPassword}
                            />
                            <TouchableOpacity
                                onPress={() => setShowPassword(!showPassword)}
                                style={styles.eyeIcon}
                                hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
                            >
                                {showPassword ? (
                                    <EyeOff size={20} color="#666666" />
                                ) : (
                                    <Eye size={20} color="#666666" />
                                )}
                            </TouchableOpacity>
                        </View>
                    </View>

                    {/* Confirm Password Input */}
                    <View style={styles.inputWrapper}>
                        <Text style={styles.label}>Confirm password</Text>
                        <View style={styles.inputContainer}>
                            <TextInput
                                style={styles.input}
                                placeholder="password"
                                placeholderTextColor="#666666"
                                value={confirmPassword}
                                onChangeText={(text) => {
                                    setConfirmPassword(text);
                                    setError(null);
                                }}
                                secureTextEntry={!showConfirmPassword}
                            />
                            <TouchableOpacity
                                onPress={() => setShowConfirmPassword(!showConfirmPassword)}
                                style={styles.eyeIcon}
                                hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
                            >
                                {showConfirmPassword ? (
                                    <EyeOff size={20} color="#666666" />
                                ) : (
                                    <Eye size={20} color="#666666" />
                                )}
                            </TouchableOpacity>
                        </View>
                    </View>

                    {/* Error Message */}
                    {error && (
                        <View style={styles.errorContainer}>
                            <Text style={styles.errorText}>{error}</Text>
                        </View>
                    )}

                    {/* Register Button */}
                    <TouchableOpacity
                        onPress={handleRegister}
                        disabled={loading || !email || !password || !displayName || !confirmPassword}
                        activeOpacity={0.8}
                        style={[
                            styles.primaryButton,
                            (loading || !email || !password || !displayName || !confirmPassword) && styles.buttonDisabled
                        ]}
                    >
                        <Text style={styles.primaryButtonText}>
                            {loading ? 'Creando cuenta...' : 'Crear cuenta'}
                        </Text>
                    </TouchableOpacity>

                    {/* Footer */}
                    <View style={styles.footer}>
                        <Text style={styles.footerText}>¿Ya tienes cuenta? </Text>
                        <TouchableOpacity onPress={() => router.push('/login')}>
                            <Text style={styles.footerLink}>Inicia sesión</Text>
                        </TouchableOpacity>
                    </View>

                    {/* Legal Text */}
                    <Text style={styles.legalText}>
                        Al continuar, aceptas nuestra{' '}
                        <Text style={styles.legalLink}>política de privacidad</Text>
                        {' '}y{' '}
                        <Text style={styles.legalLink}>términos de uso</Text>.
                    </Text>
                </ScrollView>
            </KeyboardAvoidingView>
        </View>
    );
}

const styles = StyleSheet.create({
    container: {
        flex: 1,
        backgroundColor: '#000000',
    },
    blob: {
        position: 'absolute',
        borderRadius: 9999,
    },
    blobTop: {
        top: -100,
        right: -100,
        width: 450,
        height: 450,
        backgroundColor: tokens.colors.purple,
        opacity: 0.05,
    },
    blobBottom: {
        bottom: -50,
        left: -80,
        width: 400,
        height: 400,
        backgroundColor: tokens.colors.blue,
        opacity: 0.04,
    },
    keyboardView: {
        flex: 1,
    },
    scrollContent: {
        flexGrow: 1,
        paddingHorizontal: 24,
        paddingTop: 60,
        paddingBottom: 40,
    },
    backButton: {
        width: 40,
        height: 40,
        borderRadius: 20,
        backgroundColor: '#1C1C1E',
        alignItems: 'center',
        justifyContent: 'center',
        marginBottom: 24,
    },
    header: {
        marginBottom: 32,
    },
    title: {
        fontSize: 32,
        fontWeight: '700',
        color: '#FFFFFF',
        marginBottom: 8,
    },
    subtitle: {
        fontSize: 15,
        fontWeight: '400',
        color: '#8E8E93',
    },
    socialButton: {
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'center',
        backgroundColor: '#1C1C1E',
        paddingVertical: 16,
        borderRadius: 12,
        marginBottom: 12,
    },
    socialIcon: {
        marginRight: 12,
    },
    socialButtonText: {
        color: '#FFFFFF',
        fontSize: 15,
        fontWeight: '600',
    },
    divider: {
        flexDirection: 'row',
        alignItems: 'center',
        marginVertical: 24,
    },
    dividerLine: {
        flex: 1,
        height: 1,
        backgroundColor: '#2C2C2E',
    },
    dividerText: {
        color: '#8E8E93',
        fontSize: 14,
        paddingHorizontal: 16,
    },
    inputWrapper: {
        marginBottom: 20,
    },
    label: {
        color: '#FFFFFF',
        fontSize: 15,
        fontWeight: '400',
        marginBottom: 8,
    },
    inputContainer: {
        backgroundColor: '#1C1C1E',
        borderRadius: 12,
        borderWidth: 1,
        borderColor: '#2C2C2E',
        position: 'relative',
    },
    input: {
        color: '#FFFFFF',
        fontSize: 15,
        paddingVertical: 16,
        paddingHorizontal: 16,
    },
    eyeIcon: {
        position: 'absolute',
        right: 16,
        top: 0,
        bottom: 0,
        justifyContent: 'center',
    },
    errorContainer: {
        backgroundColor: 'rgba(255, 69, 58, 0.1)',
        borderWidth: 1,
        borderColor: 'rgba(255, 69, 58, 0.3)',
        padding: 12,
        borderRadius: 12,
        marginBottom: 20,
    },
    errorText: {
        color: '#FF453A',
        fontSize: 13,
        textAlign: 'center',
    },
    primaryButton: {
        backgroundColor: '#FFFFFF',
        paddingVertical: 18,
        borderRadius: 100,
        alignItems: 'center',
        justifyContent: 'center',
        marginTop: 8,
        marginBottom: 24,
    },
    primaryButtonText: {
        color: '#000000',
        fontSize: 16,
        fontWeight: '600',
    },
    buttonDisabled: {
        opacity: 0.5,
    },
    footer: {
        flexDirection: 'row',
        justifyContent: 'center',
        alignItems: 'center',
        marginBottom: 16,
    },
    footerText: {
        color: '#8E8E93',
        fontSize: 14,
    },
    footerLink: {
        color: '#0A84FF',
        fontSize: 14,
        fontWeight: '600',
    },
    legalText: {
        color: '#666666',
        fontSize: 12,
        textAlign: 'center',
        lineHeight: 18,
    },
    legalLink: {
        color: '#0A84FF',
        textDecorationLine: 'underline',
    },
});
