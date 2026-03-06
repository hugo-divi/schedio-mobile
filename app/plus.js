import { View, Text, TouchableOpacity, ScrollView, Dimensions, StyleSheet, Platform, Animated } from 'react-native';
import { useRouter } from 'expo-router';
import { ChevronLeft, Sparkles, Brain, Zap, FolderOpen, Layout, Infinity, Check, ShieldCheck, X, Star, Users, BrainCircuit, TrendingUp } from 'lucide-react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { BlurView } from 'expo-blur';
import { useState, useRef, useEffect } from 'react';
import { tokens } from '../theme/tokens';
import { getOfferings, purchasePackage } from '../services/revenuecat';
import useAuthStore from '../store/authStore';
import { ActivityIndicator, Alert } from 'react-native';

const { width, height } = Dimensions.get('window');
const CARD_WIDTH = width - 84;
const CARD_MARGIN = 12;
const SNAP_INTERVAL = CARD_WIDTH + CARD_MARGIN;

const features = [
    { icon: <Brain size={24} color="#FFD60A" />, title: "IA de estudio ilimitada", emoji: "🤖" },
    { icon: <Zap size={24} color="#FFD60A" />, title: "Priorización Inteligente", emoji: "⚡" },
    { icon: <FolderOpen size={24} color="#FFD60A" />, title: "Mochila sin límites", emoji: "🎒" },
    { icon: <Layout size={24} color="#FFD60A" />, title: "Widgets Personalizados", emoji: "🖼️" },
    { icon: <Infinity size={24} color="#FFD60A" />, title: "Planes de estudio extra", emoji: "📈" }
];

