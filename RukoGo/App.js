import { useState } from 'react';
import { View, TouchableOpacity, Text, StyleSheet } from 'react-native';
import DriverApp from './DriverApp';
import PassengerApp from './PassengerApp';

export default function App() {
  const [mode, setMode] = useState(null);

  if (mode === 'driver') return <DriverApp />;
  if (mode === 'passenger') return <PassengerApp />;

  return (
    <View style={styles.container}>
      <TouchableOpacity style={styles.button} onPress={() => setMode('driver')}>
        <Text style={styles.buttonText}>🚗 Driver</Text>
      </TouchableOpacity>
      <TouchableOpacity style={styles.button} onPress={() => setMode('passenger')}>
        <Text style={styles.buttonText}>🧑 Passenger</Text>
      </TouchableOpacity>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, justifyContent: 'center', padding: 20, backgroundColor: '#fff' },
  button: { backgroundColor: '#3b82f6', padding: 20, marginBottom: 20, borderRadius: 8 },
  buttonText: { color: 'white', fontSize: 18, textAlign: 'center', fontWeight: 'bold' },
});