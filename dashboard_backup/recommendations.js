// Recommendations v1.1 - Route Fix
import { View, Text, ScrollView, TouchableOpacity } from 'react-native';
import { useRouter } from 'expo-router';
import { Brain, Sparkles, TrendingUp, Target, Clock, Zap, ArrowLeft, RefreshCw } from 'lucide-react-native';
import { tokens } from '../../theme/tokens';
import { GlassCard } from '../../components/GlassView';
import { SchedioButton } from '../../components/SchedioButton';

export default function RecommendationsScreen() {
    const router = useRouter();

    return (
        <View className="flex-1 bg-background pt-16 px-6">
            <View className="flex-row justify-between items-center mb-10">
                <TouchableOpacity onPress={() => router.back()} className="w-10 h-10 items-center justify-center">
                    <ArrowLeft size={24} color="white" />
                </TouchableOpacity>
                <Text className="text-xl font-black text-white">Recomendaciones IA</Text>
                <TouchableOpacity className="w-10 h-10 items-center justify-center">
                    <RefreshCw size={20} color={tokens.colors.blue} />
                </TouchableOpacity>
            </View>

            <ScrollView showsVerticalScrollIndicator={false}>
                {/* AI Hero Section - 1:1 with Recommendations.css .hero-recommendation */}
                <GlassCard className="rounded-[40px] items-center py-10 mb-10 border-primary/30" intensity={20}>
                    <View className="w-16 h-16 bg-blue/20 rounded-full items-center justify-center mb-6">
                        <Brain size={32} color={tokens.colors.blue} />
                        <View className="absolute top-0 right-0">
                            <Sparkles size={16} color={tokens.colors.yellow} fill={tokens.colors.yellow} />
                        </View>
                    </View>
                    <Text className="text-textSecondary font-black uppercase tracking-[3px] text-[10px] mb-2">Recomendación del Día</Text>
                    <Text className="text-xl font-black text-white text-center px-6 leading-7">
                        Hoy es un día ideal para enfocarte en <Text className="text-primary italic">Álgebra</Text>. Tu nivel de retención es más alto por la mañana.
                    </Text>
                </GlassCard>

                {/* Analysis Patterns Grid */}
                <Text className="text-textTertiary text-[11px] font-black uppercase tracking-[2px] mb-6">Análisis de Patrones</Text>
                <View className="flex-row flex-wrap gap-4 mb-10">
                    <GlassCard className="w-[47%] py-6 items-center rounded-3xl" intensity={10}>
                        <Target size={24} color={tokens.colors.green} className="mb-2" />
                        <Text className="text-white font-black text-lg">Alta</Text>
                        <Text className="text-[10px] text-textTertiary font-black uppercase">Consistencia</Text>
                    </GlassCard>
                    <GlassCard className="w-[47%] py-6 items-center rounded-3xl" intensity={10}>
                        <Clock size={24} color={tokens.colors.blue} className="mb-2" />
                        <Text className="text-white font-black text-lg">10:30</Text>
                        <Text className="text-[10px] text-textTertiary font-black uppercase">Mejor Hora</Text>
                    </GlassCard>
                    <GlassCard className="w-[47%] py-6 items-center rounded-3xl" intensity={10}>
                        <Zap size={24} color={tokens.colors.orange} className="mb-2" />
                        <Text className="text-white font-black text-lg">45m</Text>
                        <Text className="text-[10px] text-textTertiary font-black uppercase">Foco Promedio</Text>
                    </GlassCard>
                    <GlassCard className="w-[47%] py-6 items-center rounded-3xl" intensity={10}>
                        <TrendingUp size={24} color={tokens.colors.purple} className="mb-2" />
                        <Text className="text-white font-black text-lg">+12%</Text>
                        <Text className="text-[10px] text-textTertiary font-black uppercase">Mejora Semanal</Text>
                    </GlassCard>
                </View>

                {/* AI Study Plan suggested */}
                <Text className="text-textTertiary text-[11px] font-black uppercase tracking-[2px] mb-6">Plan Sugerido</Text>
                <GlassCard className="p-6 rounded-[32px] mb-20" intensity={10}>
                    <View className="flex-row items-center gap-4">
                        <View className="w-12 h-12 bg-white/5 rounded-2xl items-center justify-center border border-white/10">
                            <Zap size={20} color={tokens.colors.blue} />
                        </View>
                        <View className="flex-1">
                            <Text className="text-white font-black text-lg">Siguiente Paso: Matrices</Text>
                            <Text className="text-textSecondary text-xs font-bold uppercase mt-0.5">Prioridad Crítica • 50 Min</Text>
                        </View>
                    </View>
                    <TouchableOpacity
                        onPress={() => router.push('/dashboard/study')}
                        className="mt-6 bg-blue h-12 rounded-2xl items-center justify-center shadow-lg shadow-blue-500/20"
                    >
                        <Text className="text-white font-black uppercase tracking-widest text-xs">Empezar Ahora</Text>
                    </TouchableOpacity>
                </GlassCard>

                <View className="h-40" />
            </ScrollView>
        </View>
    );
}
