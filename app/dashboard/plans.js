import {
  View,
  Text,
  ScrollView,
  TouchableOpacity,
  Alert,
  ActivityIndicator,
  Dimensions,
  Platform,
  StyleSheet,
  Image,
} from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import {
  Brain,
  Play,
  Check,
  Circle,
  BookOpen,
  FolderOpen,
  CloudUpload,
  Crown,
  MoreVertical,
  AlertCircle,
  Plus,
} from 'lucide-react-native';
import { tokens } from '../../theme/tokens';
import Animated, { LinearTransition, FadeIn, FadeOut } from 'react-native-reanimated';
import { LinearGradient } from 'expo-linear-gradient';
import * as Haptics from 'expo-haptics';
import useUserStore from '../../store/userStore';
import useAuthStore from '../../store/authStore';
import { useState, useEffect, useMemo } from 'react';
import { isToday, isTomorrow, format } from 'date-fns';
import { es } from 'date-fns/locale';
import UploadModal from '../../components/UploadModal';
import ResourceList from '../../components/ResourceList';
import { GlassCard } from '../../components/GlassView';

// Replaces LayoutAnimation.Presets.easeInEaseOut, which no longer does anything
// under the New Architecture. Built once at module scope so every item shares the
// same config object instead of rebuilding it on each render.
const LIST_TRANSITION = LinearTransition.duration(250);

