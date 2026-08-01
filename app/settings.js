import {
  View,
  Text,
  ScrollView,
  TouchableOpacity,
  Switch,
  StyleSheet,
  Alert,
  Modal,
  TextInput,
  ActivityIndicator,
} from 'react-native';
import { useState } from 'react';
import { useRouter } from 'expo-router';
import {
  ChevronLeft,
  User,
  Mail,
  Lock,
  CreditCard,
  LogOut,
  MessageSquare,
  Briefcase,
  Moon,
  Bell,
  ChevronRight,
  Star,
  Sliders,
  TrendingUp,
  Trash2,
} from 'lucide-react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { auth } from '../services/firebase';
import { sendPasswordResetEmail } from 'firebase/auth';
import { deleteAccount, usesPasswordSignIn } from '../services/account';
import useUserStore from '../store/userStore';
import useAuthStore from '../store/authStore';
import useThemeStore from '../store/themeStore';
import usePreferencesStore from '../store/preferencesStore';
import { tokens } from '../theme/tokens';
import CustomAlert from '../components/CustomAlert';

export default function SettingsScreen() {
  const router = useRouter();
  const clearUser = useAuthStore((state) => state.clearUser);
  const { isDarkMode, toggleTheme } = useThemeStore();
  const { autoGradePrompt, toggleAutoGradePrompt } = usePreferencesStore();
  const user = auth.currentUser;

  const theme = isDarkMode ? tokens.colors.dark : tokens.colors.light;

  const [alertConfig, setAlertConfig] = useState({
    visible: false,
    title: '',
    message: '',
    onConfirm: null,
    cancelText: 'Cancelar',
    confirmText: 'OK',
    isDestructive: false,
    singleButton: false,
  });

  const showAlert = (config) => {
    setAlertConfig({
      ...config,
      visible: true,
    });
  };

  const closeAlert = () => {
    setAlertConfig((prev) => ({ ...prev, visible: false }));
  };

  const handleLogout = async () => {
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
  };

  // ── Borrado de cuenta (Checkpoint 1) ──
  const [deleteOpen, setDeleteOpen] = useState(false);
  const [deletePassword, setDeletePassword] = useState('');
  const [deleting, setDeleting] = useState(false);
  const [deleteError, setDeleteError] = useState('');

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
      // The auth user is gone; drop the cached data so the next account
      // to sign in on this device doesn't inherit it.
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

  const handleResetPassword = async () => {
    if (!user?.email) return;

    showAlert({
      title: 'Restablecer contraseña',
      message: `¿Enviar un correo a ${user.email} para restablecer tu contraseña?`,
      confirmText: 'Enviar correo',
      onConfirm: async () => {
        closeAlert();
        try {
          await sendPasswordResetEmail(auth, user.email);
          setTimeout(() => {
            showAlert({
              title: 'Correo enviado',
              message: 'Revisa tu bandeja de entrada para restablecer la contraseña.',
              singleButton: true,
              onConfirm: closeAlert,
            });
          }, 300);
        } catch (error) {
          console.error('Error resetting password:', error);
          setTimeout(() => {
            showAlert({
              title: 'Error',
              message: 'No se pudo enviar el correo. Inténtalo de nuevo.',
              singleButton: true,
              onConfirm: closeAlert,
            });
          }, 300);
        }
      },
    });
  };

  const handleOpenLink = (url) => {
    showAlert({
      title: 'Próximamente',
      message: 'Esta funcionalidad estará disponible en la versión web.',
      singleButton: true,
      onConfirm: closeAlert,
    });
  };

  const SectionHeader = ({ title }) => (
    <Text style={[styles.sectionHeader, { color: theme.textSecondary }]}>{title}</Text>
  );

  const SettingItem = ({ icon: Icon, title, subtitle, onPress, rightElement, isDestructive }) => (
    <TouchableOpacity
      style={styles.itemContainer}
      onPress={onPress}
      activeOpacity={onPress ? 0.7 : 1}
    >
      <View style={styles.itemLeft}>
        <View
          style={[
            styles.iconBox,
            isDestructive
              ? styles.iconBoxDestructive
              : { backgroundColor: isDarkMode ? '#2C2C2E' : '#E5E5EA' },
          ]}
        >
          <Icon size={20} color={isDestructive ? '#FF453A' : theme.text} />
        </View>
        <View>
          <Text style={[styles.itemTitle, { color: isDestructive ? '#FF453A' : theme.text }]}>
            {title}
          </Text>
          {subtitle && (
            <Text style={[styles.itemSubtitle, { color: theme.textSecondary }]}>{subtitle}</Text>
          )}
        </View>
      </View>
      <View style={styles.itemRight}>
        {rightElement || <ChevronRight size={20} color={theme.textSecondary} />}
      </View>
    </TouchableOpacity>
  );

  return (
    <View style={[styles.container, { backgroundColor: theme.background }]}>
      {/* Header */}
      <View
        style={[
          styles.header,
          { backgroundColor: theme.background, borderBottomColor: theme.border },
        ]}
      >
        <TouchableOpacity
          onPress={() => router.back()}
          style={[styles.backButton, { backgroundColor: theme.cardSecondary }]}
        >
          <ChevronLeft size={24} color={theme.text} />
        </TouchableOpacity>
        <Text style={[styles.headerTitle, { color: theme.text }]}>Configuración</Text>
        <View style={{ width: 40 }} />
      </View>

      <ScrollView style={styles.content} showsVerticalScrollIndicator={false}>
        {/* Schedio Prime CTA */}
        <TouchableOpacity
          style={styles.premiumCard}
          activeOpacity={0.9}
          onPress={() => router.push('/plus')}
        >
          <LinearGradient
            colors={['#FFD60A', '#FF9F0A']}
            style={styles.premiumGradient}
            start={{ x: 0, y: 0 }}
            end={{ x: 1, y: 1 }}
          >
            <View style={styles.premiumContent}>
              <View style={styles.premiumIcon}>
                <TrendingUp size={24} color="#000000" />
              </View>
              <View style={{ flex: 1 }}>
                <Text style={styles.premiumTitle}>Actualizar a Schedio Prime</Text>
                <Text style={styles.premiumSubtitle}>Organiza todo con IA</Text>
              </View>
              <ChevronRight size={20} color="#000000" />
            </View>
          </LinearGradient>
        </TouchableOpacity>

        {/* Account Section */}
        <SectionHeader title="Cuenta" />
        <View style={[styles.sectionContainer, { backgroundColor: theme.card }]}>
          <SettingItem
            icon={Mail}
            title="Correo electrónico"
            subtitle={user?.email || 'No disponible'}
            onPress={() =>
              showAlert({
                title: 'Correo',
                message: 'Tu correo está vinculado a tu cuenta de Google/Firebase.',
                singleButton: true,
                onConfirm: closeAlert,
              })
            }
          />
          <View style={[styles.divider, { backgroundColor: theme.border }]} />
          <SettingItem icon={Lock} title="Cambiar contraseña" onPress={handleResetPassword} />
          <View style={[styles.divider, { backgroundColor: theme.border }]} />
          <SettingItem
            icon={CreditCard}
            title="Suscripción"
            subtitle="Plan Gratuito"
            onPress={() => {}}
          />
        </View>

        {/* Preferences Section */}
        <SectionHeader title="Preferencias" />
        <View style={[styles.sectionContainer, { backgroundColor: theme.card }]}>
          <SettingItem
            icon={Bell}
            title="Notificaciones"
            rightElement={
              <Switch
                value={true}
                onValueChange={() => {}}
                trackColor={{ false: '#E5E5EA', true: '#30D158' }}
                thumbColor={'#FFFFFF'}
              />
            }
          />
          <View style={[styles.divider, { backgroundColor: theme.border }]} />
          <SettingItem
            icon={Sliders}
            title="Prompt de Calificación"
            subtitle="Preguntar nota al finalizar"
            rightElement={
              <Switch
                value={autoGradePrompt}
                onValueChange={toggleAutoGradePrompt}
                trackColor={{ false: '#E5E5EA', true: '#30D158' }}
                thumbColor={'#FFFFFF'}
              />
            }
          />
        </View>

        {/* Comms Section */}
        <SectionHeader title="Comunidad" />
        <View style={[styles.sectionContainer, { backgroundColor: theme.card }]}>
          <SettingItem
            icon={MessageSquare}
            title="Enviar Feedback"
            onPress={() => handleOpenLink('feedback')}
          />
          <View style={[styles.divider, { backgroundColor: theme.border }]} />
          <SettingItem
            icon={Briefcase}
            title="Trabaja con nosotros"
            onPress={() => handleOpenLink('jobs')}
          />
        </View>

        {/* Danger Zone */}
        <View
          style={[styles.sectionContainer, styles.marginTop24, { backgroundColor: theme.card }]}
        >
          <SettingItem icon={LogOut} title="Cerrar sesión" isDestructive onPress={handleLogout} />
          <View style={[styles.divider, { backgroundColor: theme.border }]} />
          <SettingItem
            icon={Trash2}
            title="Eliminar cuenta"
            subtitle="Borra tu cuenta y todos tus datos"
            isDestructive
            onPress={openDelete}
          />
        </View>

        <Text style={[styles.versionText, { color: theme.textSecondary }]}>
          Versión 1.0.0 (MVP)
        </Text>
        <View style={{ height: 40 }} />
      </ScrollView>

      <Modal
        visible={deleteOpen}
        transparent
        animationType="fade"
        onRequestClose={() => !deleting && setDeleteOpen(false)}
      >
        <View style={styles.deleteOverlay}>
          <View style={[styles.deleteCard, { backgroundColor: theme.card }]}>
            <View style={styles.deleteIcon}>
              <Trash2 size={26} color="#FF453A" />
            </View>
            <Text style={[styles.deleteTitle, { color: theme.text }]}>Eliminar cuenta</Text>
            <Text style={[styles.deleteBody, { color: theme.textSecondary }]}>
              Se borrarán tu cuenta y todos tus datos: materias, sesiones de estudio, exámenes y
              notas, apuntes rápidos y los archivos de tu mochila. Esta acción no se puede deshacer.
            </Text>

            {usesPasswordSignIn(user) && (
              <TextInput
                style={[styles.deleteInput, { color: theme.text, borderColor: theme.border }]}
                placeholder="Confirma con tu contraseña"
                placeholderTextColor={theme.textSecondary}
                secureTextEntry
                autoCapitalize="none"
                value={deletePassword}
                onChangeText={setDeletePassword}
                editable={!deleting}
              />
            )}

            {deleteError ? <Text style={styles.deleteError}>{deleteError}</Text> : null}

            <View style={styles.deleteActions}>
              <TouchableOpacity
                style={[styles.deleteCancel, { borderColor: theme.border }]}
                onPress={() => setDeleteOpen(false)}
                disabled={deleting}
              >
                <Text style={[styles.deleteCancelText, { color: theme.text }]}>Cancelar</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[
                  styles.deleteConfirm,
                  (deleting || !usesPasswordSignIn(user) || !deletePassword) &&
                    styles.deleteConfirmDisabled,
                ]}
                onPress={handleDeleteAccount}
                disabled={deleting || !usesPasswordSignIn(user) || !deletePassword}
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
        cancelText={alertConfig.cancelText}
        confirmText={alertConfig.confirmText}
        onCancel={closeAlert}
        onConfirm={alertConfig.onConfirm}
        isDestructive={alertConfig.isDestructive}
        singleButton={alertConfig.singleButton}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  deleteOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.6)',
    alignItems: 'center',
    justifyContent: 'center',
    padding: 24,
  },
  deleteCard: {
    width: '100%',
    maxWidth: 360,
    borderRadius: 20,
    padding: 24,
    alignItems: 'center',
  },
  deleteIcon: {
    width: 56,
    height: 56,
    borderRadius: 28,
    backgroundColor: 'rgba(255, 69, 58, 0.14)',
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 16,
  },
  deleteTitle: {
    fontSize: 20,
    fontWeight: '700',
    marginBottom: 8,
  },
  deleteBody: {
    fontSize: 14,
    lineHeight: 20,
    textAlign: 'center',
  },
  deleteInput: {
    width: '100%',
    marginTop: 20,
    paddingHorizontal: 14,
    paddingVertical: 12,
    borderRadius: 12,
    borderWidth: 1,
    fontSize: 15,
  },
  deleteError: {
    width: '100%',
    marginTop: 10,
    color: '#FF453A',
    fontSize: 13,
    lineHeight: 18,
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
    borderRadius: 12,
    borderWidth: 1,
    alignItems: 'center',
  },
  deleteCancelText: {
    fontSize: 15,
    fontWeight: '600',
  },
  deleteConfirm: {
    flex: 1,
    paddingVertical: 13,
    borderRadius: 12,
    backgroundColor: '#FF453A',
    alignItems: 'center',
  },
  deleteConfirmDisabled: {
    opacity: 0.45,
  },
  deleteConfirmText: {
    fontSize: 15,
    fontWeight: '700',
    color: '#FFFFFF',
  },
  container: {
    flex: 1,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingTop: 60,
    paddingBottom: 20,
    borderBottomWidth: 1,
  },
  backButton: {
    width: 40,
    height: 40,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: 20,
  },
  headerTitle: {
    fontSize: 17,
    fontWeight: '600',
  },
  content: {
    flex: 1,
    padding: 20,
  },
  premiumCard: {
    marginBottom: 24,
    borderRadius: 16,
    overflow: 'hidden',
  },
  premiumGradient: {
    padding: 1,
    borderRadius: 16,
  },
  premiumContent: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    padding: 16,
  },
  premiumIcon: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: 'rgba(0,0,0,0.1)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  premiumTitle: {
    fontSize: 16,
    fontWeight: '700',
    color: '#000000',
  },
  premiumSubtitle: {
    fontSize: 13,
    color: '#000000',
    opacity: 0.8,
  },
  sectionHeader: {
    fontSize: 13,
    fontWeight: '600',
    textTransform: 'uppercase',
    marginBottom: 8,
    marginLeft: 16,
  },
  sectionContainer: {
    borderRadius: 12,
    marginBottom: 24,
    overflow: 'hidden',
  },
  itemContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    padding: 16,
    minHeight: 56,
  },
  itemLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    flex: 1,
  },
  iconBox: {
    width: 32,
    height: 32,
    borderRadius: 8,
    alignItems: 'center',
    justifyContent: 'center',
  },
  iconBoxDestructive: {
    backgroundColor: 'rgba(255, 69, 58, 0.1)',
  },
  itemTitle: {
    fontSize: 16,
  },
  textDestructive: {
    color: '#FF453A',
  },
  itemSubtitle: {
    fontSize: 13,
    marginTop: 2,
  },
  divider: {
    height: 1,
    marginLeft: 60,
  },
  marginTop24: {
    marginTop: 0,
  },
  versionText: {
    textAlign: 'center',
    fontSize: 13,
    marginTop: 0,
    marginBottom: 20,
  },
});
