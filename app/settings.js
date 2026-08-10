import { useState } from 'react';
import {
  View,
  Text,
  ScrollView,
  TouchableOpacity,
  Switch,
  Modal,
  TextInput,
  ActivityIndicator,
  StyleSheet,
  Linking,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import Constants from 'expo-constants';
import {
  ChevronLeft,
  ChevronRight,
  Crown,
  Mail,
  KeyRound,
  CreditCard,
  Bell,
  Star,
  Shield,
  ScrollText,
  MessageSquare,
  Briefcase,
  Trash2,
  LogOut,
  Download,
  RotateCcw,
} from 'lucide-react-native';

import { auth, db } from '../services/firebase';
import { sendPasswordResetEmail } from 'firebase/auth';
import { doc, updateDoc } from 'firebase/firestore';
import { deleteAccount, usesPasswordSignIn } from '../services/account';
import { registerForPushNotifications } from '../services/notificationService';
import { exportGradesAndExamsPdf } from '../services/export';
import { restorePurchases } from '../services/revenuecat';
import useUserStore from '../store/userStore';
import useAuthStore from '../store/authStore';
import usePreferencesStore from '../store/preferencesStore';
import { tokens } from '../theme/tokens';
import { openLegal } from '../constants/legal';
import CustomAlert from '../components/CustomAlert';

const font = tokens.typography.families.inter;

const APP_VERSION = Constants.expoConfig?.version || '1.0.0';

// ── Pieces ──────────────────────────────────────────────────────────────────

function Group({ title, children }) {
  const rows = (Array.isArray(children) ? children : [children]).filter(Boolean);
  return (
    <View style={styles.group}>
      {title ? <Text style={styles.groupTitle}>{title}</Text> : null}
      <View style={styles.groupBody}>
        {rows.map((row, index) => (
          <View key={index} style={index ? styles.rowDivider : null}>
            {row}
          </View>
        ))}
      </View>
    </View>
  );
}

function Row({ icon: Icon, label, sub, control, danger, onPress }) {
  const colour = danger ? tokens.colors.danger : tokens.colors.textPrimary;
  return (
    <TouchableOpacity
      activeOpacity={onPress ? 0.7 : 1}
      onPress={onPress}
      disabled={!onPress}
      style={styles.row}
      accessibilityRole="button"
    >
      <View style={styles.rowIcon}>
        <Icon
          size={18}
          strokeWidth={1.75}
          color={danger ? tokens.colors.danger : tokens.colors.textSecondary}
        />
      </View>
      <View style={styles.rowBody}>
        <Text style={[styles.rowLabel, { color: colour }]}>{label}</Text>
        {sub ? (
          <Text style={styles.rowSub} numberOfLines={1}>
            {sub}
          </Text>
        ) : null}
      </View>
      {control ||
        (onPress ? (
          <ChevronRight
            size={18}
            strokeWidth={1.75}
            color={danger ? tokens.colors.danger : tokens.colors.textSecondary}
          />
        ) : null)}
    </TouchableOpacity>
  );
}

function Toggle({ value, onValueChange }) {
  return (
    <Switch
      value={value}
      onValueChange={onValueChange}
      trackColor={{ false: tokens.colors.surfaceHover, true: tokens.colors.accent }}
      thumbColor="#FFFFFF"
    />
  );
}

// ── Screen ──────────────────────────────────────────────────────────────────

export default function SettingsScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const user = auth.currentUser;

  const clearUser = useAuthStore((state) => state.clearUser);
  const isPrime = useAuthStore((state) => state.isPrime);
  const setIsPrime = useAuthStore((state) => state.setIsPrime);
  const autoGradePrompt = usePreferencesStore((state) => state.autoGradePrompt);
  const setAutoGradePrompt = usePreferencesStore((state) => state.setAutoGradePrompt);
  const notificationsEnabled = usePreferencesStore((state) => state.notificationsEnabled);
  const setNotificationsEnabled = usePreferencesStore((state) => state.setNotificationsEnabled);

  // The switch used to be decorative — this is what actually turns the
  // server-side pipeline (Cloud Functions + FCM) on and off for this device.
  // Off clears the token so every scheduled function's `if (!fcmToken)
  // continue` skips this user; on re-registers it, asking for permission
  // again if it was never granted.
  const handleNotificationsToggle = async (value) => {
    setNotificationsEnabled(value);
    if (!user) return;
    if (value) {
      await registerForPushNotifications(user.uid);
    } else {
      await updateDoc(doc(db, 'users', user.uid), {
        fcmToken: null,
        notificationsConsent: false,
      });
    }
  };

  const [alertConfig, setAlertConfig] = useState({ visible: false });
  const [deleteOpen, setDeleteOpen] = useState(false);
  const [deletePassword, setDeletePassword] = useState('');
  const [deleting, setDeleting] = useState(false);
  const [deleteError, setDeleteError] = useState('');
  const [exporting, setExporting] = useState(false);
  const [restoring, setRestoring] = useState(false);

  const showAlert = (config) => setAlertConfig({ ...config, visible: true });
  const closeAlert = () => setAlertConfig((prev) => ({ ...prev, visible: false }));

  // Prime already has a place to go (Google Play's own subscription
  // management) — sending them back to the sales paywall would be a dead end.
  const handleSubscriptionPress = () => {
    if (isPrime) {
      const pkg = Constants.expoConfig?.android?.package || 'com.schedio.mobile';
      Linking.openURL(`https://play.google.com/store/account/subscriptions?package=${pkg}`);
      return;
    }
    router.push('/plus');
  };

  const handleRestore = async () => {
    setRestoring(true);
    try {
      const restored = await restorePurchases();
      if (restored) {
        setIsPrime(true);
        showAlert({
          title: 'Compra restaurada',
          message: 'Tu suscripción Schedio Prime se ha restaurado correctamente.',
          singleButton: true,
          onConfirm: closeAlert,
        });
      } else {
        showAlert({
          title: 'Nada que restaurar',
          message:
            'No hemos encontrado ninguna suscripción activa asociada a esta cuenta de Google Play.',
          singleButton: true,
          onConfirm: closeAlert,
        });
      }
    } catch (error) {
      console.error('[Settings] Error restoring purchases:', error);
      showAlert({
        title: 'No se pudo restaurar',
        message: 'Ha habido un problema comprobando tus compras. Inténtalo de nuevo.',
        singleButton: true,
        onConfirm: closeAlert,
      });
    } finally {
      setRestoring(false);
    }
  };

  const handleExport = async () => {
    if (!isPrime) {
      router.push('/plus');
      return;
    }
    if (!user) return;
    setExporting(true);
    try {
      const { subjects, profile } = useUserStore.getState();
      await exportGradesAndExamsPdf({
        userId: user.uid,
        studentName: profile?.displayName || user.displayName || '',
        subjects,
        averageGrade: profile?.averageGrade,
      });
    } catch (error) {
      console.error('[Settings] Error exporting PDF:', error);
      showAlert({
        title: 'No se pudo exportar',
        message: 'Ha habido un problema generando el PDF. Inténtalo de nuevo.',
        singleButton: true,
        onConfirm: closeAlert,
      });
    } finally {
      setExporting(false);
    }
  };

  const handleLogout = () =>
    showAlert({
      title: 'Cerrar sesión',
      message: '¿Estás seguro de que quieres salir?',
      confirmText: 'Salir',
      isDestructive: true,
      onConfirm: async () => {
        closeAlert();
        try {
          await auth.signOut();
          clearUser();
          router.replace('/login');
        } catch (error) {
          console.error('Error logging out:', error);
        }
      },
    });

  const handleResetPassword = () => {
    if (!user?.email) return;
    showAlert({
      title: 'Cambiar contraseña',
      message: `¿Enviar un correo a ${user.email} para restablecerla?`,
      confirmText: 'Enviar correo',
      onConfirm: async () => {
        closeAlert();
        try {
          await sendPasswordResetEmail(auth, user.email);
          setTimeout(
            () =>
              showAlert({
                title: 'Correo enviado',
                message: 'Revisa tu bandeja de entrada para restablecer la contraseña.',
                singleButton: true,
                onConfirm: closeAlert,
              }),
            300
          );
        } catch (error) {
          console.error('Error resetting password:', error);
          setTimeout(
            () =>
              showAlert({
                title: 'Error',
                message: 'No se pudo enviar el correo. Inténtalo de nuevo.',
                singleButton: true,
                onConfirm: closeAlert,
              }),
            300
          );
        }
      },
    });
  };

  const comingSoon = (what) =>
    showAlert({
      title: what,
      message: 'Estará disponible próximamente.',
      singleButton: true,
      onConfirm: closeAlert,
    });

  const openDelete = () => {
    setDeletePassword('');
    setDeleteError(
      usesPasswordSignIn(user)
        ? ''
        : 'Esta cuenta inició sesión con Google. Cierra sesión, vuelve a entrar y prueba otra vez.'
    );
    setDeleteOpen(true);
  };

  const handleDeleteAccount = async () => {
    setDeleting(true);
    setDeleteError('');
    try {
      await deleteAccount(deletePassword);
      // The auth user is gone; drop the cached data so the next account to
      // sign in on this device doesn't inherit it.
      useUserStore.getState().clearData();
      clearUser();
      setDeleteOpen(false);
      router.replace('/login');
    } catch (error) {
      const code = error?.code || '';
      if (code === 'auth/wrong-password' || code === 'auth/invalid-credential') {
        setDeleteError('La contraseña no es correcta.');
      } else if (code === 'auth/too-many-requests') {
        setDeleteError('Demasiados intentos. Espera un momento y vuelve a probar.');
      } else {
        setDeleteError(error?.message || 'No se pudo eliminar la cuenta.');
      }
    } finally {
      setDeleting(false);
    }
  };

  const canConfirmDelete = usesPasswordSignIn(user) && !!deletePassword && !deleting;

  return (
    <View style={styles.container}>
      <View style={[styles.header, { paddingTop: insets.top + 10 }]}>
        <TouchableOpacity
          onPress={() => router.back()}
          style={styles.back}
          accessibilityRole="button"
          accessibilityLabel="Volver"
        >
          <ChevronLeft size={22} color={tokens.colors.textPrimary} strokeWidth={1.75} />
        </TouchableOpacity>
        <Text style={styles.headerTitle}>Configuración</Text>
        <View style={styles.back} />
      </View>

      <ScrollView
        style={styles.scroll}
        contentContainerStyle={styles.content}
        showsVerticalScrollIndicator={false}
      >
        {/* No point selling Prime to somebody who already has it. */}
        {isPrime ? null : (
          <TouchableOpacity
            activeOpacity={0.85}
            onPress={() => router.push('/plus')}
            style={styles.primeBanner}
          >
            <View style={styles.primeIcon}>
              <Crown size={21} strokeWidth={1.75} color={tokens.colors.premiumText} />
            </View>
            <View style={styles.rowBody}>
              <Text style={styles.primeTitle}>Actualizar a Schedio Prime</Text>
              <Text style={styles.primeSub}>Desbloquea todo el potencial de tu estudio</Text>
            </View>
            <ChevronRight size={18} strokeWidth={1.75} color={tokens.colors.premiumText} />
          </TouchableOpacity>
        )}

        <Group title="Cuenta">
          <Row icon={Mail} label="Correo electrónico" sub={user?.email || 'No disponible'} />
          <Row icon={KeyRound} label="Cambiar contraseña" onPress={handleResetPassword} />
          <Row
            icon={CreditCard}
            label="Suscripción"
            sub={isPrime ? 'Schedio Prime · Gestionar en Google Play' : 'Plan Gratuito'}
            onPress={handleSubscriptionPress}
          />
          {isPrime ? null : (
            <Row
              icon={RotateCcw}
              label="Restaurar compra"
              sub={restoring ? 'Comprobando…' : '¿Ya tienes Prime en otro dispositivo?'}
              control={
                restoring ? (
                  <ActivityIndicator size="small" color={tokens.colors.textSecondary} />
                ) : undefined
              }
              onPress={restoring ? undefined : handleRestore}
            />
          )}
          <Row
            icon={Download}
            label="Exportar notas y exámenes"
            sub={
              exporting
                ? 'Generando PDF…'
                : isPrime
                  ? 'Descarga un PDF con tus notas y exámenes'
                  : 'Función Prime'
            }
            control={
              exporting ? (
                <ActivityIndicator size="small" color={tokens.colors.textSecondary} />
              ) : undefined
            }
            onPress={exporting ? undefined : handleExport}
          />
        </Group>

        <Group title="Preferencias">
          <Row
            icon={Bell}
            label="Notificaciones"
            sub="Recordatorios de exámenes y racha"
            control={
              <Toggle value={notificationsEnabled} onValueChange={handleNotificationsToggle} />
            }
          />
          <Row
            icon={Star}
            label="Prompt de calificación"
            sub="Preguntar nota al finalizar"
            control={<Toggle value={autoGradePrompt} onValueChange={setAutoGradePrompt} />}
          />
        </Group>

        {/* Checkpoint 1, item 4 — its other half: the policies have to be
            reachable from inside the app, not only from registration. */}
        <Group title="Legal y privacidad">
          <Row icon={Shield} label="Política de privacidad" onPress={() => openLegal('privacy')} />
          <Row icon={ScrollText} label="Términos de servicio" onPress={() => openLegal('terms')} />
        </Group>

        <Group title="Comunidad">
          <Row
            icon={MessageSquare}
            label="Enviar feedback"
            onPress={() => comingSoon('Enviar feedback')}
          />
          <Row
            icon={Briefcase}
            label="Trabaja con nosotros"
            onPress={() => comingSoon('Trabaja con nosotros')}
          />
        </Group>

        <Group>
          <Row icon={Trash2} label="Eliminar cuenta" danger onPress={openDelete} />
          <Row icon={LogOut} label="Cerrar sesión" danger onPress={handleLogout} />
        </Group>

        <Text style={styles.version}>Versión {APP_VERSION} (MVP)</Text>
      </ScrollView>

      <Modal
        visible={deleteOpen}
        transparent
        animationType="fade"
        onRequestClose={() => !deleting && setDeleteOpen(false)}
      >
        <View style={styles.deleteOverlay}>
          <View style={styles.deleteCard}>
            <View style={styles.deleteIcon}>
              <Trash2 size={26} color={tokens.colors.danger} strokeWidth={1.75} />
            </View>
            <Text style={styles.deleteTitle}>Eliminar cuenta</Text>
            <Text style={styles.deleteBody}>
              Se borrarán tu cuenta y todos tus datos: materias, sesiones de estudio, exámenes y
              notas, apuntes rápidos y los archivos de tu mochila. Esta acción no se puede deshacer.
            </Text>

            {usesPasswordSignIn(user) ? (
              <TextInput
                style={styles.deleteInput}
                placeholder="Confirma con tu contraseña"
                placeholderTextColor={tokens.colors.textDisabled}
                secureTextEntry
                autoCapitalize="none"
                value={deletePassword}
                onChangeText={setDeletePassword}
                editable={!deleting}
              />
            ) : null}

            {deleteError ? <Text style={styles.deleteError}>{deleteError}</Text> : null}

            <View style={styles.deleteActions}>
              <TouchableOpacity
                style={styles.deleteCancel}
                onPress={() => setDeleteOpen(false)}
                disabled={deleting}
              >
                <Text style={styles.deleteCancelText}>Cancelar</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[styles.deleteConfirm, !canConfirmDelete && styles.deleteConfirmOff]}
                onPress={handleDeleteAccount}
                disabled={!canConfirmDelete}
              >
                {deleting ? (
                  <ActivityIndicator size="small" color="#FFFFFF" />
                ) : (
                  <Text style={styles.deleteConfirmText}>Eliminar</Text>
                )}
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>

      <CustomAlert
        visible={alertConfig.visible}
        title={alertConfig.title}
        message={alertConfig.message}
        cancelText={alertConfig.cancelText || 'Cancelar'}
        confirmText={alertConfig.confirmText || 'OK'}
        onCancel={closeAlert}
        onConfirm={alertConfig.onConfirm}
        isDestructive={alertConfig.isDestructive}
        singleButton={alertConfig.singleButton}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: tokens.colors.background,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    paddingHorizontal: 16,
    paddingBottom: 12,
    borderBottomWidth: 1,
    borderBottomColor: tokens.colors.borderDefault,
  },
  back: {
    width: 44,
    height: 44,
    borderRadius: tokens.radius.pill,
    alignItems: 'center',
    justifyContent: 'center',
  },
  headerTitle: {
    flex: 1,
    textAlign: 'center',
    fontFamily: font.semibold,
    fontSize: 17,
    color: tokens.colors.textPrimary,
  },
  scroll: {
    flex: 1,
  },
  content: {
    gap: 32,
    paddingHorizontal: 20,
    paddingTop: 24,
    paddingBottom: 32,
  },

  // Prime
  primeBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 14,
    padding: 16,
    backgroundColor: tokens.colors.surfaceCard,
    borderWidth: 1,
    borderColor: tokens.colors.premiumBorder,
    borderRadius: tokens.radius.card,
  },
  primeIcon: {
    width: 42,
    height: 42,
    borderRadius: tokens.radius.pill,
    backgroundColor: tokens.colors.premiumBg,
    alignItems: 'center',
    justifyContent: 'center',
  },
  primeTitle: {
    fontFamily: font.semibold,
    fontSize: 16,
    color: tokens.colors.textPrimary,
  },
  primeSub: {
    fontFamily: font.regular,
    fontSize: 13,
    lineHeight: 18,
    color: tokens.colors.textSecondary,
    marginTop: 3,
  },

  // Groups
  group: {
    gap: 10,
  },
  groupTitle: {
    fontFamily: font.semibold,
    fontSize: 12,
    letterSpacing: 0.8,
    textTransform: 'uppercase',
    color: tokens.colors.textSecondary,
    paddingLeft: 4,
  },
  groupBody: {
    backgroundColor: tokens.colors.surfaceCard,
    borderWidth: 1,
    borderColor: tokens.colors.borderDefault,
    borderRadius: tokens.radius.card,
    overflow: 'hidden',
  },
  rowDivider: {
    borderTopWidth: 1,
    borderTopColor: tokens.colors.borderDefault,
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 14,
    paddingHorizontal: 16,
    paddingVertical: 14,
    minHeight: 44,
  },
  rowIcon: {
    width: 34,
    height: 34,
    borderRadius: tokens.radius.btn,
    backgroundColor: tokens.colors.surfaceHover,
    alignItems: 'center',
    justifyContent: 'center',
  },
  rowBody: {
    flex: 1,
    minWidth: 0,
    gap: 2,
  },
  rowLabel: {
    fontFamily: font.medium,
    fontSize: 15,
  },
  rowSub: {
    fontFamily: font.regular,
    fontSize: 13,
    color: tokens.colors.textSecondary,
  },
  version: {
    fontFamily: font.medium,
    fontSize: 12,
    color: tokens.colors.textDisabled,
    textAlign: 'center',
  },

  // Delete account
  deleteOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.6)',
    alignItems: 'center',
    justifyContent: 'center',
    padding: 24,
  },
  deleteCard: {
    width: '100%',
    maxWidth: 360,
    padding: 24,
    borderRadius: tokens.radius.card,
    backgroundColor: tokens.colors.surfaceCard,
    borderWidth: 1,
    borderColor: tokens.colors.borderDefault,
    alignItems: 'center',
  },
  deleteIcon: {
    width: 56,
    height: 56,
    borderRadius: tokens.radius.pill,
    backgroundColor: 'rgba(216, 96, 74, 0.14)',
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 16,
  },
  deleteTitle: {
    fontFamily: font.bold,
    fontSize: 20,
    color: tokens.colors.textPrimary,
    marginBottom: 8,
  },
  deleteBody: {
    fontFamily: font.regular,
    fontSize: 14,
    lineHeight: 20,
    color: tokens.colors.textSecondary,
    textAlign: 'center',
  },
  deleteInput: {
    width: '100%',
    marginTop: 20,
    paddingHorizontal: 14,
    paddingVertical: 12,
    borderRadius: tokens.radius.btn,
    backgroundColor: tokens.colors.background,
    borderWidth: 1,
    borderColor: tokens.colors.borderDefault,
    fontFamily: font.regular,
    fontSize: 15,
    color: tokens.colors.textPrimary,
  },
  deleteError: {
    width: '100%',
    marginTop: 10,
    fontFamily: font.medium,
    fontSize: 13,
    lineHeight: 18,
    color: tokens.colors.danger,
  },
  deleteActions: {
    flexDirection: 'row',
    gap: 12,
    marginTop: 20,
    width: '100%',
  },
  deleteCancel: {
    flex: 1,
    paddingVertical: 13,
    borderRadius: tokens.radius.btn,
    borderWidth: 1,
    borderColor: tokens.colors.borderDefault,
    alignItems: 'center',
  },
  deleteCancelText: {
    fontFamily: font.semibold,
    fontSize: 15,
    color: tokens.colors.textPrimary,
  },
  deleteConfirm: {
    flex: 1,
    paddingVertical: 13,
    borderRadius: tokens.radius.btn,
    backgroundColor: tokens.colors.danger,
    alignItems: 'center',
  },
  deleteConfirmOff: {
    opacity: 0.45,
  },
  deleteConfirmText: {
    fontFamily: font.semibold,
    fontSize: 15,
    color: '#FFFFFF',
  },
});
