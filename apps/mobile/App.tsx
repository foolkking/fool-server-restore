import { SafeAreaView, ScrollView, StyleSheet, Text, View } from "react-native";

const stages = ["Preflight", "Runtime", "Packages", "Config", "Verify"];

export default function App() {
  return (
    <SafeAreaView style={styles.safe}>
      <ScrollView contentContainerStyle={styles.container}>
        <Text style={styles.kicker}>Fool Server Restore</Text>
        <Text style={styles.title}>Remote approval console</Text>
        <View style={styles.card}>
          <Text style={styles.label}>Current status</Text>
          <Text style={styles.value}>No restore job running</Text>
        </View>
        <View style={styles.card}>
          <Text style={styles.label}>Restore stages</Text>
          {stages.map((stage) => (
            <Text key={stage} style={styles.stage}>{stage}</Text>
          ))}
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: {
    flex: 1,
    backgroundColor: "#f5f7f8"
  },
  container: {
    gap: 16,
    padding: 20
  },
  kicker: {
    color: "#176b5d",
    fontSize: 13,
    fontWeight: "700",
    textTransform: "uppercase"
  },
  title: {
    color: "#182026",
    fontSize: 30,
    fontWeight: "800"
  },
  card: {
    backgroundColor: "white",
    borderColor: "#dde5e8",
    borderRadius: 8,
    borderWidth: 1,
    padding: 18
  },
  label: {
    color: "#65757d",
    fontSize: 13,
    marginBottom: 6
  },
  value: {
    color: "#182026",
    fontSize: 18,
    fontWeight: "700"
  },
  stage: {
    color: "#182026",
    fontSize: 16,
    paddingVertical: 5
  }
});
