import { View, Text, ScrollView, TouchableOpacity, Dimensions } from 'react-native';
import { useRouter } from 'expo-router';
import { useEffect, useMemo } from 'react';
import {
  ArrowLeft,
  Clock,
  Calendar,
  ChevronRight,
  Target,
  Star,
  TrendingUp,
  BarChart2,
} from 'lucide-react-native';
import { tokens } from '../../theme/tokens';
import { GlassCard } from '../../components/GlassView';
import useUserStore from '../../store/userStore';
import useAuthStore from '../../store/authStore';
import { Svg, Rect, G } from 'react-native-svg';

const { width } = Dimensions.get('window');

export default function HistoryScreen() {
  const router = useRouter();
  const user = useAuthStore((state) => state.user);
  // Per-slice selectors so an unrelated store write doesn't redraw the list.
  const sessionHistory = useUserStore((state) => state.sessionHistory);
  const subjects = useUserStore((state) => state.subjects);
  const stats = useUserStore((state) => state.stats);

  useEffect(() => {
    if (user) {
      useUserStore.getState().loadSessionHistory(user.uid);
    }
  }, [user]);

  // Analytics Calculations
  const analytics = useMemo(() => {
    if (!sessionHistory.length) return null;

    const now = new Date();
    const last7Days = [...Array(7)].map((_, i) => {
      const d = new Date();
      d.setDate(now.getDate() - (6 - i));
      return d.toDateString();
    });

    // 1. Time per day (Last 7 days)
    const dailyData = last7Days.map((dateStr) => {
      const daySessions = sessionHistory.filter((s) => new Date(s.date).toDateString() === dateStr);
      const totalMins = daySessions.reduce((acc, s) => acc + (s.duration || 0), 0);
      return {
        label: dateStr.split(' ')[0], // Mon, Tue...
        value: totalMins / 60, // to hours
        mins: totalMins,
      };
    });

    // 2. Goal completion rate
    let totalGoals = 0;
    let completedGoals = 0;
    sessionHistory.forEach((s) => {
      if (s.goals && s.goals.length) {
        totalGoals += s.goals.length;
        completedGoals += s.goals.filter((g) => g.completed).length;
      }
    });

    const goalRate = totalGoals ? Math.round((completedGoals / totalGoals) * 100) : 0;

    // 3. Subject distribution
    const subDist = {};
    sessionHistory.forEach((s) => {
      if (!subDist[s.subjectId]) subDist[s.subjectId] = 0;
      subDist[s.subjectId] += s.duration || 0;
    });

    const topSubjects = Object.entries(subDist)
      .map(([id, time]) => ({
        subject: subjects.find((sub) => sub.id === id) || {
          name: 'Otro',
          color: tokens.colors.textSecondary,
        },
        time,
      }))
      .sort((a, b) => b.time - a.time)
      .slice(0, 3);

    return { dailyData, goalRate, topSubjects };
  }, [sessionHistory, subjects]);

  const formatDuration = (mins) => {
    if (mins < 60) return `${mins}m`;
    const hrs = (mins / 60).toFixed(1);
    return `${hrs}h`;
  };

  const formatDate = (date) => {
    const d = new Date(date);
    const today = new Date().toDateString();
    const yesterday = new Date();
    yesterday.setDate(yesterday.getDate() - 1);

    if (d.toDateString() === today) return 'Hoy';
    if (d.toDateString() === yesterday.toDateString()) return 'Ayer';

    return d.toLocaleDateString('es-ES', { day: 'numeric', month: 'short' });
  };

  return (
    <View className="flex-1 bg-background pt-16">
      <View className="flex-row items-center px-6 mb-8">
        <TouchableOpacity
          onPress={() => router.back()}
          className="w-10 h-10 items-center justify-center mr-2"
        >
          <ArrowLeft size={24} color="white" />
        </TouchableOpacity>
        <Text className="text-4xl font-black text-white tracking-tighter">Historial</Text>
      </View>

      <ScrollView
        showsVerticalScrollIndicator={false}
        contentContainerStyle={{ paddingHorizontal: 24, paddingBottom: 100 }}
      >
        {/* Analytics Section */}
        {analytics && (
          <View className="mb-10">
            <Text className="text-textTertiary text-[11px] font-black uppercase tracking-[2px] mb-6">
              Analíticas Semanales
            </Text>

            <GlassCard className="p-6 mb-4 rounded-[32px]" intensity={15}>
              <View className="flex-row justify-between items-end mb-6">
                <View>
                  <Text className="text-white font-black text-2xl">
                    {(stats.totalTime / 60).toFixed(1)}h
                  </Text>
                  <Text className="text-textTertiary text-[10px] font-bold uppercase">
                    Tiempo Total de Estudio
                  </Text>
                </View>
                <View className="items-end">
                  <Text className="text-primary font-black text-2xl">{analytics.goalRate}%</Text>
                  <Text className="text-textTertiary text-[10px] font-bold uppercase">
                    Metas Cumplidas
                  </Text>
                </View>
              </View>

              {/* Custom Bar Chart using SVG */}
              <View style={{ height: 120, width: '100%', marginTop: 10 }}>
                <Svg height="100%" width="100%">
                  {analytics.dailyData.map((day, i) => {
                    const chartWidth = width - 48 - 48; // screen - margins - card padding
                    const barWidth = 24;
                    const gap = (chartWidth - 7 * barWidth) / 6;
                    const maxVal = Math.max(...analytics.dailyData.map((d) => d.value), 1);
                    const barHeight = (day.value / maxVal) * 80; // max 80px high

                    return (
                      <G key={i}>
                        <Rect
                          x={i * (barWidth + gap)}
                          y={80 - barHeight}
                          width={barWidth}
                          height={barHeight}
                          rx={6}
                          fill={i === 6 ? tokens.colors.primary : tokens.colors.primary + '30'}
                        />
                        <Text
                          style={{
                            position: 'absolute',
                            left: i * (barWidth + gap),
                            top: 90,
                            color: tokens.colors.textTertiary,
                            fontSize: 9,
                            fontWeight: 'bold',
                            width: barWidth,
                            textAlign: 'center',
                          }}
                        >
                          {day.label}
                        </Text>
                      </G>
                    );
                  })}
                </Svg>
                <View className="flex-row justify-between mt-2">
                  {analytics.dailyData.map((day, i) => (
                    <Text
                      key={i}
                      style={{
                        color: tokens.colors.textTertiary,
                        fontSize: 9,
                        fontWeight: '900',
                        width: 24,
                        textAlign: 'center',
                      }}
                    >
                      {day.label.slice(0, 1)}
                    </Text>
                  ))}
                </View>
              </View>
            </GlassCard>

            <View className="flex-row gap-3">
              {analytics.topSubjects.map((item, i) => (
                <GlassCard key={i} className="flex-1 p-4 rounded-2xl items-center" intensity={10}>
                  <View
                    className="w-8 h-8 rounded-lg mb-2 items-center justify-center"
                    style={{ backgroundColor: item.subject.color + '20' }}
                  >
                    <Clock size={14} color={item.subject.color} />
                  </View>
                  <Text className="text-white font-bold text-[10px]" numberOfLines={1}>
                    {item.subject.name}
                  </Text>
                  <Text className="text-textTertiary text-[9px] font-black">
                    {formatDuration(item.time)}
                  </Text>
                </GlassCard>
              ))}
            </View>
          </View>
        )}

        <Text className="text-textTertiary text-[11px] font-black uppercase tracking-[2px] mb-6">
          Sesiones Recientes
        </Text>

        {sessionHistory.length > 0 ? (
          sessionHistory.map((session) => {
            const subject = subjects.find((s) => s.id === session.subjectId);
            const completedGoals = session.goals?.filter((g) => g.completed).length || 0;
            const totalGoals = session.goals?.length || 0;

            return (
              <TouchableOpacity key={session.id} activeOpacity={0.8} className="mb-4">
                <GlassCard className="rounded-[28px] border-white/5 p-5" intensity={10}>
                  <View className="flex-row justify-between items-center">
                    <View className="flex-row items-center flex-1">
                      <View
                        className="w-12 h-12 rounded-2xl mr-4 items-center justify-center"
                        style={{
                          backgroundColor: (subject?.color || tokens.colors.primary) + '20',
                        }}
                      >
                        <Calendar size={22} color={subject?.color || tokens.colors.primary} />
                      </View>
                      <View className="flex-1">
                        <View className="flex-row items-center">
                          <Text className="text-white font-black text-lg mr-2">
                            {subject?.name || 'Materia'}
                          </Text>
                          {totalGoals > 0 && (
                            <View className="bg-primary/20 px-2 py-0.5 rounded-full">
                              <Text className="text-primary text-[9px] font-black">
                                {completedGoals}/{totalGoals} METAS
                              </Text>
                            </View>
                          )}
                        </View>
                        <Text className="text-textTertiary text-xs font-bold uppercase">
                          {formatDate(session.date)} • {session.duration} min
                        </Text>
                      </View>
                    </View>
                    <View className="flex-row gap-1">
                      {[1, 2, 3, 4, 5].map((i) => (
                        <Star
                          key={i}
                          size={8}
                          color={
                            i <= (session.focusScore || 5)
                              ? tokens.colors.yellow
                              : tokens.colors.textTertiary + '40'
                          }
                          fill={
                            i <= (session.focusScore || 5) ? tokens.colors.yellow : 'transparent'
                          }
                        />
                      ))}
                    </View>
                  </View>
                </GlassCard>
              </TouchableOpacity>
            );
          })
        ) : (
          <GlassCard
            className="p-10 items-center justify-center rounded-[32px] border-dashed border-white/10"
            intensity={5}
          >
            <Target
              size={40}
              color={tokens.colors.textTertiary}
              style={{ marginBottom: 16, opacity: 0.3 }}
            />
            <Text className="text-textTertiary font-bold text-center">
              No hay sesiones registradas aún.{'\n'}¡Empieza a estudiar para ver tu progreso!
            </Text>
          </GlassCard>
        )}

        <View className="h-40" />
      </ScrollView>
    </View>
  );
}
