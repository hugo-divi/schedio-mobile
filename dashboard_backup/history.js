import { View, Text, ScrollView, TouchableOpacity } from 'react-native';
import { useRouter } from 'expo-router';
import { ArrowLeft, Clock, Calendar, ChevronRight, Target, Star } from 'lucide-react-native';
import { tokens } from '../../theme/tokens';
import { GlassCard } from '../../components/GlassView';

export default function HistoryScreen() {
    const router = useRouter();

    const history = [
        { id: 1, subject: 'Álgebra', duration: 45, date: 'Hoy, 10:30', focus: 5, color: tokens.colors.blue },
        { id: 2, subject: 'Física', duration: 25, date: 'Ayer, 18:45', focus: 4, color: tokens.colors.indigo },
        { id: 3, subject: 'Historia', duration: 60, date: '22 Ene, 11:00', focus: 5, color: tokens.colors.purple },
    ];

    return (
        <View className="flex-1 bg-background pt-16 px-6">
            <View className="flex-row items-center mb-10">
                <TouchableOpacity onPress={() => router.back()} className="w-10 h-10 items-center justify-center mr-2">
                    <ArrowLeft size={24} color="white" />
                </TouchableOpacity>
                <Text className="text-4xl font-black text-text tracking-tighter">Historial</Text>
            </View>

            {/* Stats Summary Row */}
            <View className="flex-row gap-3 mb-10">
                <GlassCard className="flex-1 py-6 items-center rounded-3xl" intensity={10}>
                    <Text className="text-[10px] text-textTertiary font-black uppercase mb-1">Total</Text>
                    <Text className="text-2xl font-black text-white">12.5h</Text>
                </GlassCard>
                <GlassCard className="flex-1 py-6 items-center rounded-3xl" intensity={10}>
                    <Text className="text-[10px] text-textTertiary font-black uppercase mb-1">Sesiones</Text>
                    <Text className="text-2xl font-black text-white">24</Text>
                </GlassCard>
            </View>

            <ScrollView showsVerticalScrollIndicator={false}>
                <Text className="text-textTertiary text-[11px] font-black uppercase tracking-[2px] mb-6">Sesiones Recientes</Text>

                {history.map(session => (
                    <TouchableOpacity key={session.id} activeOpacity={0.8} className="mb-4">
                        <GlassCard className="rounded-[28px] border-white/5" intensity={10}>
                            <View className="flex-row justify-between items-center">
                                <View className="flex-row items-center">
                                    <View className="w-10 h-10 rounded-xl mr-4 items-center justify-center" style={{ backgroundColor: session.color + '20' }}>
                                        <Clock size={20} color={session.color} />
                                    </View>
                                    <View>
                                        <Text className="text-white font-black text-lg">{session.subject}</Text>
                                        <Text className="text-textTertiary text-xs font-bold uppercase">{session.date} • {session.duration} min</Text>
                                    </View>
                                </View>
                                <View className="flex-row gap-1">
                                    {[1, 2, 3].map(i => (
                                        <Star key={i} size={10} color={tokens.colors.yellow} fill={tokens.colors.yellow} />
                                    ))}
                                </View>
                            </View>
                        </GlassCard>
                    </TouchableOpacity>
                ))}

                <View className="h-40" />
            </ScrollView>
        </View>
    );
}