export default function SchedioPlusScreen() {
    const router = useRouter();
    const { isPrime, setIsPrime } = useAuthStore();
    const [step, setStep] = useState(1); // 1: Features, 2: Comparison & Testimonials, 3: Purchase
    const [selectedPlan, setSelectedPlan] = useState('monthly'); // Default to monthly as requested
    const [showDiscount, setShowDiscount] = useState(false);

    // RevenueCat State
    const [offerings, setOfferings] = useState(null);
    const [purchasing, setPurchasing] = useState(false);
    const [rcError, setRcError] = useState(null);

    // Animations
    const fadeAnim = useRef(new Animated.Value(0)).current;
    const featuresAnim = useRef(features.map(() => new Animated.Value(0))).current;
    const tableAnim = useRef(new Animated.Value(0)).current;
    const purchaseAnim = useRef(new Animated.Value(0)).current;
    const discountAnim = useRef(new Animated.Value(0)).current;

    // Load offerings (with dummy fallback)
    useEffect(() => {
        const loadOfferings = async () => {
            console.log("[Plus] Attempting to load offerings...");
            try {
                const data = await getOfferings();
                if (data) {
                    setOfferings(data);
                } else {
                    // Dummy data for testing as requested
                    setOfferings({
                        monthly: { product: { priceString: '4,99 €', price: 4.99 } },
                        annual: { product: { priceString: '80,91 €', price: 80.91 } }
                    });
                }
            } catch (err) {
                console.log("[Plus] Using dummy data for fallback");
                setOfferings({
                    monthly: { product: { priceString: '4,99 €', price: 4.99 } },
                    annual: { product: { priceString: '80,91 €', price: 80.91 } }
                });
            }
        };
        loadOfferings();
    }, []);

    const handlePurchase = async () => {
        if (!offerings) return;

        const pack = selectedPlan === 'annual'
            ? (offerings.annual || offerings.current?.annual)
            : (offerings.monthly || offerings.current?.monthly);

        if (!pack) {
            Alert.alert("Error", "No se encontró el paquete seleccionado.");
            return;
        }

        setPurchasing(true);
        const success = await purchasePackage(pack);
        setPurchasing(false);

        if (success) {
            setIsPrime(true);

            // Sync with Firestore
            try {
                const { user: currentUser } = useAuthStore.getState();
                if (currentUser) {
                    const { doc, updateDoc } = require('firebase/firestore');
                    const { db } = require('../services/firebase');
                    await updateDoc(doc(db, 'users', currentUser.uid), { isPrime: true });
                }
            } catch (error) {
                console.error("[Plus] Error syncing with Firestore:", error);
            }

            Alert.alert("¡Bienvenido a Prime!", "Tu suscripción ha sido activada con éxito. 🎉", [
                { text: "¡Genial!", onPress: () => router.back() }
            ]);
        }
    };

    // Testimonials Setup
    const scrollRef = useRef(null);
    const testimonials = [
        { name: "Hugo", text: "Me ha salvado el semestre. La IA organiza todo solo.", stars: 5 },
        { name: "Lucía", text: "La interfaz es preciosa y el ahorro de tiempo es real.", stars: 5 },
        { name: "Marc", text: "Por fin una app que entiende mis tiempos de estudio.", stars: 5 }
    ];
    const [currentIndex, setCurrentIndex] = useState(0);

    // Initial load animation
    useEffect(() => {
        Animated.timing(fadeAnim, { toValue: 1, duration: 600, useNativeDriver: true }).start();
        animateFeatures();
    }, []);

    const animateFeatures = () => {
        const stagger = featuresAnim.map((anim, i) =>
            Animated.spring(anim, {
                toValue: 1,
                tension: 50, friction: 7, delay: i * 100,
                useNativeDriver: true
            })
        );
        Animated.stagger(100, stagger).start();
    };

    const animateTable = () => {
        tableAnim.setValue(0);
        Animated.spring(tableAnim, {
            toValue: 1,
            tension: 40, friction: 8,
            useNativeDriver: true
        }).start();
    };

    // Auto-scroll testimonials (only if user isn't interacting)
    useEffect(() => {
        let interval;
        if (step === 2) {
            animateTable();
            interval = setInterval(() => {
                setCurrentIndex((prev) => {
                    const next = (prev + 1) % testimonials.length;
                    scrollRef.current?.scrollTo({
                        x: next * SNAP_INTERVAL,
                        animated: true
                    });
                    return next;
                });
            }, 6000);
        }
        return () => interval && clearInterval(interval);
    }, [step]);

    const changeStep = (newStep) => {
        Animated.timing(fadeAnim, { toValue: 0, duration: 300, useNativeDriver: true }).start(() => {
            setStep(newStep);
            Animated.timing(fadeAnim, { toValue: 1, duration: 400, useNativeDriver: true }).start();
        });
    };


    const handleExit = () => {
        if (step === 3 && !showDiscount) {
            setShowDiscount(true);
            Animated.timing(discountAnim, { toValue: 1, duration: 400, useNativeDriver: true }).start();
        } else {
            router.back();
        }
    };

    const renderStep1 = () => (
        <View style={styles.stepContainer}>
            <View style={styles.hero}>
                <Animated.View style={[styles.iconContainer, { transform: [{ scale: fadeAnim }] }]}>
                    <LinearGradient
                        colors={['#FFD60A', '#FF9F0A']}
                        start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }}
                        style={styles.fullSize}
                    >
                        <TrendingUp size={40} color="#000" fill="#000" />
                    </LinearGradient>
                </Animated.View>
                <Text style={styles.titleText}>Schedio <Text style={{ color: '#FFD60A' }}>PRIME</Text></Text>
                <Text style={styles.subtitle}>La inversión más inteligente para tu futuro académico.</Text>
            </View>

            <View style={styles.featuresList}>
                {features.map((f, i) => (
                    <Animated.View
                        key={i}
                        style={[
                            styles.featureItem,
                            {
                                opacity: featuresAnim[i],
                                transform: [{ translateX: featuresAnim[i].interpolate({ inputRange: [0, 1], outputRange: [50, 0] }) }]
                            }
                        ]}
                    >
                        <View style={styles.featureIconSmall}>{f.icon}</View>
                        <Text style={styles.featureTextSmall}>{f.title} {f.emoji}</Text>
                        <Check size={18} color="#FFD60A" />
                    </Animated.View>
                ))}
            </View>

            <View style={styles.btnWrapper}>
                <TouchableOpacity
                    style={styles.mainBtnSmall}
                    onPress={() => changeStep(2)}
                >
                    <LinearGradient
                        colors={['#FFD60A', '#FF9F0A']}
                        style={styles.btnGradient}
                        start={{ x: 0, y: 0 }} end={{ x: 1, y: 0 }}
                    >
                        <Text style={styles.btnText}>
                            Continuar
                        </Text>
                    </LinearGradient>
                </TouchableOpacity>
            </View>
        </View>
    );

    const renderStep2 = () => (
        <View style={styles.stepContainer}>
            <Text style={styles.sectionTitle}>¿Por qué ser Prime?</Text>

            {/* Comparison Table */}
            <Animated.View style={[styles.compareTable, {
                opacity: tableAnim,
                transform: [{ translateY: tableAnim.interpolate({ inputRange: [0, 1], outputRange: [30, 0] }) }]
            }]}>
                <View style={styles.compareHeader}>
                    <View style={{ flex: 1.5 }}><Text style={styles.compareLabel}>Función</Text></View>
                    <View style={{ flex: 1 }}><Text style={styles.compareLabel}>Gratis</Text></View>
                    <View style={{ flex: 1.2 }}><Text style={[styles.compareLabel, { color: '#FFD60A' }]}>Schedio PRIME</Text></View>
                </View>

                <View style={styles.compareRow}>
                    <Text style={[styles.compareText, { flex: 1.5 }]}>IA de estudio</Text>
                    <View style={styles.valCell}><X size={16} color="#FF453A" /></View>
                    <View style={styles.valCell}><Check size={16} color="#34C759" /></View>
                </View>
                <View style={styles.compareRow}>
                    <Text style={[styles.compareText, { flex: 1.5 }]}>Organización IA</Text>
                    <View style={styles.valCell}><X size={16} color="#FF453A" /></View>
                    <View style={styles.valCell}><Check size={16} color="#34C759" /></View>
                </View>
                <View style={styles.compareRow}>
                    <Text style={[styles.compareText, { flex: 1.5 }]}>Mochila</Text>
                    <View style={styles.valCell}><Text style={styles.compareVal}>50MB</Text></View>
                    <View style={styles.valCell}><Text style={[styles.compareVal, { color: '#FFD60A' }]}>5GB</Text></View>
                </View>
                <View style={styles.compareRow}>
                    <Text style={[styles.compareText, { flex: 1.5 }]}>Planes de estudio</Text>
                    <View style={styles.valCell}><Text style={styles.compareVal}>1</Text></View>
                    <View style={styles.valCell}><Text style={[styles.compareVal, { color: '#FFD60A' }]}>∞</Text></View>
                </View>
                <View style={styles.compareRow}>
                    <Text style={[styles.compareText, { flex: 1.5 }]}>Sincronización Cloud</Text>
                    <View style={styles.valCell}><X size={16} color="#FF453A" /></View>
                    <View style={styles.valCell}><Check size={16} color="#34C759" /></View>
                </View>

                <Text style={styles.moreToCome}>...y muchos más por llegar 🚀✨</Text>
            </Animated.View>

            {/* Testimonials */}
            <View style={styles.testimonialsSection}>
                <Text style={styles.sectionTitleSmall}>Opiniones de la comunidad</Text>
                <ScrollView
                    ref={scrollRef}
                    horizontal
                    scrollEnabled={true}
                    showsHorizontalScrollIndicator={false}
                    snapToInterval={SNAP_INTERVAL}
                    decelerationRate="fast"
                    snapToAlignment="center"
                    contentContainerStyle={{ paddingHorizontal: (width - CARD_WIDTH) / 2 }}
                    onScroll={(event) => {
                        const offset = event.nativeEvent.contentOffset.x;
                        const index = Math.round(offset / SNAP_INTERVAL);
                        if (index !== currentIndex) setCurrentIndex(index);
                    }}
                    scrollEventThrottle={16}
                >
                    {testimonials.map((t, i) => (
                        <View key={i} style={styles.testimonialCard}>
                            <View style={styles.starsRow}>
                                {[...Array(t.stars)].map((_, s) => <Star key={s} size={12} color="#FFD60A" fill="#FFD60A" />)}
                            </View>
                            <Text style={styles.testimonialText}>"{t.text}"</Text>
                            <Text style={styles.testimonialName}>{t.name}</Text>
                        </View>
                    ))}
                </ScrollView>
                <View style={styles.paginationDots}>
                    {testimonials.map((_, i) => (
                        <View key={i} style={[styles.dot, currentIndex === i && styles.dotActive]} />
                    ))}
                </View>
            </View>

            <View style={styles.btnWrapper}>
                <TouchableOpacity style={styles.mainBtnSmall} onPress={() => changeStep(3)}>
                    <LinearGradient
                        colors={['#FFD60A', '#FF9F0A']}
                        style={styles.btnGradient}
                        start={{ x: 0, y: 0 }} end={{ x: 1, y: 0 }}
                    >
                        <Text style={styles.btnText}>Continuar</Text>
                    </LinearGradient>
                </TouchableOpacity>
            </View>
        </View >
    );

    const renderStep3 = () => {
        const annualPackage = offerings?.annual;
        const monthlyPackage = offerings?.monthly;

        return (
            <Animated.View style={[styles.sheetContainer, {
                transform: [{ translateY: fadeAnim.interpolate({ inputRange: [0, 1], outputRange: [height, 0] }) }]
            }]}>
                <View style={styles.sheetContent}>
                    <View style={styles.sheetHandle} />
                    <Text style={styles.sheetTitle}>Elige tu plan Prime</Text>
                    <Text style={styles.sheetSubtitle}>Eleva tu productividad al máximo nivel.</Text>

                    {monthlyPackage && (
                        <TouchableOpacity
                            style={selectedPlan === 'monthly' ? styles.planCardActive : styles.planCard}
                            onPress={() => setSelectedPlan('monthly')}
                        >
                            <View style={styles.planInfo}>
                                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                                    <Text style={styles.planName}>Mensual (Opción favorita para estudiantes 🎓)</Text>
                                    <View style={styles.promoBadge}><Text style={styles.promoBadgeText}>MÁS POPULAR</Text></View>
                                </View>
                                <Text style={styles.planPrice}>4,99 € / mes</Text>
                                <Text style={styles.planBilling}>Menos que un café a la semana ☕</Text>
                            </View>
                            <View style={selectedPlan === 'monthly' ? styles.purchaseRadioActive : styles.planRadio} />
                        </TouchableOpacity>
                    )}

                    {annualPackage && (
                        <TouchableOpacity
                            style={selectedPlan === 'annual' ? styles.planCardActive : styles.planCard}
                            onPress={() => setSelectedPlan('annual')}
                        >
                            <View style={styles.planInfo}>
                                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                                    <Text style={styles.planName}>Anual (Todo un curso ✨)</Text>
                                    <View style={[styles.promoBadge, { backgroundColor: '#4A90E2' }]}><Text style={[styles.promoBadgeText, { color: '#FFF' }]}>SIN VERANO</Text></View>
                                </View>
                                <Text style={styles.planPrice}>80,91 € / año</Text>
                                <Text style={styles.planBilling}>Solo 8,99 € durante los meses lectivos 🌴</Text>
                            </View>
                            <View style={selectedPlan === 'annual' ? styles.purchaseRadioActive : styles.planRadio} />
                        </TouchableOpacity>
                    )}

                    <TouchableOpacity
                        style={[styles.buyBtn, purchasing && { opacity: 0.7 }]}
                        onPress={handlePurchase}
                        disabled={purchasing}
                    >
                        <LinearGradient
                            colors={['#FFD60A', '#FF9F0A']}
                            style={styles.btnGradient}
                            start={{ x: 0, y: 0 }} end={{ x: 1, y: 0 }}
                        >
                            {purchasing ? (
                                <ActivityIndicator color="#000" />
                            ) : (
                                <Text style={styles.btnText}>Continuar</Text>
                            )}
                        </LinearGradient>
                    </TouchableOpacity>
                    <Text style={styles.footerNote}>Cancela cuando quieras. Sin compromiso.</Text>
                </View>
            </Animated.View>
        );
    };

    const renderDiscountModal = () => (
        <Animated.View style={[styles.discountOverlay, { opacity: discountAnim }]}>
            <BlurView intensity={30} style={StyleSheet.absoluteFill} tint="dark" />
            <View style={styles.discountCard}>
                <View style={styles.discountEmoji}><Text style={{ fontSize: 40 }}>🎁</Text></View>
                <Text style={styles.discountTitle}>¡Espera! Un último regalo</Text>
                <Text style={styles.discountText}>Sabemos que quieres ser Prime. Quédate por solo:</Text>
                <Text style={styles.discountPrice}>3,49€/mes</Text>
                <Text style={styles.discountSubtext}>Durante el primer año completo</Text>

                <TouchableOpacity style={styles.discountButton} onPress={() => { setSelectedPlan('exclusive'); handlePurchase(); }}>
                    <LinearGradient colors={['#FFD60A', '#FF9F0A']} style={styles.btnGradient} start={{ x: 0, y: 0 }} end={{ x: 1, y: 0 }}>
                        <Text style={styles.btnText}>Aceptar oferta</Text>
                    </LinearGradient>
                </TouchableOpacity>
                <TouchableOpacity onPress={() => router.back()}>
                    <Text style={styles.discountSkip}>No, gracias. Prefiero pagar más luego.</Text>
                </TouchableOpacity>
            </View>
        </Animated.View>
    );

    return (
        <View style={styles.container}>
            <LinearGradient colors={['#1A1A1A', '#000']} style={StyleSheet.absoluteFill} />

            {step === 3 && (
                <View style={styles.header}>
                    <TouchableOpacity onPress={handleExit} style={styles.closeBtn}>
                        <X size={24} color="#FFF" />
                    </TouchableOpacity>
                </View>
            )}

            <View style={{ flex: 1 }}>
                <Animated.View style={{ flex: 1, opacity: step === 3 ? 0.2 : fadeAnim }}>
                    {step === 1 && renderStep1()}
                    {(step === 2 || step === 3) && renderStep2()}
                </Animated.View>

                {step === 3 && (
                    <TouchableOpacity
                        activeOpacity={1}
                        style={StyleSheet.absoluteFill}
                        onPress={handleExit}
                    />
                )}
                {step === 3 && renderStep3()}
                {showDiscount && renderDiscountModal()}
            </View>
        </View>
    );
}

