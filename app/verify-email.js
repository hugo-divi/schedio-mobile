import { useState } from 'react';
import { View, Text, Platform, StyleSheet } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import { MailCheck } from 'lucide-react-native';
import * as Haptics from 'expo-haptics';
import Animated, { FadeInDown, FadeIn } from 'react-native-reanimated';

import useAuthStore from '../store/authStore';
import { resendVerificationEmail, refreshEmailVerified } from '../services/auth';
import { auth } from '../services/firebase';
import { tokens } from '../theme/tokens';
import Button from '../components/ui/Button';

const font = tokens.typography.families.inter;
const RESEND_COOLDOWN_MS = 30000;

export default function VerifyEmail() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const clearUser = useAuthStore((state) => state.clearUser);
  const email = auth.currentUser?.email;

  const [checking, setChecking] = useState(false);
  const [resending, setResending] = useState(false);
  const [cooldownUntil, setCooldownUntil] = useState(0);
  const [message, setMessage] = useState(null);

  const buzz = (type) => {
    if (Platform.OS !== 'web') Haptics.notificationAsync(type);
  };

  const handleCheckAgain = async () => {
    setChecking(true);
    setMessage(null);
    try {
      const verified = await refreshEmailVerified();
      if (!verified) {
        setMessage({
          type: 'info',
          text: 'Todavía no aparece verificado. Revisa tu correo y pulsa el enlace.',
        });
        buzz(Haptics.NotificationFeedbackType.Warning);
        return;
      }
      buzz(Haptics.NotificationFeedbackType.Success);
      router.replace('/dashboard');
    } catch {
      setMessage({ type: 'error', text: 'No se pudo comprobar el estado. Inténtalo de nuevo.' });
      buzz(Haptics.NotificationFeedbackType.Error);
    } finally {
      setChecking(false);
    }
  };

  const handleResend = async () => {
    if (Date.now() < cooldownUntil) return;
    setResending(true);
    setMessage(null);
    try {
      await resendVerificationEmail();
      setCooldownUntil(Date.now() + RESEND_COOLDOWN_MS);
      setMessage({ type: 'success', text: `Correo reenviado a ${email}.` });
    } catch (err) {
      setMessage({
        type: 'error',
        text:
          err?.code === 'auth/too-many-requests'
            ? 'Demasiados intentos seguidos. Espera un momento y vuelve a probar.'
            : 'No se pudo reenviar el correo. Inténtalo de nuevo.',
      });
    } finally {
      setResending(false);
    }
  };

  const handleLogout = async () => {
    try {
      await auth.signOut();
    } catch {
      // Ignore — we're navigating away regardless.
    }
    clearUser();
    router.replace('/login');
  };

  return (
    <View style={styles.container}>
      <View style={[styles.content, { paddingTop: insets.top + 64 }]}>
        <Animated.View entering={FadeIn.duration(400)} style={styles.iconBadge}>
          <MailCheck size={32} color={tokens.colors.accent} strokeWidth={1.75} />
        </Animated.View>

        <Animated.Text entering={FadeInDown.duration(300).delay(120)} style={styles.title}>
          Verifica tu correo
        </Animated.Text>

        <Animated.Text entering={FadeInDown.duration(300).delay(180)} style={styles.subtitle}>
          Te hemos enviado un enlace a{'\n'}
          <Text style={styles.email}>{email}</Text>
          {'\n'}Ábrelo y vuelve aquí.
        </Animated.Text>

        {message ? (
          <Animated.View
            entering={FadeIn.duration(200)}
            style={[styles.messageBox, message.type === 'error' && styles.messageBoxError]}
          >
            <Text style={[styles.messageText, message.type === 'error' && styles.messageTextError]}>
              {message.text}
            </Text>
          </Animated.View>
        ) : null}

        <Animated.View entering={FadeInDown.duration(300).delay(260)} style={{ marginTop: 32 }}>
          <Button
            title="Ya lo he verificado"
            fullWidth
            loading={checking}
            disabled={resending}
            onPress={handleCheckAgain}
          />
        </Animated.View>

        <Animated.View entering={FadeInDown.duration(300).delay(320)} style={{ marginTop: 12 }}>
          <Button
            title={Date.now() < cooldownUntil ? 'Correo reenviado' : 'Reenviar correo'}
            variant="secondary"
            fullWidth
            loading={resending}
            disabled={checking || Date.now() < cooldownUntil}
            onPress={handleResend}
          />
        </Animated.View>

        <Animated.View entering={FadeInDown.duration(300).delay(380)} style={styles.footer}>
          <Text style={styles.footerLink} onPress={handleLogout}>
            Cerrar sesión
          </Text>
        </Animated.View>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: tokens.colors.background,
  },
  content: {
    flex: 1,
    paddingHorizontal: 24,
    alignItems: 'center',
  },
  iconBadge: {
    width: 72,
    height: 72,
    borderRadius: 20,
    backgroundColor: tokens.colors.surfaceCard,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 24,
  },
  title: {
    fontFamily: font.bold,
    fontSize: 23,
    color: tokens.colors.textPrimary,
    textAlign: 'center',
    marginBottom: 12,
  },
  subtitle: {
    fontFamily: font.regular,
    fontSize: 15,
    lineHeight: 22,
    color: tokens.colors.textSecondary,
    textAlign: 'center',
  },
  email: {
    fontFamily: font.semibold,
    color: tokens.colors.textPrimary,
  },
  messageBox: {
    marginTop: 20,
    padding: 12,
    borderRadius: tokens.radius.btn,
    backgroundColor: 'rgba(41, 121, 255, 0.1)',
    borderWidth: 1,
    borderColor: 'rgba(41, 121, 255, 0.25)',
    width: '100%',
  },
  messageBoxError: {
    backgroundColor: 'rgba(216, 96, 74, 0.12)',
    borderColor: 'rgba(216, 96, 74, 0.3)',
  },
  messageText: {
    fontFamily: font.medium,
    fontSize: 13,
    lineHeight: 19,
    color: tokens.colors.textPrimary,
    textAlign: 'center',
  },
  messageTextError: {
    color: tokens.colors.danger,
  },
  footer: {
    marginTop: 28,
  },
  footerLink: {
    fontFamily: font.semibold,
    fontSize: 13,
    color: tokens.colors.textSecondary,
  },
});
