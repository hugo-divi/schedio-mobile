import { View, Text, ScrollView, TouchableOpacity, Switch, StyleSheet, Alert } from 'react-native';
import { useState } from 'react';
import { useRouter } from 'expo-router';
import { ChevronLeft, User, Mail, Lock, CreditCard, LogOut, MessageSquare, Briefcase, Moon, Bell, ChevronRight, Star, Sliders, TrendingUp } from 'lucide-react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { auth } from '../services/firebase';
import { sendPasswordResetEmail } from 'firebase/auth';
import useAuthStore from '../store/authStore';
import useThemeStore from '../store/themeStore';
import usePreferencesStore from '../store/preferencesStore';
import { tokens } from '../theme/tokens';
import CustomAlert from '../components/CustomAlert';

export default function SettingsScreen() {
    const router = useRouter();
    const clearUser = useAuthStore(state => state.clearUser);
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
        singleButton: false
    });

    const showAlert = (config) => {
        setAlertConfig({
            ...config,
            visible: true
        });
    };

    const closeAlert = () => {
        setAlertConfig(prev => ({ ...prev, visible: false }));
    };

    const handleLogout = async () => {
        showAlert({
            title: "Cerrar sesión",
            message: "¿Estás seguro de que quieres salir?",
            confirmText: "Salir",
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
            }
        });
    };

    const handleResetPassword = async () => {
        if (!user?.email) return;

        showAlert({
            title: "Restablecer contraseña",
            message: `¿Enviar un correo a ${user.email} para restablecer tu contraseña?`,
            confirmText: "Enviar correo",
            onConfirm: async () => {
                closeAlert();
                try {
                    await sendPasswordResetEmail(auth, user.email);
                    setTimeout(() => {
                        showAlert({
                            title: "Correo enviado",
                            message: "Revisa tu bandeja de entrada para restablecer la contraseña.",
                            singleButton: true,
                            onConfirm: closeAlert
                        });
                    }, 300);
                } catch (error) {
                    console.error("Error resetting password:", error);
                    setTimeout(() => {
                        showAlert({
                            title: "Error",
                            message: "No se pudo enviar el correo. Inténtalo de nuevo.",
                            singleButton: true,
                            onConfirm: closeAlert
                        });
                    }, 300);
                }
            }
        });
    };

    const handleOpenLink = (url) => {
        showAlert({
            title: "Próximamente",
            message: "Esta funcionalidad estará disponible en la versión web.",
            singleButton: true,
            onConfirm: closeAlert
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
                <View style={[
                    styles.iconBox,
                    isDestructive ? styles.iconBoxDestructive : { backgroundColor: isDarkMode ? '#2C2C2E' : '#E5E5EA' }
                ]}>
                    <Icon size={20} color={isDestructive ? '#FF453A' : theme.text} />
                </View>
                <View>
                    <Text style={[styles.itemTitle, { color: isDestructive ? '#FF453A' : theme.text }]}>{title}</Text>
                    {subtitle && <Text style={[styles.itemSubtitle, { color: theme.textSecondary }]}>{subtitle}</Text>}
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
            <View style={[styles.header, { backgroundColor: theme.background, borderBottomColor: theme.border }]}>
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
                <TouchableOpacity style={styles.premiumCard} activeOpacity={0.9} onPress={() => router.push('/plus')}>
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
                        onPress={() => showAlert({
                            title: "Correo",
                            message: "Tu correo está vinculado a tu cuenta de Google/Firebase.",
                            singleButton: true,
                            onConfirm: closeAlert
                        })}
                    />
                    <View style={[styles.divider, { backgroundColor: theme.border }]} />
                    <SettingItem
                        icon={Lock}
                        title="Cambiar contraseña"
                        onPress={handleResetPassword}
                    />
                    <View style={[styles.divider, { backgroundColor: theme.border }]} />
                    <SettingItem
                        icon={CreditCard}
                        title="Suscripción"
                        subtitle="Plan Gratuito"
                        onPress={() => { }}
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
                                onValueChange={() => { }}
                                trackColor={{ false: "#E5E5EA", true: "#30D158" }}
                                thumbColor={"#FFFFFF"}
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
                                trackColor={{ false: "#E5E5EA", true: "#30D158" }}
                                thumbColor={"#FFFFFF"}
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
                <View style={[styles.sectionContainer, styles.marginTop24, { backgroundColor: theme.card }]}>
                    <SettingItem
                        icon={LogOut}
                        title="Cerrar sesión"
                        isDestructive
                        onPress={handleLogout}
                    />
                </View>

                <Text style={[styles.versionText, { color: theme.textSecondary }]}>Versión 1.0.0 (MVP)</Text>
                <View style={{ height: 40 }} />
            </ScrollView>

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
    }
});