const styles = StyleSheet.create({
    container: { flex: 1, backgroundColor: '#000' },
    fullSize: { flex: 1, width: '100%', height: '100%', alignItems: 'center', justifyContent: 'center', borderRadius: 24 },
    header: { position: 'absolute', top: 60, right: 24, zIndex: 100 },
    closeBtn: { width: 44, height: 44, alignItems: 'center', justifyContent: 'center', borderRadius: 22, backgroundColor: 'rgba(255,255,255,0.1)' },
    stepContainer: { flex: 1, paddingHorizontal: 30, justifyContent: 'center', paddingBottom: 60 },
    hero: { alignItems: 'center', marginBottom: 40 },
    iconContainer: { width: 80, height: 80, borderRadius: 24, marginBottom: 20, overflow: 'hidden' },
    titleText: { fontSize: 36, fontWeight: '900', color: '#FFF', fontFamily: tokens.typography.families.sans },
    subtitle: { fontSize: 16, color: '#8E8E93', textAlign: 'center', marginTop: 10, paddingHorizontal: 20, fontFamily: tokens.typography.families.sans },
    featuresList: { gap: 14, marginBottom: 40 },
    featureItem: { flexDirection: 'row', alignItems: 'center', gap: 12, backgroundColor: 'rgba(255,255,255,0.05)', padding: 14, borderRadius: 16 },
    featureIconSmall: { width: 40, height: 40, borderRadius: 10, backgroundColor: 'rgba(255,214,10,0.1)', alignItems: 'center', justifyContent: 'center' },
    featureTextSmall: { flex: 1, color: '#FFF', fontWeight: '600', fontFamily: tokens.typography.families.sans },
    btnWrapper: { alignItems: 'center', marginTop: 10 },
    mainBtnSmall: { width: width * 0.7, height: 56, borderRadius: 28, overflow: 'hidden' },
    mainBtn: { height: 60, borderRadius: 20, overflow: 'hidden' },
    btnGradient: { flex: 1, alignItems: 'center', justifyContent: 'center' },
    btnText: { color: '#000', fontSize: 18, fontWeight: '800' },
    sectionTitle: { fontSize: 28, fontWeight: '800', color: '#FFF', textAlign: 'center', marginBottom: 25, marginTop: 40 },
    compareTable: { backgroundColor: 'rgba(255,255,255,0.05)', borderRadius: 24, padding: 20, marginBottom: 30 },
    compareHeader: { flexDirection: 'row', marginBottom: 15 },
    compareLabel: { fontSize: 11, fontWeight: '800', color: '#8E8E93', textAlign: 'center' },
    compareRow: { flexDirection: 'row', alignItems: 'center', paddingVertical: 12, borderTopWidth: 1, borderTopColor: 'rgba(255,255,255,0.05)' },
    compareText: { color: '#FFF', fontSize: 14, fontWeight: '500' },
    valCell: { flex: 1, alignItems: 'center', justifyContent: 'center' },
    compareVal: { fontSize: 14, fontWeight: '600', color: '#FFF' },
    testimonialsSection: { marginBottom: 35 },
    sectionTitleSmall: { fontSize: 14, fontWeight: '700', color: '#8E8E93', marginBottom: 12, textTransform: 'uppercase', letterSpacing: 1 },
    testimonialCard: { width: CARD_WIDTH, backgroundColor: 'rgba(255,255,255,0.05)', padding: 25, borderRadius: 20, marginRight: CARD_MARGIN },
    starsRow: { flexDirection: 'row', gap: 4, marginBottom: 8 },
    testimonialText: { color: '#FFF', fontSize: 15, fontStyle: 'italic', lineHeight: 24, marginBottom: 10, fontFamily: tokens.typography.families.serif },
    testimonialName: { color: '#FFD60A', fontWeight: '800', fontSize: 12, fontFamily: tokens.typography.families.sans },
    sheetContainer: { position: 'absolute', bottom: 0, left: 0, right: 0, backgroundColor: '#1C1C1E', borderTopLeftRadius: 32, borderTopRightRadius: 32, shadowColor: '#000', shadowOffset: { width: 0, height: -10 }, shadowOpacity: 0.5, shadowRadius: 20, elevation: 20 },
    sheetContent: { padding: 30, paddingBottom: Platform.OS === 'ios' ? 60 : 40 },
    sheetHandle: { width: 40, height: 4, backgroundColor: 'rgba(255,255,255,0.1)', borderRadius: 2, alignSelf: 'center', marginBottom: 20 },
    sheetTitle: { fontSize: 24, fontWeight: '800', color: '#FFF', textAlign: 'center' },
    sheetSubtitle: { fontSize: 14, color: '#8E8E93', textAlign: 'center', marginTop: 6, marginBottom: 25 },
    planCard: { flexDirection: 'row', alignItems: 'center', padding: 18, backgroundColor: 'rgba(255,255,255,0.05)', borderRadius: 20, marginBottom: 12, borderWidth: 1, borderColor: 'transparent' },
    planCardActive: { flexDirection: 'row', alignItems: 'center', padding: 18, backgroundColor: 'rgba(255,214,10,0.1)', borderRadius: 20, marginBottom: 12, borderWidth: 1, borderColor: '#FFD60A' },
    planInfo: { flex: 1 },
    planName: { fontSize: 15, fontWeight: '700', color: '#FFF' },
    planPrice: { fontSize: 20, fontWeight: '900', color: '#FFF', marginTop: 2 },
    planBilling: { fontSize: 11, color: '#8E8E93', marginTop: 2 },
    planRadio: { width: 22, height: 22, borderRadius: 11, borderWidth: 2, borderColor: 'rgba(255,255,255,0.2)' },
    purchaseRadioActive: { width: 22, height: 22, borderRadius: 11, backgroundColor: '#FFD60A', borderWidth: 4, borderColor: 'rgba(255,214,10,0.3)' },
    buyBtn: { height: 60, borderRadius: 20, overflow: 'hidden', marginTop: 10 },
    footerNote: { textAlign: 'center', color: '#636366', fontSize: 11, marginTop: 15 },
    moreToCome: { textAlign: 'center', color: '#8E8E93', fontSize: 12, marginTop: 10, fontStyle: 'italic' },
    paginationDots: { flexDirection: 'row', justifyContent: 'center', gap: 6, marginTop: 15 },
    dot: { width: 6, height: 6, borderRadius: 3, backgroundColor: 'rgba(255,255,255,0.2)' },
    dotActive: { backgroundColor: '#FFD60A', width: 12 },
    promoBadge: { backgroundColor: '#FFD60A', paddingHorizontal: 6, paddingVertical: 2, borderRadius: 4 },
    promoBadgeText: { color: '#000', fontSize: 10, fontWeight: '800' },
    discountOverlay: { ...StyleSheet.absoluteFillObject, zIndex: 1000, justifyContent: 'center', alignItems: 'center', padding: 20 },
    discountCard: { width: '100%', backgroundColor: '#1C1C1E', borderRadius: 32, padding: 30, alignItems: 'center', borderWidth: 1, borderColor: 'rgba(255,214,10,0.3)' },
    discountEmoji: { width: 80, height: 80, borderRadius: 40, backgroundColor: 'rgba(255,214,10,0.1)', alignItems: 'center', justifyContent: 'center', marginBottom: 20 },
    discountTitle: { fontSize: 24, fontWeight: '800', color: '#FFF', textAlign: 'center', marginBottom: 10 },
    discountText: { fontSize: 14, color: '#8E8E93', textAlign: 'center', marginBottom: 20 },
    discountPrice: { fontSize: 48, fontWeight: '900', color: '#FFD60A', marginBottom: 5 },
    discountSubtext: { fontSize: 12, color: '#FFF', opacity: 0.6, marginBottom: 30 },
    discountButton: { width: '100%', height: 60, borderRadius: 20, overflow: 'hidden', marginBottom: 20 },
    discountSkip: { color: '#8E8E93', fontSize: 13, textDecorationLine: 'underline' }
});
