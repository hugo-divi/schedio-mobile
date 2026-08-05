import { useState } from 'react';
import {
  View,
  Text,
  Platform,
  ScrollView,
  TouchableOpacity,
  KeyboardAvoidingView,
  StyleSheet,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import { ChevronLeft } from 'lucide-react-native';
import * as Haptics from 'expo-haptics';
import Animated, { FadeInDown, FadeIn } from 'react-native-reanimated';

import useAuthStore from '../store/authStore';
import { signUp, signInWithGoogle, getAuthErrorMessage } from '../services/auth';
import { tokens } from '../theme/tokens';
import { openLegal } from '../constants/legal';
import Button from '../components/ui/Button';
import Input from '../components/ui/Input';
import { GoogleMark, OrDivider } from '../components/ui/SocialAuth';

const font = tokens.typography.families.inter;

const MIN_PASSWORD = 6;

export default function Register() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const setUser = useAuthStore((state) => state.setUser);

  const [displayName, setDisplayName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);

  const buzz = (type) => {
    if (Platform.OS !== 'web') Haptics.notificationAsync(type);
  };

  const canSubmit =
    displayName.trim() && email.trim() && password.length >= MIN_PASSWORD && confirmPassword;

  const handleRegister = async () => {
    if (!canSubmit) return;

    // The mock has a single password field. Kept as two on purpose: a typo in
    // the only password on a brand-new account locks the student out of it
    // before they have anything to recover with.
    if (password !== confirmPassword) {
      setError('Las contraseñas no coinciden.');
      buzz(Haptics.NotificationFeedbackType.Error);
      return;
    }

    setLoading(true);
    setError(null);
    try {
      const user = await signUp(email.trim(), password, displayName.trim());
      setUser(user);
      buzz(Haptics.NotificationFeedbackType.Success);
      // Fresh password accounts are never verified yet — Google accounts
      // (below) skip this screen entirely since Google already verified them.
      router.replace('/verify-email');
    } catch (err) {
      setError(getAuthErrorMessage(err));
      buzz(Haptics.NotificationFeedbackType.Error);
    } finally {
      setLoading(false);
    }
  };

  const handleGoogleSignUp = async () => {
    setLoading(true);
    setError(null);
    try {
      const user = await signInWithGoogle();
      if (user) {
        setUser(user);
        buzz(Haptics.NotificationFeedbackType.Success);
        router.replace('/onboarding');
      }
    } catch (err) {
      setError(
        err?.code === 'DEVELOPER_ERROR'
          ? 'Google Sign-In no está bien configurado en este build todavía.'
          : getAuthErrorMessage(err)
      );
      buzz(Haptics.NotificationFeedbackType.Error);
    } finally {
      setLoading(false);
    }
  };

  return (
    <View style={styles.container}>
      <View style={[styles.header, { paddingTop: insets.top + 8 }]}>
        <TouchableOpacity
          onPress={() => router.back()}
          style={styles.back}
          accessibilityRole="button"
          accessibilityLabel="Volver"
        >
          <ChevronLeft size={22} color={tokens.colors.textPrimary} strokeWidth={1.75} />
        </TouchableOpacity>
      </View>

      <KeyboardAvoidingView
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
        style={styles.flex}
      >
        <ScrollView
          contentContainerStyle={styles.content}
          showsVerticalScrollIndicator={false}
          keyboardShouldPersistTaps="handled"
        >
          <Animated.Text entering={FadeInDown.duration(300).delay(70)} style={styles.title}>
            Crea tu cuenta
          </Animated.Text>
          <Animated.Text entering={FadeInDown.duration(300).delay(110)} style={styles.subtitle}>
            Empieza a organizar tu estudio hoy
          </Animated.Text>

          {error ? (
            <Animated.View entering={FadeIn.duration(200)} style={styles.errorBox}>
              <Text style={styles.errorText}>{error}</Text>
            </Animated.View>
          ) : null}

          <Animated.View entering={FadeInDown.duration(300).delay(180)}>
            <Input
              label="Nombre completo"
              value={displayName}
              onChangeText={setDisplayName}
              placeholder="Tu nombre"
              autoCapitalize="words"
              autoComplete="name"
              textContentType="name"
              editable={!loading}
            />
          </Animated.View>

          <Animated.View entering={FadeInDown.duration(300).delay(250)} style={{ marginTop: 16 }}>
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
              autoComplete="new-password"
              textContentType="newPassword"
              editable={!loading}
            />
            <Text style={styles.hint}>Mínimo {MIN_PASSWORD} caracteres.</Text>
          </Animated.View>

          <Animated.View entering={FadeInDown.duration(300).delay(360)} style={{ marginTop: 16 }}>
            <Input
              label="Repite la contraseña"
              value={confirmPassword}
              onChangeText={setConfirmPassword}
              placeholder="••••••••"
              secure
              autoComplete="new-password"
              textContentType="newPassword"
              returnKeyType="go"
              onSubmitEditing={handleRegister}
              editable={!loading}
            />
          </Animated.View>

          {/* Checkpoint 1, item 4: the policies have to be linked from
              registration. The URLs live in constants/legal.js and are still
              blank because the documents themselves aren't written yet. */}
          <Animated.Text entering={FadeInDown.duration(300).delay(390)} style={styles.legal}>
            Al registrarte, aceptas los{' '}
            <Text style={styles.legalLink} onPress={() => openLegal('terms')}>
              Términos de servicio
            </Text>{' '}
            y la{' '}
            <Text style={styles.legalLink} onPress={() => openLegal('privacy')}>
              Política de privacidad
            </Text>
            .
          </Animated.Text>

          <Animated.View entering={FadeInDown.duration(300).delay(460)} style={{ marginTop: 24 }}>
            <Button
              title="Crear cuenta"
              fullWidth
              loading={loading}
              disabled={!canSubmit}
              onPress={handleRegister}
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
              onPress={handleGoogleSignUp}
            />
          </Animated.View>

          <Animated.View entering={FadeInDown.duration(300).delay(670)} style={styles.footer}>
            <Text style={styles.footerText}>¿Ya tienes cuenta? </Text>
            <TouchableOpacity onPress={() => router.replace('/login')} disabled={loading}>
              <Text style={styles.footerLink}>Inicia sesión</Text>
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
  header: {
    paddingHorizontal: 16,
  },
  back: {
    width: 44,
    height: 44,
    marginLeft: -4,
    borderRadius: tokens.radius.pill,
    alignItems: 'center',
    justifyContent: 'center',
  },
  content: {
    flexGrow: 1,
    paddingHorizontal: 24,
    paddingTop: 8,
    paddingBottom: 40,
  },
  title: {
    fontFamily: font.bold,
    fontSize: 23,
    color: tokens.colors.textPrimary,
    marginTop: 20,
    marginBottom: 6,
  },
  subtitle: {
    fontFamily: font.regular,
    fontSize: 15,
    color: tokens.colors.textSecondary,
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
  hint: {
    fontFamily: font.regular,
    fontSize: 12,
    color: tokens.colors.textDisabled,
    marginTop: 6,
  },
  legal: {
    fontFamily: font.regular,
    fontSize: 12,
    lineHeight: 18,
    color: tokens.colors.textSecondary,
    marginTop: 16,
  },
  legalLink: {
    fontFamily: font.medium,
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
