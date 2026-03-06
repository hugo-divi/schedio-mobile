import { Modal, View, Text, TouchableOpacity, StyleSheet, ScrollView } from 'react-native';
import { X, Zap, BookOpen, Star, Crown, Moon } from 'lucide-react-native';

const RANKS = [
    { title: 'Aprendiz', minLevel: 1, maxLevel: 4, color: '#64D2FF', icon: 'Zap' },
    { title: 'Estudiante', minLevel: 5, maxLevel: 9, color: '#30D158', icon: 'BookOpen' },
    { title: 'Académico', minLevel: 10, maxLevel: 19, color: '#BF5AF2', icon: 'Star' },
    { title: 'Maestro', minLevel: 20, maxLevel: 49, color: '#FFD60A', icon: 'Crown' },
    { title: 'Sabio', minLevel: 50, maxLevel: Infinity, color: '#FF9F0A', icon: 'Moon' },
];

const IconMap = { Zap, BookOpen, Star, Crown, Moon };

function getRankForLevel(level) {
    return RANKS.find(r => level >= r.minLevel && level <= r.maxLevel) || RANKS[0];
}

export default function LevelProgressModal({ visible, onClose, gamification }) {
    if (!gamification) return null;

    const { level = 1, xp = 0, rank } = gamification;

    // Calculate Progress
    const currentLevelBaseXP = Math.pow(level - 1, 2) * 100;
    const nextLevelXP = Math.pow(level, 2) * 100;
    const levelProgress = xp - currentLevelBaseXP;
    const levelTotal = nextLevelXP - currentLevelBaseXP;
    const percentage = Math.min(100, Math.max(0, (levelProgress / levelTotal) * 100));

    const currentRankObj = getRankForLevel(level);
    const nextMajorRankIndex = RANKS.findIndex(r => r.minLevel > level);
    const nextMajorRank = nextMajorRankIndex !== -1 ? RANKS[nextMajorRankIndex] : null;

    const RankIcon = IconMap[currentRankObj?.icon] || Zap;
    const NextIcon = nextMajorRank ? IconMap[nextMajorRank.icon] || Zap : null;

    return (
        <Modal
            visible={visible}
            transparent
            animationType="fade"
            onRequestClose={onClose}
        >
            <TouchableOpacity
                style={styles.overlay}
                activeOpacity={1}
                onPress={onClose}
            >
                <TouchableOpacity
                    style={styles.modalContent}
                    activeOpacity={1}
                    onPress={(e) => e.stopPropagation()}
                >
                    <TouchableOpacity style={styles.closeButton} onPress={onClose}>
                        <X size={24} color="#8E8E93" />
                    </TouchableOpacity>

                    <ScrollView showsVerticalScrollIndicator={false}>
                        <View style={styles.header}>
                            <View style={[styles.iconRing, { borderColor: currentRankObj.color }]}>
                                <RankIcon size={48} color={currentRankObj.color} strokeWidth={1.5} />
                            </View>
                            <Text style={styles.levelTitle}>Nivel {level}</Text>
                            <Text style={[styles.rankSubtitle, { color: currentRankObj.color }]}>
                                {rank || currentRankObj.title}
                            </Text>
                        </View>

                        <View style={styles.xpSection}>
                            <View style={styles.xpLabels}>
                                <Text style={styles.xpLabel}>XP Actual</Text>
                                <Text style={styles.xpValue}>{Math.floor(xp)} / {nextLevelXP}</Text>
                            </View>
                            <View style={styles.xpBarTrack}>
                                <View
                                    style={[
                                        styles.xpBarFill,
                                        { width: `${percentage}%`, backgroundColor: currentRankObj.color }
                                    ]}
                                />
                            </View>
                            <Text style={styles.xpMessage}>
                                ¡Solo faltan <Text style={styles.xpBold}>{nextLevelXP - Math.floor(xp)} XP</Text> para el nivel {level + 1}!
                            </Text>
                        </View>

                        {nextMajorRank && (
                            <View style={styles.nextRankPreview}>
                                <View style={styles.nextRankInfo}>
                                    <Text style={styles.nextRankLabel}>Próximo Rango</Text>
                                    <Text style={styles.nextRankTitle}>{nextMajorRank.title}</Text>
                                    <Text style={styles.nextRankLevel}>Desbloqueado al Nivel {nextMajorRank.minLevel}</Text>
                                </View>
                                {NextIcon && <NextIcon size={32} color={nextMajorRank.color} style={{ opacity: 0.5 }} />}
                            </View>
                        )}

                        <View style={styles.footer}>
                            <Zap size={14} color="#4A90E2" style={{ marginRight: 4 }} />
                            <Text style={styles.footerTip}>
                                Tip: Completa sesiones largas para ganar más XP
                            </Text>
                        </View>
                    </ScrollView>
                </TouchableOpacity>
            </TouchableOpacity>
        </Modal>
    );
}

