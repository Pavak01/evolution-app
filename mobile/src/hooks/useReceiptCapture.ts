// SDK 57 rewrote expo-file-system around a File/Directory class API; the
// `/legacy` subpath is Expo's own officially-supported compatibility shim
// preserving the exact function-based API this file already uses.
import * as FileSystem from "expo-file-system/legacy";
import * as ImagePicker from "expo-image-picker";
import * as Sharing from "expo-sharing";
import { Alert } from "react-native";
import { getToken } from "../api/client";

export type PickedFile = { uri: string; name: string; mimeType: string };

// Adapted from Qbit's App.tsx capture/pick/open functions
// (captureAndUploadReceipt / pickAndUploadReceipt / openReceipt), extracted
// into a shared hook since Evolution's screens are separate files rather
// than one monolith.
export function useReceiptCapture() {
  async function captureFromCamera(): Promise<PickedFile | null> {
    const permission = await ImagePicker.requestCameraPermissionsAsync();
    if (!permission.granted) {
      Alert.alert(
        "Camera access needed",
        "Evolution needs camera access to photograph receipts. You can allow this in your device settings."
      );
      return null;
    }

    const captured = await ImagePicker.launchCameraAsync({ quality: 0.7, allowsEditing: false });
    if (captured.canceled || captured.assets.length === 0) {
      return null;
    }

    const asset = captured.assets[0];
    return {
      uri: asset.uri,
      name: asset.fileName ?? `receipt-${Date.now()}.jpg`,
      mimeType: asset.mimeType ?? "image/jpeg"
    };
  }

  // Picking an existing file went through expo-document-picker originally,
  // but every content:// URI it hands back turned out to be unreadable by
  // every API this app tried against it — copyToCacheDirectory's internal
  // copy silently failed, uploadAsync rejects content:// outright ("tried
  // to treat the URI's opaque path segment as a literal directory"), and
  // expo-file-system's readAsStringAsync explicitly refuses the scheme
  // ("Unsupported scheme for location 'content://...'") — a hard
  // restriction in the library itself, not a bug in how it was called.
  // expo-image-picker's library picker is the same module that already
  // makes camera capture work reliably: it returns a real file:// URI,
  // not content://, so it reuses the one path proven to work end to end.
  // Trade-off: this only covers images (screenshots, photo receipts) —
  // PDF selection needs a working content:// reader, which nothing
  // available here provides; that remains open.
  async function pickFromFiles(): Promise<PickedFile | null> {
    const permission = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (!permission.granted) {
      Alert.alert(
        "Photo access needed",
        "Evolution needs photo library access to attach an existing image as a receipt. You can allow this in your device settings."
      );
      return null;
    }

    const selected = await ImagePicker.launchImageLibraryAsync({ mediaTypes: ["images"], quality: 0.7 });
    if (selected.canceled || selected.assets.length === 0) {
      return null;
    }

    const asset = selected.assets[0];
    return {
      uri: asset.uri,
      name: asset.fileName ?? `receipt-${Date.now()}.jpg`,
      mimeType: asset.mimeType ?? "image/jpeg"
    };
  }

  async function openDownload(url: string, filename: string): Promise<void> {
    const cacheDir = FileSystem.cacheDirectory ?? FileSystem.documentDirectory;
    if (!cacheDir) {
      Alert.alert("File error", "No writable directory is available on this device.");
      return;
    }

    const token = await getToken();
    const safeName = filename.replace(/[^a-zA-Z0-9._-]/g, "_");
    const localUri = `${cacheDir}${Date.now()}-${safeName}`;

    try {
      const task = FileSystem.createDownloadResumable(url, localUri, {
        headers: token ? { Authorization: `Bearer ${token}` } : undefined
      });

      const result = await task.downloadAsync();
      if (!result?.uri) {
        Alert.alert("Download failed", "Could not save the file.");
        return;
      }

      if (await Sharing.isAvailableAsync()) {
        await Sharing.shareAsync(result.uri, { dialogTitle: "Open or share file" });
      } else {
        Alert.alert("Downloaded", `File saved at ${result.uri}`);
      }
    } catch (error) {
      Alert.alert("Download error", String(error));
    }
  }

  return { captureFromCamera, pickFromFiles, openDownload };
}
