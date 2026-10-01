import { StatusBar } from 'expo-status-bar';
import { StyleSheet, Text, View } from 'react-native';

export default function App() {
  return (
    <View style={styles.container}>
      <Text style={styles.title}>Afterten Orders</Text>
      <Text style={styles.sub}>
        Outlet staff sign in with email + password only (accounts created in the portal). No Google
        sign-in on this app.
      </Text>
      <StatusBar style="auto" />
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#fff',
    alignItems: 'center',
    justifyContent: 'center',
    padding: 24,
  },
  title: { fontSize: 22, fontWeight: '600', marginBottom: 12 },
  sub: { textAlign: 'center', color: '#444' },
});
