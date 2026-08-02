import { useState } from 'react';
import {
  View,
  Text,
  Image,
  Platform,
  ScrollView,
  TouchableOpacity,
  KeyboardAvoidingView,
  Alert,
  StyleSheet,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import * as Haptics from 'expo-haptics';
import Animated, { FadeInDown, FadeIn } from 'react-native-reanimated';

import useAuthStore from '../store/authStore';
import { signIn, signInWithGoogle } from '../services/auth';
import { auth } from '../services/firebase';
import { needsOnboarding } from '../services/onboarding';
import { tokens } from '../theme/tokens';
import Button from '../components/ui/Button';
import Input from '../components/ui/Input';
import { GoogleMark, OrDivider } from '../components/ui/SocialAuth';

const font = tokens.typography.families.inter;

export default function Login() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const setUser = useAuthStore((state) => state.setUser);

  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);

  const buzz = (type) => {
    if (Platform.OS !== 'web') Haptics.notificationAsync(type);
  };

  const handleLogin = async () => {
    if (!email || !password) return;
    setLoading(true);
    setError(null);
    try {
      const user = await signIn(email, password);
      setUser(user);
      buzz(Haptics.NotificationFeedbackType.Success);
      // An account that abandoned the onboarding goes back into it rather than
      // landing on a dashboard with no subjects.
      router.replace((await needsOnboarding(user.uid)) ? '/onboarding' : '/dashboard');
    } catch (err) {
      console.error('[Login] Error:', err);
      setError(
        err.userMessage || err.message || 'Error de autenticación. Revisa tus credenciales.'
      );
      buzz(Haptics.NotificationFeedbackType.Error);
    } finally {
      setLoading(false);
    }
  };

  const handleGoogleLogin = async () => {
    setLoading(true);
    setError(null);
    try {
      const user = await signInWithGoogle();
      // Null means a redirect is in flight (the web flow): the page reloads and
      // the auth listener picks it up, so there is nothing to do here.
      if (user) {
        setUser(user);
        buzz(Haptics.NotificationFeedbackType.Success);
        router.replace((await needsOnboarding(user.uid)) ? '/onboarding' : '/dashboard');
      }
    } catch (err) {
      setError(
        err?.code === 'auth/unauthorized-domain'
          ? 'Dominio no autorizado en Firebase. Añade localhost a los dominios autorizados en la consola de Firebase.'
          : err?.message || 'Google Sign-In falló. Inténtalo de nuevo.'
      );
      buzz(Haptics.NotificationFeedbackType.Error);
    } finally {
      setLoading(false);
    }
  };

  /**
   * New here — the screen had no way to recover a password, so a student who
   * forgot theirs was simply locked out. Same call settings already uses.
   */
  const handleForgotPassword = async () => {
    if (!email.trim()) {
      Alert.alert('Restablecer contraseña', 'Escribe tu correo arriba y volveremos a intentarlo.');
      return;
    }
    try {
      const { sendPasswordResetEmail } = await import('firebase/auth');
      await sendPasswordResetEmail(auth, email.trim());
      Alert.alert('Correo enviado', `Revisa ${email.trim()} para restablecer tu contraseña.`);
    } catch {
      Alert.alert('Error', 'No se pudo enviar el correo. Comprueba la dirección.');
    }
  };

  return (
    <View style={styles.container}>
      <KeyboardAvoidingView
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
        style={styles.flex}
      >
        <ScrollView
          contentContainerStyle={[styles.content, { paddingTop: insets.top + 48 }]}
          showsVerticalScrollIndicator={false}
          keyboardShouldPersistTaps="handled"
        >
          <Animated.View entering={FadeIn.duration(400)} style={styles.brand}>
            <View style={styles.logoBadge}>
              {/* The brand mark, not the launcher icon: assets/icon.png is the
                  rounded app tile and reads as a screenshot of the app inside
                  its own login screen. */}
              <Image
                source={require('../assets/images/schedio-mark.png')}
                style={styles.logo}
                resizeMode="contain"
              />
            </View>
            <Text style={styles.brandName}>Schedio</Text>
          </Animated.View>

          <Animated.Text entering={FadeInDown.duration(300).delay(80)} style={styles.tagline}>
            Que el estudio sea fácil
          </Animated.Text>

          <Animated.Text entering={FadeInDown.duration(300).delay(160)} style={styles.title}>
            Bienvenido de nuevo
          </Animated.Text>

          {error ? (
            <Animated.View entering={FadeIn.duration(200)} style={styles.errorBox}>
              <Text style={styles.errorText}>{error}</Text>
            </Animated.View>
          ) : null}

          <Animated.View entering={FadeInDown.duration(300).delay(240)}>
            <Input
              label="Correo electrónico"
              value={email}
              onChangeText={setEmail}
              placeholder="tucorreo@ejemplo.com"
              keyboardType="email-address"
              autoComplete="email"
              textContentType="emailAddress"
              editable={!loading}
            />
          </Animated.View>

          <Animated.View entering={FadeInDown.duration(300).delay(320)} style={{ marginTop: 16 }}>
            <Input
              label="Contraseña"
              value={password}
              onChangeText={setPassword}
              placeholder="••••••••"
              secure
              autoComplete="current-password"
              textContentType="password"
              returnKeyType="go"
              onSubmitEditing={handleLogin}
              editable={!loading}
            />
          </Animated.View>

          <Animated.View entering={FadeInDown.duration(300).delay(380)} style={styles.forgotRow}>
            <TouchableOpacity onPress={handleForgotPassword} disabled={loading}>
              <Text style={styles.link}>¿Olvidaste tu contraseña?</Text>
            </TouchableOpacity>
          </Animated.View>

          <Animated.View entering={FadeInDown.duration(300).delay(460)} style={{ marginTop: 24 }}>
            <Button
              title="Iniciar sesión"
              fullWidth
              loading={loading}
              disabled={!email || !password}
              onPress={handleLogin}
            />
          </Animated.View>

          <Animated.View entering={FadeInDown.duration(300).delay(540)}>
            <OrDivider />
          </Animated.View>

          <Animated.View entering={FadeInDown.duration(300).delay(600)}>
            <Button
              title="Continuar con Google"
              variant="secondary"
              fullWidth
              disabled={loading}
              icon={<GoogleMark />}
              onPress={handleGoogleLogin}
            />
          </Animated.View>

          <Animated.View entering={FadeInDown.duration(300).delay(670)} style={styles.footer}>
            <Text style={styles.footerText}>¿No tienes cuenta? </Text>
            <TouchableOpacity onPress={() => router.push('/register')} disabled={loading}>
              <Text style={styles.footerLink}>Regístrate</Text>
            </TouchableOpacity>
          </Animated.View>
        </ScrollView>
      </KeyboardAvoidingView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: tokens.colors.background,
  },
  flex: {
    flex: 1,
  },
  content: {
    flexGrow: 1,
    paddingHorizontal: 24,
    paddingBottom: 40,
  },
  brand: {
    alignItems: 'center',
    gap: 12,
  },
  logoBadge: {
    width: 64,
    height: 64,
    borderRadius: 18,
    backgroundColor: '#FFFFFF',
    alignItems: 'center',
    justifyContent: 'center',
    overflow: 'hidden',
  },
  logo: {
    width: 34,
    height: 34,
  },
  brandName: {
    fontFamily: font.bold,
    fontSize: 20,
    letterSpacing: 0.2,
    color: tokens.colors.textPrimary,
  },
  tagline: {
    fontFamily: font.regular,
    fontSize: 15,
    color: tokens.colors.textSecondary,
    textAlign: 'center',
    marginTop: 10,
  },
  title: {
    fontFamily: font.bold,
    fontSize: 23,
    color: tokens.colors.textPrimary,
    textAlign: 'center',
    marginTop: 40,
    marginBottom: 28,
  },
  errorBox: {
    padding: 12,
    borderRadius: tokens.radius.btn,
    backgroundColor: 'rgba(216, 96, 74, 0.12)',
    borderWidth: 1,
    borderColor: 'rgba(216, 96, 74, 0.3)',
    marginBottom: 16,
  },
  errorText: {
    fontFamily: font.medium,
    fontSize: 13,
    lineHeight: 19,
    color: tokens.colors.danger,
  },
  forgotRow: {
    alignItems: 'flex-end',
    marginTop: 10,
  },
  link: {
    fontFamily: font.medium,
    fontSize: 13,
    color: tokens.colors.accent,
  },
  footer: {
    flexDirection: 'row',
    justifyContent: 'center',
    alignItems: 'center',
    marginTop: 28,
  },
  footerText: {
    fontFamily: font.regular,
    fontSize: 13,
    color: tokens.colors.textSecondary,
  },
  footerLink: {
    fontFamily: font.semibold,
    fontSize: 13,
    color: tokens.colors.accent,
  },
});
