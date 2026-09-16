import { Link, Stack } from 'expo-router';
import { StyleSheet, Text, View } from 'react-native';
import { colors } from '@/src/ui/theme';

export default function NotFoundScreen() {
  return (
    <>
      <Stack.Screen options={{ title: 'Not found' }} />
      <View style={styles.container}>
        <Text style={styles.title}>This screen doesn’t exist.</Text>
        <Link href="/" style={styles.link}>
          <Text style={styles.linkText}>Go home</Text>
        </Link>
      </View>
    </>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.bg,
    alignItems: 'center',
    justifyContent: 'center',
    padding: 20,
  },
  title: { fontSize: 20, fontWeight: '800', color: colors.cream },
  link: { marginTop: 16, paddingVertical: 16 },
  linkText: { fontSize: 18, color: colors.lime, fontWeight: '700' },
});
