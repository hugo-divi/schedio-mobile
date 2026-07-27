import { Tabs } from 'expo-router';
import { Home, Calendar, Plus, Map as MapIcon, User, BookOpen } from 'lucide-react-native';
import { View, StyleSheet, TouchableOpacity } from 'react-native';
import React, { useState } from 'react';
import { tokens } from '../../theme/tokens';
import { LinearGradient } from 'expo-linear-gradient';
import useThemeStore from '../../store/themeStore';
import QuickActionsModal from '../../components/QuickActionsModal';
import EventModal from '../../components/EventModal';
import UploadModal from '../../components/UploadModal';
import useUserStore from '../../store/userStore';
import { auth } from '../../services/firebase';

export default function DashboardLayout() {
  const { isDarkMode } = useThemeStore();
  const { subjects } = useUserStore();
  const [quickActionsVisible, setQuickActionsVisible] = useState(false);
  const [eventModalVisible, setEventModalVisible] = useState(false);
  const [uploadModalVisible, setUploadModalVisible] = useState(false);
  const [completedExams, setCompletedExams] = useState([]);
  const [examRefreshKey, setExamRefreshKey] = useState(0);

  // Fetch exams for the "grade exam" quick action
  React.useEffect(() => {
    const load = async () => {
      const user = auth.currentUser;
      if (!user) return;
      try {
        const { getCompletedExams, getPendingExams } = await import('../../services/exams');
        const [completedRes, pendingRes] = await Promise.all([
          getCompletedExams(user.uid, 20),
          getPendingExams(user.uid),
        ]);

        // Combine and deduplicate just in case
        const combined = [...pendingRes, ...completedRes];
        const unique = Array.from(new global.Map(combined.map((e) => [e.id, e])).values());

        setCompletedExams(unique);
      } catch (e) {
        console.warn('Could not load exams for quick action', e);
      }
    };
    load();
  }, [examRefreshKey]);

  const screenOptions = React.useMemo(
    () => ({
      headerShown: false,
      sceneContainerStyle: {
        backgroundColor: tokens.colors.background,
      },
      tabBarStyle: {
        height: 85,
        paddingBottom: 25,
        backgroundColor: tokens.colors.surfaceCard,
        elevation: 0,
        // Hairline separator instead of a shadow — the redesign is flat.
        borderTopWidth: 1,
        borderTopColor: tokens.colors.borderDefault,
        shadowColor: 'transparent',
        shadowOpacity: 0,
      },
      tabBarActiveTintColor: tokens.colors.accent,
      tabBarInactiveTintColor: tokens.colors.textDisabled,
      tabBarLabelStyle: {
        fontFamily: tokens.typography.families.inter.medium,
        fontSize: 11,
        marginTop: 4,
      },
      tabBarItemStyle: {
        justifyContent: 'center',
        alignItems: 'center',
      },
    }),
    []
  );

  const handleSaveExam = async (examData) => {
    const { createExam } = await import('../../services/exams');
    const user = auth.currentUser;
    if (!user) return;
    await createExam({
      ...examData,
      userId: user.uid,
      completed: false,
    });
    // Signal global refresh
    useUserStore.getState().triggerExamRefresh();
  };

  return (
    <>
      <Tabs screenOptions={screenOptions}>
        <Tabs.Screen
          name="index"
          options={{
            title: 'Inicio',
            tabBarIcon: ({ color, focused }) => (
              <Home size={22} color={color} strokeWidth={focused ? 2.5 : 2} />
            ),
          }}
        />
        <Tabs.Screen
          name="study"
          options={{
            title: 'Estudiar',
            tabBarIcon: ({ color, focused }) => (
              <BookOpen size={22} color={color} strokeWidth={focused ? 2.5 : 2} />
            ),
          }}
        />
        {/* Center FAB Button */}
        <Tabs.Screen
          name="session_redirect"
          options={{
            title: '',
            tabBarButton: (props) => (
              <TouchableOpacity
                {...props}
                style={{
                  top: -20, // Use top instead of marginTop for better absolute-like behavior in flex
                  justifyContent: 'center',
                  alignItems: 'center',
                  // Do not spread style from props blindly if it conflicts, but usually props.style is null for custom button
                }}
              >
                <View style={styles.fabButton}>
                  <Plus size={28} color="#FFFFFF" strokeWidth={3} />
                </View>
              </TouchableOpacity>
            ),
            tabBarIcon: () => null, // Hide default icon since we use tabBarButton logic or custom icon
          }}
          listeners={({ navigation }) => ({
            tabPress: (e) => {
              e.preventDefault();
              setQuickActionsVisible(true);
            },
          })}
        />
        <Tabs.Screen
          name="plans"
          options={{
            title: 'Plan',
            tabBarIcon: ({ color, focused }) => (
              <MapIcon size={22} color={color} strokeWidth={focused ? 2.5 : 2} />
            ),
          }}
        />
        <Tabs.Screen
          name="profile"
          options={{
            title: 'Perfil',
            tabBarIcon: ({ color, focused }) => (
              <User size={22} color={color} strokeWidth={focused ? 2.5 : 2} />
            ),
          }}
        />
        {/* Hidden screens */}
        <Tabs.Screen name="ranks" options={{ href: null }} />
        <Tabs.Screen name="history" options={{ href: null }} />
        <Tabs.Screen name="recommendations" options={{ href: null }} />
      </Tabs>

      <QuickActionsModal
        visible={quickActionsVisible}
        onClose={() => setQuickActionsVisible(false)}
        onAddExam={() => setEventModalVisible(true)}
        onAddFile={() => setUploadModalVisible(true)}
        completedExams={completedExams}
        onRefresh={() => setExamRefreshKey((k) => k + 1)}
      />

      <EventModal
        visible={eventModalVisible}
        onClose={() => setEventModalVisible(false)}
        selectedDate={new Date()}
        onSave={handleSaveExam}
        subjects={subjects}
      />

      <UploadModal
        visible={uploadModalVisible}
        onClose={() => setUploadModalVisible(false)}
        onUploadSuccess={(fileData) => {
          console.log('File uploaded via quick action:', fileData);
        }}
      />
    </>
  );
}

const styles = StyleSheet.create({
  fabButton: {
    width: 52,
    height: 52,
    borderRadius: 26,
    backgroundColor: tokens.colors.accent,
    alignItems: 'center',
    justifyContent: 'center',
    elevation: 6,
  },
});
