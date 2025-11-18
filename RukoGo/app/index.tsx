import { useState } from 'react';
import { View, TouchableOpacity, Text, StyleSheet } from 'react-native';
import DriverApp from '../DriverApp.simple';
import PassengerApp from '../PassengerApp.simple';

export default function Page() {
  const [mode, setMode] = useState(null);

  if (mode === 'driver') return <DriverApp />;
  if (mode === 'passenger') return <PassengerApp />;

  return (
    <View style={styles.container}>
      <View style={styles.main}>
        <Text style={styles.title}>🚕 RukoGo Taxi</Text>
        <Text style={styles.subtitle}>Choose your mode</Text>
        
        <TouchableOpacity 
          style={styles.button} 
          onPress={() => setMode('driver')}
        >
          <Text style={styles.buttonText}>🚗 I'm a Driver</Text>
        </TouchableOpacity>
        
        <TouchableOpacity 
          style={styles.button} 
          onPress={() => setMode('passenger')}
        >
          <Text style={styles.buttonText}>🧑 I'm a Passenger</Text>
        </TouchableOpacity>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#f5f5f5',
  },
  main: {
    flex: 1,
    justifyContent: "center",
    alignItems: "center",
    padding: 24,
  },
  title: {
    fontSize: 48,
    fontWeight: "bold",
    marginBottom: 10,
    color: '#333',
  },
  subtitle: {
    fontSize: 24,
    color: "#666",
    marginBottom: 40,
  },
  button: {
    backgroundColor: '#007AFF',
    paddingVertical: 20,
    paddingHorizontal: 40,
    borderRadius: 12,
    marginVertical: 10,
    width: '80%',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.25,
    shadowRadius: 4,
    elevation: 5,
  },
  buttonText: {
    color: 'white',
    fontSize: 20,
    fontWeight: 'bold',
    textAlign: 'center',
  },
});
