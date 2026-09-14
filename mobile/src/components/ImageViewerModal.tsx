import React from "react";
import { ActivityIndicator, Image, Modal, Pressable, StyleSheet, Text, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { colors, spacing, typography } from "../theme/tokens";

export function ImageViewerModal({
  visible,
  uri,
  isLoading,
  onClose,
  onShare
}: {
  visible: boolean;
  uri: string | null;
  isLoading: boolean;
  onClose: () => void;
  onShare?: () => void;
}): React.JSX.Element {
  return (
    <Modal visible={visible} animationType="slide" onRequestClose={onClose}>
      <SafeAreaView style={styles.container}>
        <View style={styles.header}>
          <Pressable onPress={onClose} hitSlop={12}>
            <Text style={styles.headerAction}>Close</Text>
          </Pressable>
          {onShare && uri && (
            <Pressable onPress={onShare} hitSlop={12}>
              <Text style={styles.headerAction}>Share</Text>
            </Pressable>
          )}
        </View>
        <View style={styles.body}>
          {isLoading && <ActivityIndicator color={colors.accentText} size="large" />}
          {!isLoading && uri && <Image source={{ uri }} style={styles.image} resizeMode="contain" />}
          {!isLoading && !uri && <Text style={styles.errorText}>Could not load the file.</Text>}
        </View>
      </SafeAreaView>
    </Modal>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: "#000" },
  header: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    paddingHorizontal: spacing.xl,
    paddingVertical: spacing.md
  },
  headerAction: { color: colors.accentText, fontSize: typography.body, fontWeight: "700" },
  body: { flex: 1, alignItems: "center", justifyContent: "center" },
  image: { width: "100%", height: "100%" },
  errorText: { color: colors.accentText, fontSize: typography.body }
});