export default function PlansScreen() {
  const router = useRouter();
  const user = useAuthStore((state) => state.user);
  const isPrime = useAuthStore((state) => state.isPrime);

  // One selector per key rather than destructuring the store: destructuring
  // subscribed this screen to every write, so it redrew whenever anything at
  // all changed. The action references are stable, so selecting them costs
  // nothing.
  const microplans = useUserStore((state) => state.microplans);
  const storeLoading = useUserStore((state) => state.loading);
  const resources = useUserStore((state) => state.resources);
  const initDailyMicroplans = useUserStore((state) => state.initDailyMicroplans);
  const completeMicroTask = useUserStore((state) => state.completeMicroTask);
  const generateAiPlans = useUserStore((state) => state.generateAiPlans);
  const postponeMicroTask = useUserStore((state) => state.postponeMicroTask);
  const deleteMicroTask = useUserStore((state) => state.deleteMicroTask);
  const addManualTask = useUserStore((state) => state.addManualTask);
  const addResource = useUserStore((state) => state.addResource);
  const removeResource = useUserStore((state) => state.removeResource);

  const params = useLocalSearchParams();
  const highlightId = params.highlightId;

  const [isGenerating, setIsGenerating] = useState(false);
  const [activeTab, setActiveTab] = useState('plans'); // 'plans' | 'resources'
  const [uploadModalVisible, setUploadModalVisible] = useState(false);

  // `entering` must stay off for the first render: otherwise the whole list
  // fades in on mount (and on every tab switch), which reads as a flicker.
  // We only want it for items that appear *after* the list is on screen.
  const [listMounted, setListMounted] = useState(false);
  useEffect(() => {
    setListMounted(true);
  }, []);

  const displayPlans = transformRealData(microplans);

  // Progress Calculation
  const todayGroup = displayPlans.find((g) => isToday(new Date(g.date)));
  const todayTasks = todayGroup ? todayGroup.items.length : 0;
  const completedToday = todayGroup ? todayGroup.items.filter((i) => i.completed).length : 0;
  const progressPerc = todayTasks > 0 ? (completedToday / todayTasks) * 100 : 0;

  function transformRealData(plans) {
    const groups = {};
    if (!plans || !Array.isArray(plans)) return [];

    plans.forEach((p) => {
      if (!p.date) {
        console.warn('Ignoring plan item without date:', p);
        return;
      }
      const dateStr =
        typeof p.date === 'string' ? p.date : p.date.toISOString ? p.date.toISOString() : null;
      if (!dateStr) return;

      const key = dateStr.split('T')[0];
      if (!groups[key]) groups[key] = { date: dateStr, items: [] };
      groups[key].items.push(p);
    });
    return Object.values(groups).sort((a, b) => a.date.localeCompare(b.date));
  }

  useEffect(() => {
    if (user) {
      initDailyMicroplans(user.uid);
      // Resources are loaded in loadUserData, but we could trigger a refresh here if needed
    }
  }, [user]);

  const handleAiGeneration = async () => {
    setIsGenerating(true);
    await generateAiPlans(user.uid);
    setIsGenerating(false);
  };

  const handleUploadSuccess = async (fileData) => {
    if (user) {
      await addResource(user.uid, fileData);
      Alert.alert('Éxito', 'Archivo subido correctamente a tu mochila.');
    }
  };

  return (
    <View style={{ flex: 1, backgroundColor: '#000000', paddingTop: 48 }}>
      {/* Header Area */}
      <View style={{ paddingHorizontal: 24, paddingBottom: 8, marginTop: -4 }}>
        <View className="flex-row justify-between items-center mb-6 mt-2">
          <View
            style={{
              width: 144,
              height: 48,
              borderRadius: 24,
              backgroundColor: '#FFF',
              justifyContent: 'center',
              alignItems: 'center',
              overflow: 'hidden',
            }}
          >
            <Image
              source={require('../../assets/images/schedio-icon.png')}
              style={{ width: 130, height: 42 }}
              resizeMode="cover"
            />
          </View>
        </View>

        {/* Custom Tabs */}
        <View
          style={{ flexDirection: 'row', backgroundColor: '#1C1C1E', borderRadius: 12, padding: 4 }}
        >
          <TouchableOpacity
            style={{
              flex: 1,
              paddingVertical: 8,
              alignItems: 'center',
              borderRadius: 10,
              backgroundColor: activeTab === 'plans' ? '#3A3A3C' : 'transparent',
            }}
            onPress={() => setActiveTab('plans')}
          >
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
              <BookOpen size={14} color={activeTab === 'plans' ? '#FFFFFF' : '#8E8E93'} />
              <Text
                style={{
                  color: activeTab === 'plans' ? '#FFFFFF' : '#8E8E93',
                  fontWeight: activeTab === 'plans' ? '700' : '600',
                  fontSize: 14,
                }}
              >
                Planes
              </Text>
            </View>
          </TouchableOpacity>

          <TouchableOpacity
            style={{
              flex: 1,
              paddingVertical: 8,
              alignItems: 'center',
              borderRadius: 10,
              backgroundColor: activeTab === 'resources' ? '#3A3A3C' : 'transparent',
            }}
            onPress={() => setActiveTab('resources')}
          >
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
              <FolderOpen size={14} color={activeTab === 'resources' ? '#FFFFFF' : '#8E8E93'} />
              <Text
                style={{
                  color: activeTab === 'resources' ? '#FFFFFF' : '#8E8E93',
                  fontWeight: activeTab === 'resources' ? '700' : '600',
                  fontSize: 14,
                }}
              >
                Mochila
              </Text>
            </View>
          </TouchableOpacity>
        </View>
      </View>

      {/* Main Content */}
      <ScrollView
        showsVerticalScrollIndicator={false}
        contentContainerStyle={{ paddingBottom: 100, paddingHorizontal: 24 }}
      >
        {activeTab === 'plans' ? (
          <View>
            {/* ── Prominent AI Generation Button ── */}
            <TouchableOpacity
              onPress={() => (isPrime ? handleAiGeneration() : router.push('/plus'))}
              style={{
                marginBottom: 24,
                borderRadius: 16,
                overflow: 'hidden',
                borderWidth: 1,
                borderColor: '#FFCC0080',
                shadowColor: '#FFCC00',
                shadowOffset: { width: 0, height: 4 },
                shadowOpacity: 0.3,
                shadowRadius: 12,
                elevation: 8,
              }}
            >
              <LinearGradient
                colors={['#1F1A00', '#2A2400']}
                style={{
                  padding: 16,
                  flexDirection: 'row',
                  alignItems: 'center',
                  justifyContent: 'space-between',
                }}
                start={{ x: 0, y: 0 }}
                end={{ x: 1, y: 1 }}
              >
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12 }}>
                  <View style={{ backgroundColor: '#FFCC0020', padding: 10, borderRadius: 12 }}>
                    <Brain size={24} color="#FFCC00" />
                  </View>
                  <View>
                    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                      <Text style={{ color: '#FFFFFF', fontSize: 16, fontWeight: '800' }}>
                        Planificar con IA
                      </Text>
                      <Crown size={14} color="#FFCC00" />
                    </View>
                    <Text
                      style={{ color: '#FFCC00', fontSize: 12, marginTop: 2, fontWeight: '600' }}
                    >
                      Schedio Prime
                    </Text>
                  </View>
                </View>
                {isGenerating ? (
                  <ActivityIndicator size="small" color="#FFCC00" />
                ) : (
                  <View
                    style={{
                      backgroundColor: '#FFCC00',
                      paddingHorizontal: 16,
                      paddingVertical: 8,
                      borderRadius: 20,
                    }}
                  >
                    <Text style={{ color: '#000000', fontWeight: '800', fontSize: 12 }}>
                      GENERAR
                    </Text>
                  </View>
                )}
              </LinearGradient>
            </TouchableOpacity>

            {/* ── Automagic FREE Plans Note ── */}
            <Text
              style={{ color: '#8E8E93', fontSize: 13, marginBottom: 16, paddingHorizontal: 4 }}
            >
              Planes automáticos (gratis):
            </Text>

            {/* ── Progress Tracker ── */}
            {todayTasks > 0 && (
              <View
                style={{
                  backgroundColor: 'rgba(255,255,255,0.05)',
                  borderRadius: 16,
                  padding: 16,
                  marginBottom: 24,
                  flexDirection: 'row',
                  alignItems: 'center',
                }}
              >
                <View
                  style={{
                    width: 48,
                    height: 48,
                    borderRadius: 24,
                    backgroundColor: 'rgba(74, 144, 226, 0.1)',
                    justifyContent: 'center',
                    alignItems: 'center',
                  }}
                >
                  <Text style={{ color: '#4A90E2', fontWeight: '800', fontSize: 14 }}>
                    {Math.round(progressPerc)}%
                  </Text>
                </View>
                <View style={{ flex: 1, marginLeft: 16 }}>
                  <Text style={{ color: '#FFF', fontSize: 16, fontWeight: '700' }}>
                    Progreso de Hoy
                  </Text>
                  <Text style={{ color: '#8E8E93', fontSize: 13, marginTop: 2 }}>
                    {completedToday} de {todayTasks} tareas completadas
                  </Text>
                </View>
              </View>
            )}

            {/* ── PLANS CONTENT ── */}
            {storeLoading ? (
              <View className="items-center justify-center py-20">
                <ActivityIndicator size="large" color={tokens.colors.blue} />
                <Text className="text-white mt-4">Generando tu plan...</Text>
              </View>
            ) : displayPlans.length === 0 ? (
              <View className="items-center justify-center py-20">
                <Text className="text-white text-lg font-bold mb-2">No hay planes activos</Text>
                <Text className="text-gray-400 text-center px-8">
                  Añade exámenes desde el calendario para generar tu plan de estudio
                  automáticamente.
                </Text>
              </View>
            ) : (
              displayPlans.map((group) => {
                const dateObj = new Date(group.date);
                const isTodayDate = isToday(dateObj);
                const label = isTodayDate
                  ? 'Hoy'
                  : isTomorrow(dateObj)
                    ? 'Mañana'
                    : format(dateObj, 'EEEE d', { locale: es });

                return (
                  <Animated.View
                    key={group.date}
                    layout={LIST_TRANSITION}
                    className="relative mb-6"
                  >
                    <View
                      style={{
                        position: 'absolute',
                        left: 7,
                        top: 24,
                        bottom: -20,
                        width: 2,
                        backgroundColor: '#333',
                      }}
                    />

                    <View className="flex-row items-center mb-4">
                      <View className="w-4 h-4 rounded-full bg-zinc-500 border-4 border-black z-10" />
                      <Text className="text-white text-lg font-bold ml-4 capitalize">{label}</Text>
                    </View>

                    <Animated.View layout={LIST_TRANSITION} className="pl-8 gap-3">
                      {group.items.map((item) => {
                        const isHighlighted =
                          highlightId && (item.examId === highlightId || item.id === highlightId);
                        const isActive = (isTodayDate && !item.completed) || isHighlighted;
                        const handleCheck = () => {
                          if (Platform.OS !== 'web') {
                            Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
                          }
                          // The list transition is declarative now: each item carries
                          // `layout={LIST_TRANSITION}`, so any reflow caused by this
                          // update is animated by Reanimated. No imperative call here
                          // (the old LayoutAnimation.configureNext is a no-op under the
                          // New Architecture, enabled in SDK 54).
                          completeMicroTask(user?.uid, item.id);
                        };

                        return (
                          <Animated.View
                            key={item.id}
                            layout={LIST_TRANSITION}
                            entering={listMounted ? FadeIn.duration(180) : undefined}
                            exiting={FadeOut.duration(150)}
                            style={{ marginBottom: 12 }}
                          >
                            <TouchableOpacity
                              activeOpacity={0.7}
                              onPress={() =>
                                router.push({
                                  pathname: '/dashboard/study',
                                  params: { subjectId: item.subjectId, autoStart: 'true' },
                                })
                              }
                            >
                              <GlassCard
                                style={{
                                  padding: 16,
                                  flexDirection: 'row',
                                  alignItems: 'center',
                                  borderWidth: item.isPanicMode ? 1 : isHighlighted ? 1 : 0,
                                  borderColor: item.isPanicMode ? '#FF3B30' : tokens.colors.blue,
                                  opacity: item.completed ? 0.6 : 1,
                                  backgroundColor: item.isPanicMode
                                    ? 'rgba(255, 59, 48, 0.05)'
                                    : 'rgba(28, 28, 30, 0.95)',
                                }}
                              >
                                <View
                                  style={{
                                    position: 'absolute',
                                    left: 0,
                                    top: 10,
                                    bottom: 10,
                                    width: 4,
                                    backgroundColor: item.subjectColor || '#333',
                                    borderTopRightRadius: 4,
                                    borderBottomRightRadius: 4,
                                  }}
                                />

                                <View className="flex-1 ml-3">
                                  <View className="flex-row items-center mb-1">
                                    {item.isPanicMode && (
                                      <AlertCircle
                                        size={10}
                                        color="#FF3B30"
                                        style={{ marginRight: 4 }}
                                      />
                                    )}
                                    <Text
                                      style={{
                                        color: item.isPanicMode ? '#FF3B30' : '#D1D5DB',
                                        fontSize: 10,
                                        fontWeight: '800',
                                        textTransform: 'uppercase',
                                        letterSpacing: 0.5,
                                      }}
                                    >
                                      {item.phase || 'REPASO'}
                                    </Text>
                                    <Text
                                      style={{
                                        color: item.subjectColor || '#FFF',
                                        fontSize: 10,
                                        fontWeight: '800',
                                        textTransform: 'uppercase',
                                        marginLeft: 8,
                                      }}
                                    >
                                      {item.subject || item.subjectName}
                                    </Text>
                                  </View>
                                  <Text
                                    style={{
                                      color: '#FFFFFF',
                                      fontSize: 16,
                                      fontWeight: '700',
                                      textDecorationLine: item.completed ? 'line-through' : 'none',
                                    }}
                                  >
                                    {item.text}
                                  </Text>
                                  <View
                                    style={{
                                      flexDirection: 'row',
                                      alignItems: 'center',
                                      marginTop: 4,
                                    }}
                                  >
                                    <Text
                                      style={{ color: '#A1A1AA', fontSize: 12, fontWeight: '600' }}
                                    >
                                      {item.duration || 25} min
                                    </Text>
                                    {item.isOptional && (
                                      <View
                                        style={{
                                          backgroundColor: 'rgba(255,255,255,0.1)',
                                          paddingHorizontal: 6,
                                          paddingVertical: 2,
                                          borderRadius: 8,
                                          marginLeft: 8,
                                        }}
                                      >
                                        <Text
                                          style={{
                                            color: '#A1A1AA',
                                            fontSize: 10,
                                            fontWeight: '700',
                                          }}
                                        >
                                          Opcional hoy
                                        </Text>
                                      </View>
                                    )}
                                  </View>
                                </View>

                                <View className="flex-row items-center gap-3 ml-2">
                                  <TouchableOpacity
                                    onPress={() => {
                                      if (Platform.OS === 'web') {
                                        if (window.confirm('¿Mover esta tarea para mañana?'))
                                          postponeMicroTask(user.uid, item.id);
                                      } else {
                                        Alert.alert(
                                          'Opciones de Tarea',
                                          '¿Qué deseas hacer con esta tarea?',
                                          [
                                            {
                                              text: 'Posponer a mañana',
                                              onPress: () => postponeMicroTask(user.uid, item.id),
                                            },
                                            {
                                              text: 'Eliminar',
                                              onPress: () => deleteMicroTask(user.uid, item.id),
                                              style: 'destructive',
                                            },
                                            { text: 'Cancelar', style: 'cancel' },
                                          ]
                                        );
                                      }
                                    }}
                                    style={{ padding: 4 }}
                                  >
                                    <MoreVertical size={20} color="#8E8E93" />
                                  </TouchableOpacity>

                                  <TouchableOpacity onPress={handleCheck}>
                                    <View
                                      style={{
                                        width: 26,
                                        height: 26,
                                        borderRadius: 8,
                                        borderWidth: 2,
                                        borderColor: isActive ? '#4A90E2' : '#555',
                                        alignItems: 'center',
                                        justifyContent: 'center',
                                        backgroundColor: item.completed
                                          ? isActive
                                            ? '#4A90E2'
                                            : '#555'
                                          : 'transparent',
                                      }}
                                    >
                                      {item.completed && <Check size={16} color="#FFF" />}
                                    </View>
                                  </TouchableOpacity>
                                </View>
                              </GlassCard>
                            </TouchableOpacity>
                          </Animated.View>
                        );
                      })}
                    </Animated.View>
                  </Animated.View>
                );
              })
            )}
            {/* Add Manual Task Button */}
            <TouchableOpacity
              style={{
                flexDirection: 'row',
                alignItems: 'center',
                justifyContent: 'center',
                paddingVertical: 16,
                backgroundColor: 'rgba(255,255,255,0.05)',
                borderRadius: 16,
                marginTop: 16,
                borderStyle: 'dashed',
                borderWidth: 1,
                borderColor: 'rgba(255,255,255,0.2)',
              }}
              onPress={() => {
                // Simple quick-add manual task for the iteration (prompts on web, alerts/mock on mobile if required)
                if (Platform.OS === 'web') {
                  const text = window.prompt('Escribe el título de tu tarea personal:');
                  if (text) {
                    addManualTask(user.uid, { text, duration: 30 });
                  }
                } else {
                  Alert.prompt('Nueva Tarea', 'Escribe el título:', [
                    { text: 'Cancelar', style: 'cancel' },
                    {
                      text: 'Añadir',
                      onPress: (text) => addManualTask(user.uid, { text, duration: 30 }),
                    },
                  ]);
                }
              }}
            >
              <Plus size={20} color="#8E8E93" style={{ marginRight: 8 }} />
              <Text style={{ color: '#8E8E93', fontWeight: 'bold' }}>Añadir tarea suelta</Text>
            </TouchableOpacity>
          </View>
        ) : (
          // --- MOCHILA / RESOURCES CONTENT ---
          <View>
            {/* Upload Button */}
            <TouchableOpacity
              style={{
                backgroundColor: isPrime ? tokens.colors.purple : tokens.colors.blue,
                borderRadius: 16,
                padding: 16,
                flexDirection: 'row',
                alignItems: 'center',
                justifyContent: 'center',
                gap: 12,
                marginBottom: 24,
                shadowColor: isPrime ? tokens.colors.purple : tokens.colors.blue,
                shadowOffset: { width: 0, height: 4 },
                shadowOpacity: 0.3,
                shadowRadius: 8,
                elevation: 4,
              }}
              onPress={() => setUploadModalVisible(true)}
            >
              <CloudUpload size={24} color="#FFFFFF" />
              <Text style={{ color: '#FFFFFF', fontWeight: '700', fontSize: 16 }}>
                Subir Recurso
              </Text>
            </TouchableOpacity>

            {/* Recent Uploads */}
            <Text style={{ color: '#FFFFFF', fontSize: 18, fontWeight: '700', marginBottom: 8 }}>
              Tus Archivos
            </Text>

            {resources && resources.length > 0 ? (
              <ResourceList
                resources={resources}
                onDelete={(r) => removeResource(user?.uid, r.path)}
                isDarkMode={true}
              />
            ) : (
              <View style={{ alignItems: 'center', paddingVertical: 40, opacity: 0.6 }}>
                <FolderOpen size={48} color="#8E8E93" />
                <Text style={{ color: '#8E8E93', marginTop: 16, textAlign: 'center' }}>
                  Tu mochila está vacía.{'\n'}Sube fotos o apuntes para empezar.
                </Text>
              </View>
            )}

            {!isPrime && (
              <View
                style={{
                  marginTop: 32,
                  backgroundColor: 'rgba(255, 214, 10, 0.1)',
                  borderRadius: 16,
                  padding: 16,
                  borderWidth: 1,
                  borderColor: 'rgba(255, 214, 10, 0.3)',
                }}
              >
                <Text
                  style={{ color: '#FFD60A', fontWeight: '700', fontSize: 16, marginBottom: 8 }}
                >
                  ¿Necesitas más espacio?
                </Text>
                <Text style={{ color: '#FFFFFF', opacity: 0.8, marginBottom: 16 }}>
                  Con Schedio Prime tendrás almacenamiento ilimitado y análisis de documentos con
                  IA.
                </Text>
                <TouchableOpacity
                  style={{
                    backgroundColor: '#FFD60A',
                    padding: 12,
                    borderRadius: 100,
                    alignItems: 'center',
                  }}
                  onPress={() => router.push('/plus')}
                >
                  <Text style={{ color: '#000000', fontWeight: '700' }}>Ver Planes</Text>
                </TouchableOpacity>
              </View>
            )}
          </View>
        )}
      </ScrollView>

      <UploadModal
        visible={uploadModalVisible}
        onClose={() => setUploadModalVisible(false)}
        onUploadSuccess={handleUploadSuccess}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  // Keep any minimal styles if needed, mostly doing inline or tailwind
});