const styles = StyleSheet.create({
    overlay: {
        flex: 1,
        backgroundColor: 'rgba(0, 0, 0, 0.8)',
        justifyContent: 'center',
        alignItems: 'center',
        padding: 24,
    },
    modalContent: {
        backgroundColor: '#1C1C1E',
        borderRadius: 24,
        padding: 32,
        width: '100%',
        maxWidth: 400,
        maxHeight: '80%',
        borderWidth: 1,
        borderColor: 'rgba(255, 255, 255, 0.1)',
    },
    closeButton: {
        position: 'absolute',
        top: 16,
        right: 16,
        width: 32,
        height: 32,
        borderRadius: 16,
        backgroundColor: '#2C2C2E',
        alignItems: 'center',
        justifyContent: 'center',
        zIndex: 10,
    },
    header: {
        alignItems: 'center',
        marginBottom: 32,
    },
    iconRing: {
        width: 96,
        height: 96,
        borderRadius: 48,
        borderWidth: 3,
        alignItems: 'center',
        justifyContent: 'center',
        marginBottom: 16,
    },
    levelTitle: {
        fontSize: 28,
        fontWeight: '700',
        color: '#FFFFFF',
        marginBottom: 4,
    },
    rankSubtitle: {
        fontSize: 16,
        fontWeight: '600',
    },
    xpSection: {
        marginBottom: 24,
    },
    xpLabels: {
        flexDirection: 'row',
        justifyContent: 'space-between',
        marginBottom: 8,
    },
    xpLabel: {
        fontSize: 13,
        color: '#8E8E93',
    },
    xpValue: {
        fontSize: 13,
        fontWeight: '600',
        color: '#FFFFFF',
    },
    xpBarTrack: {
        height: 8,
        backgroundColor: '#2C2C2E',
        borderRadius: 4,
        overflow: 'hidden',
        marginBottom: 12,
    },
    xpBarFill: {
        height: '100%',
        borderRadius: 4,
    },
    xpMessage: {
        fontSize: 14,
        color: '#8E8E93',
        textAlign: 'center',
    },
    xpBold: {
        fontWeight: '700',
        color: '#FFFFFF',
    },
    nextRankPreview: {
        flexDirection: 'row',
        justifyContent: 'space-between',
        alignItems: 'center',
        backgroundColor: '#2C2C2E',
        padding: 16,
        borderRadius: 16,
        marginBottom: 24,
    },
    nextRankInfo: {
        flex: 1,
    },
    nextRankLabel: {
        fontSize: 11,
        color: '#8E8E93',
        textTransform: 'uppercase',
        marginBottom: 4,
    },
    nextRankTitle: {
        fontSize: 18,
        fontWeight: '700',
        color: '#FFFFFF',
        marginBottom: 2,
    },
    nextRankLevel: {
        fontSize: 13,
        color: '#8E8E93',
    },
    footer: {
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'center',
        padding: 12,
        backgroundColor: 'rgba(74, 144, 226, 0.1)',
        borderRadius: 12,
    },
    footerTip: {
        fontSize: 12,
        color: '#8E8E93',
    },
});
