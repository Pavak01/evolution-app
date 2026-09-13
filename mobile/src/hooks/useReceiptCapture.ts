import * as DocumentPicker from "expo-document-picker";
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

  async function pickFromFiles(): Promise<PickedFile | null> {
    // copyToCacheDirectory: false — the copy step was the actual bug: it
    // silently failed to produce a readable file (three unrelated native
    // APIs all hit an IOException reading the "copied" result), most likely
    // because the internal copy loses the SAF read grant before it runs.
    // Going straight to the original content:// URI reads it within the
    // same grant that picking it just established.
    const selected = await DocumentPicker.getDocumentAsync({
      copyToCacheDirectory: false,
      multiple: false,
      type: ["image/*", "application/pdf"]
    });

    if (selected.canceled || selected.assets.length === 0) {
      return null;
    }

    const asset = selected.assets[0];
    return { uri: asset.uri, name: asset.name ?? "receipt", mimeType: asset.mimeType ?? "application/octet-stream" };
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
