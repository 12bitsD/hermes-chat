import { StatusBar } from 'expo-status-bar';
import { View, StyleSheet } from 'react-native';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { MainScreen } from './src/screens/MainScreen';
import { initPersistence } from './src/store/persistence';
import { installHermesCli } from './src/lib/hermesApi';

initPersistence();
installHermesCli();

export default function App() {
  return (
    <SafeAreaProvider>
      <View style={styles.root}>
        <MainScreen />
        <StatusBar style="auto" />
      </View>
    </SafeAreaProvider>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1 },
});
