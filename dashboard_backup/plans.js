import { View, Text, ScrollView, TouchableOpacity, Alert, ActivityIndicator, Dimensions, LayoutAnimation, Platform, UIManager, StyleSheet } from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { Brain, Play, Check, Circle, BookOpen, FolderOpen, CloudUpload } from 'lucide-react-native';
import { tokens } from '../../theme/tokens';
import * as Haptics from 'expo-haptics';
import useUserStore from '../../store/userStore';
import useAuthStore from '../../store/authStore';
import { useState, useEffect, useMemo } from 'react';
import { isToday, isTomorrow, format } from 'date-fns';
import { es } from 'date-fns/locale';

if (Platform.OS === 'android' && UIManager.setLayoutAnimationEnabledExperimental) {
    UIManager.setLayoutAnimationEnabledExperimental(true);
}

import UploadModal from '../../components/UploadModal';
import ResourceList from '../../components/ResourceList';

export default function PlansScreen() {
    const router = useRouter();
    const { user } = useAuthStore();
    const {
        microplans, initDailyMicroplans, completeMicroTask, generateAiPlans,
        loading: storeLoading,
        resources, addResource, removeResource, isPrime
    } = useUserStore();

    const params = useLocalSearchParams();
    const highlightId = params.highlightId;

    const [isGenerating, setIsGenerating] = useState(false);
    const [activeTab, setActiveTab] = useState('plans'); // 'plans' | 'resources'
    const [uploadModalVisible, setUploadModalVisible] = useState(false);

    const displayPlans = transformRealData(microplans);

    function transformRealData(plans) {
        const groups = {};
        if (!plans || !Array.isArray(plans)) return [];

        plans.forEach(p => {
            if (!p.date) {
                console.warn("Ignoring plan item without date:", p);
                return;
            }
            const dateStr = typeof p.date === 'string' ? p.date : p.date.toISOString ? p.date.toISOString() : null;
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
            Alert.alert("Éxito", "Archivo subido correctamente a tu mochila.");
        }
    };

    return (
        <View style={{ flex: 1, backgroundColor: '#000000', paddingTop: 48 }}>

            {/* Header Area */}
            <View style={{ paddingHorizontal: 24, paddingBottom: 16 }}>
                <View className="flex-row justify-between items-center mb-6 mt-2">
                    <Text className="text-3xl font-black text-white tracking-tight">Tu Espacio</Text>

                    {/* AI Button - Only show on Plans tab */}
                    {activeTab === 'plans' && (
                        <TouchableOpacity
                            onPress={() => router.push('/plus')}
                            className="bg-zinc-800 px-4 py-2 rounded-full flex-row items-center gap-2"
                        >
                            {isGenerating ? (
                                <ActivityIndicator size="small" color={tokens.colors.blue} />
                            ) : (
                                <>
                                    <Brain size={14} color={tokens.colors.blue} />
                                    <Text style={{ color: tokens.colors.blue, fontSize: 12, fontWeight: '700' }}>IA</Text>
                                </>
                            )}
                        </TouchableOpacity>
                    )}
                </View>

                {/* Custom Tabs */}
                <View style={{ flexDirection: 'row', backgroundColor: '#1C1C1E', borderRadius: 12, padding: 4 }}>
                    <TouchableOpacity
                        style={{
                            flex: 1,
                            paddingVertical: 8,
                            alignItems: 'center',
                            borderRadius: 10,
                            backgroundColor: activeTab === 'plans' ? '#3A3A3C' : 'transparent'
                        }}
                        onPress={() => setActiveTab('plans')}
                    >
                        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                            <BookOpen size={14} color={activeTab === 'plans' ? '#FFFFFF' : '#8E8E93'} />
                            <Text style={{
                                color: activeTab === 'plans' ? '#FFFFFF' : '#8E8E93',
                                fontWeight: activeTab === 'plans' ? '700' : '600',
                                fontSize: 14
                            }}>Planes</Text>
                        </View>
                    </TouchableOpacity>

                    <TouchableOpacity
                        style={{
                            flex: 1,
                            paddingVertical: 8,
                            alignItems: 'center',
                            borderRadius: 10,
                            backgroundColor: activeTab === 'resources' ? '#3A3A3C' : 'transparent'
                        }}
                        onPress={() => setActiveTab('resources')}
                    >
                        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                            <FolderOpen size={14} color={activeTab === 'resources' ? '#FFFFFF' : '#8E8E93'} />
                            <Text style={{
                                color: activeTab === 'resources' ? '#FFFFFF' : '#8E8E93',
                                fontWeight: activeTab === 'resources' ? '700' : '600',
                                fontSize: 14
                            }}>Mochila</Text>
                        </View>
                    </TouchableOpacity>
                </View>
            </View>

            {/* Main Content */}
            <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={{ paddingBottom: 100, paddingHorizontal: 24 }}>

                {activeTab === 'plans' ? (
                    // --- PLANS CONTENT ---
                    storeLoading ? (
                        <View className="items-center justify-center py-20">
                            <ActivityIndicator size="large" color={tokens.colors.blue} />
                            <Text className="text-white mt-4">Generando tu plan...</Text>
                        </View>
                    ) : displayPlans.length === 0 ? (
                        <View className="items-center justify-center py-20">
                            <Text className="text-white text-lg font-bold mb-2">No hay planes activos</Text>
                            <Text className="text-gray-400 text-center px-8">
                                Añade exámenes desde el calendario para generar tu plan de estudio automáticamente.
                            </Text>
                        </View>
                    ) : (
                        displayPlans.map((group, groupIdx) => {
                            const dateObj = new Date(group.date);
                            const isTodayDate = isToday(dateObj);
                            const label = isTodayDate ? 'Hoy' : isTomorrow(dateObj) ? 'Mañana' : format(dateObj, 'EEEE d', { locale: es });

                            return (
                                <View key={groupIdx} className="relative mb-6">
                                    <View
                                        style={{
                                            position: 'absolute',
                                            left: 7,
                                            top: 24,
                                            bottom: -20,
                                            width: 2,
                                            backgroundColor: '#333'
                                        }}
                                    />

                                    <View className="flex-row items-center mb-4">
                                        <View className="w-4 h-4 rounded-full bg-zinc-500 border-4 border-black z-10" />
                                        <Text className="text-white text-lg font-bold ml-4 capitalize">{label}</Text>
                                    </View>

                                    <View className="pl-8 gap-3">
                                        {group.items.map((item, idx) => {
                                            const isHighlighted = highlightId && (item.examId === highlightId || item.id === highlightId);
                                            const isActive = (isTodayDate && !item.completed) || isHighlighted;
                                            const handleCheck = () => {
                                                if (Platform.OS !== 'web') {
                                                    Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
                                                }
                                                LayoutAnimation.configureNext(LayoutAnimation.Presets.easeInEaseOut);
                                                completeMicroTask(user?.uid, item.id);
                                            };

                                            return (
                                                <View
                                                    key={item.id}
                                                    style={{
                                                        backgroundColor: isActive ? '#222' : '#121212',
                                                        borderRadius: 24,
                                                        padding: 16,
                                                        paddingVertical: 20,
                                                        flexDirection: 'row',
                                                        alignItems: 'center',
                                                        borderWidth: 1,
                                                        borderColor: isHighlighted ? tokens.colors.blue : (isActive ? 'transparent' : '#333')
                                                    }}
                                                >
                                                    <View
                                                        style={{
                                                            position: 'absolute',
                                                            left: 0,
                                                            top: 10,
                                                            bottom: 10,
                                                            width: 6,
                                                            backgroundColor: item.subjectColor || '#333',
                                                            borderTopRightRadius: 6,
                                                            borderBottomRightRadius: 6
                                                        }}
                                                    />

                                                    <View className="flex-1 ml-4">
                                                        <View className="flex-row items-center mb-1">
                                                            <Text className="text-[10px] font-bold text-zinc-500 uppercase tracking-wider">
                                                                {item.phase || 'REPASO'}
                                                            </Text>
                                                            <Text
                                                                className="text-[10px] font-bold uppercase tracking-wider"
                                                                style={{ color: item.subjectColor }}
                                                            >
                                                                {item.subject || item.subjectName}
                                                            </Text>
                                                        </View>
                                                        <Text
                                                            className={`text-base font-bold leading-5 text-white ${item.completed ? 'line-through opacity-50' : ''}`}
                                                        >
                                                            {item.text}
                                                        </Text>
                                                        {isActive && (
                                                            <Text className="text-xs text-zinc-500 mt-1 font-medium">
                                                                {item.duration || 25} min
                                                            </Text>
                                                        )}
                                                    </View>

                                                    <View className="flex-row items-center gap-3 ml-2">
                                                        <TouchableOpacity onPress={handleCheck}>
                                                            <View
                                                                style={{
                                                                    width: 24,
                                                                    height: 24,
                                                                    borderRadius: 12,
                                                                    borderWidth: 2,
                                                                    borderColor: isActive ? '#4A90E2' : '#444',
                                                                    alignItems: 'center',
                                                                    justifyContent: 'center',
                                                                    backgroundColor: item.completed ? (isActive ? '#4A90E2' : '#444') : 'transparent'
                                                                }}
                                                            >
                                                                {item.completed && <Check size={14} color="#FFF" />}
                                                            </View>
                                                        </TouchableOpacity>
                                                    </View>
                                                </View>
                                            );
                                        })}
                                    </View>
                                </View>
                            );
                        })
                    )
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
                                elevation: 4
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
                            <View style={{
                                marginTop: 32,
                                backgroundColor: 'rgba(255, 214, 10, 0.1)',
                                borderRadius: 16,
                                padding: 16,
                                borderWidth: 1,
                                borderColor: 'rgba(255, 214, 10, 0.3)'
                            }}>
                                <Text style={{ color: '#FFD60A', fontWeight: '700', fontSize: 16, marginBottom: 8 }}>
                                    ¿Necesitas más espacio?
                                </Text>
                                <Text style={{ color: '#FFFFFF', opacity: 0.8, marginBottom: 16 }}>
                                    Con Schedio Prime tendrás almacenamiento ilimitado y análisis de documentos con IA.
                                </Text>
                                <TouchableOpacity
                                    style={{ backgroundColor: '#FFD60A', padding: 12, borderRadius: 100, alignItems: 'center' }}
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
