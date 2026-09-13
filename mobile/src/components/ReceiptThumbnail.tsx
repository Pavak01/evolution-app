import React from "react";
import { Image, StyleSheet, Text, View } from "react-native";
import { colors, radius, typography } from "../theme/tokens";

// Receipts are now per-expense (not per-week, as in Qbit), so the capture
// screen shows an inline preview of what's about to be attached.
export function ReceiptThumbnail({
  uri,
  isPdf,
  filename
}: {
  uri: string;
  isPdf: boolean;
  filename: string;
}): React.JSX.Element {
  return (
    <View style={styles.wrap}>
      {isPdf ? (
        <View style={styles.pdfBadge}>
          <Text style={styles.pdfBadgeText}>PDF</Text>
        </View>
      ) : (
        <Image source={{ uri }} style={styles.image} resizeMode="cover" />
      )}
      <Text style={styles.filename} numberOfLines={1}>
        {filename}
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    backgroundColor: colors.accentSoftAlt,
    borderRadius: radius.md,
    padding: 8
  },
  image: {
    width: 48,
    height: 48,
    borderRadius: radius.sm,
    backgroundColor: colors.inputBg
  },
  pdfBadge: {
    width: 48,
    height: 48,
    borderRadius: radius.sm,
    backgroundColor: colors.accent,
    alignItems: "center",
    justifyContent: "center"
  },
  pdfBadgeText: {
    color: colors.accentText,
    fontWeight: "700",
    fontSize: typography.small
  },
  filename: {
    flex: 1,
    color: colors.textSecondary,
    fontSize: typography.body
  }
});
