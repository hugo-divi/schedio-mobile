import { Tabs } from 'expo-router';
import { Home, Plus, Map as MapIcon, User, BookOpen } from 'lucide-react-native';
import { View, StyleSheet, TouchableOpacity } from 'react-native';
import React, { useState } from 'react';
import { tokens } from '../../theme/tokens';
import QuickActionsModal from '../../components/QuickActionsModal';
import EventModal from '../../components/EventModal';
import UploadModal from '../../components/UploadModal';
import useUserStore from '../../store/userStore';
import { auth } from '../../services/firebase';

export default function DashboardLayout() {
  // Selector form on purpose: this component is the parent of every tab, so a
  // whole-store subscription re-rendered all of them (and the three modals
  // below) on any unrelated write.
  const subjects = useUserStore((state) => state.subjects);
  const [quickActionsVisible, setQuickActionsVisible] = useState(false);
  const [eventModalVisible, setEventModalVisible] = useState(false);
  const [uploadModalVisible, setUploadModalVisible] = useState(false);

  const screenOptions = React.useMemo(
    () => ({
      headerShown: false,
      // Stops the tabs that aren't on screen from re-rendering. Without it
      // every store write redrew Perfil and Plan in the background.
      freezeOnBlur: true,
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
    // Drop `id` (always null when creating) so it isn't stored as a field.
    const fields = { ...examData };
    delete fields.id;
    await createExam({
      ...fields,
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
            // The one tab that must keep running while it isn't on screen: it
            // owns the session timer.
            freezeOnBlur: false,
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
