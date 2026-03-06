









import { View } from 'react-native';
import { Text } from 'react-native';
import { ScrollView } from 'react-native';
import { TouchableOpacity } from 'react-native';
import { Dimensions } from 'react-native';
import { Trophy } from 'lucide-react-native';
import { Medal } from 'lucide-react-native';
import { Crown } from 'lucide-react-native';
import { Search } from 'lucide-react-native';
import { BookOpen } from 'lucide-react-native';
import { Star } from 'lucide-react-native';
import { Zap } from 'lucide-react-native';
import { ArrowLeft } from 'lucide-react-native';
// SHIFTED LINE 14
import { useRouter } from 'expo-router';
import { tokens } from '../../theme/tokens';
import { GlassCard } from '../../components/GlassView';
import { Circle } from 'react-native-svg';
import Svg from 'react-native-svg';

const RANKS = [
    { minLevel: 1, title: 'Novato', color: '#8E8E93', icon: Zap, description: '¡El comienzo de tu viaje!' },
    { minLevel: 5, title: 'Aprendiz', color: '#32ADE6', icon: BookOpen, description: 'Tus bases se están fortaleciendo.' },
    { minLevel: 10, title: 'Estudiante', color: '#30D158', icon: Star, description: 'Has demostrado constancia.' },
    { minLevel: 20, title: 'Erudito', color: '#FF9500', icon: Crown, description: 'Eres un referente del saber.' },
    { minLevel: 30, title: 'Maestro', color: '#FF2D55', icon: Zap, description: 'Dominas el arte del aprendizaje.' },
    { minLevel: 50, title: 'Leyenda', color: '#BF5AF2', icon: Crown, description: 'Has alcanzado la cima.' },
];

export default function RanksScreen() {
    const router = useRouter();
    const currentLevel = 42; // Mock logic for now
    const progressPercent = Math.min(Math.round((currentLevel / 50) * 100), 100);

    const radius = 40;
    const circumference = 2 * Math.PI * radius;

    return (
        <View className="flex-1 bg-background pt-16 px-6">
            <View className="flex-row justify-between items-center mb-10">
                <View className="flex-row items-center">
                    <TouchableOpacity onPress={() => router.back()} className="mr-4">
                        <ArrowLeft size={24} color="white" />
                    </TouchableOpacity>
                    <View>
                        <Text className="text-textSecondary text-[10px] font-black uppercase tracking-[3px] mb-1">Escalera de</Text>
                        <Text className="text-4xl font-black text-text tracking-tighter">Rangos</Text>
                    </View>
                </View>
                <TouchableOpacity className="w-11 h-11 rounded-full bg-surface2 border border-white/10 items-center justify-center">
                    <Search size={20} color="white" />
                </TouchableOpacity>
            </View>

            <ScrollView showsVerticalScrollIndicator={false}>
                {/* Progress Header - 1:1 with Ranks.jsx */}
                <View className="items-center mb-12">
                    <View className="relative items-center justify-center mb-4">
                        <Svg width={100} height={100}>
                            <Circle
                                cx="50" cy="50" r={radius}
                                stroke="rgba(255,255,255,0.05)" strokeWidth="8" fill="none"
                            />
                            <Circle
                                cx="50" cy="50" r={radius}
                                stroke={tokens.colors.primary} strokeWidth="8" fill="none"
                                strokeDasharray={circumference}
                                strokeDashoffset={circumference * (1 - progressPercent / 100)}
                                strokeLinecap="round"
                                transform="rotate(-90 50 50)"
                            />
                        </Svg>
                        <View className="absolute inset-0 items-center justify-center">
                            <Text className="text-2xl font-black text-white">{progressPercent}%</Text>
                        </View>
                    </View>
                    <Text className="text-textSecondary font-bold">Estás en el nivel <Text className="text-primary font-black">{currentLevel}</Text>. ¡Casi Leyenda!</Text>
                </View>

                {/* Rank Staircase - Mobile implementation of staircase */}
                <Text className="text-textTertiary text-[11px] font-black uppercase tracking-[2px] mb-6">Camino a la Maestría</Text>

                {RANKS.map((rank, index) => {
                    const isLocked = currentLevel < rank.minLevel;
                    const isActive = currentLevel >= rank.minLevel &&
                        (!RANKS[index + 1] || currentLevel < RANKS[index + 1].minLevel);
                    const Icon = rank.icon;

                    return (
                        <View key={rank.title} className="mb-4">
                            <GlassCard
                                className={`rounded-[28px] ${isActive ? 'border-2' : 'border'} ${isActive ? '' : 'opacity-40'}`}
                                style={isActive ? { borderColor: rank.color } : { borderColor: 'rgba(255,255,255,0.05)' }}
                                intensity={isActive ? 20 : 5}
                            >
                                <View className="flex-row items-center">
                                    <View
                                        className="w-12 h-12 rounded-2xl items-center justify-center mr-4"
                                        style={{ backgroundColor: rank.color }}
                                    >
                                        <Icon size={24} color="white" fill={isActive ? "white" : "transparent"} />
                                    </View>
                                    <View className="flex-1">
                                        <View className="flex-row justify-between items-center mb-1">
                                            <Text className="text-white font-black text-lg">{rank.title}</Text>
                                            <Text className="text-textTertiary text-[10px] font-bold">NIVEL {rank.minLevel}+</Text>
                                        </View>
                                        <Text className="text-textSecondary text-xs font-medium">{rank.description}</Text>
                                    </View>
                                    {isActive && (
                                        <View className="ml-2 bg-white/10 px-3 py-1 rounded-full border border-white/10">
                                            <Text className="text-white text-[10px] font-black uppercase">ACTIVO</Text>
                                        </View>
                                    )}
                                </View>
                            </GlassCard>
                        </View>
                    );
                })}

                <View className="h-40" />
            </ScrollView>
        </View>
    );
}
