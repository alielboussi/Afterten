import { StatusBar } from 'expo-status-bar';
import { StyleSheet, Text, View } from 'react-native';

export default function App() {
  return (
    <View style={styles.container}>
      <Text style={styles.title}>Afterten Orders</Text>
      <Text style={styles.sub}>
        Expo Go shell — flow will be implemented after your spec. Firebase backend only; no Vercel
        API.
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
