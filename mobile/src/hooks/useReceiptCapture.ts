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

  // Same proven file:// path as pickFromFiles above, just allowing more
  // than one selection — used for bulk-importing legacy receipts.
  async function pickMultipleFromFiles(): Promise<PickedFile[]> {
    const permission = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (!permission.granted) {
      Alert.alert(
        "Photo access needed",
        "Evolution needs photo library access to import receipt photos. You can allow this in your device settings."
      );
      return [];
    }

    const selected = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ["images"],
      quality: 0.7,
      allowsMultipleSelection: true
    });
    if (selected.canceled || selected.assets.length === 0) {
      return [];
    }

    return selected.assets.map((asset) => ({
      uri: asset.uri,
      name: asset.fileName ?? `receipt-${Date.now()}-${Math.random().toString(36).slice(2)}.jpg`,
      mimeType: asset.mimeType ?? "image/jpeg"
    }));
  }

  // PDF invoices can't go through expo-image-picker (images only), so this
  // has to use expo-document-picker after all — the picker whose content://
  // results nothing in this app could read (see pickFromFiles above). One
  // hypothesis was never actually tested, though: that copyToCacheDirectory
  // resolves *before* its internal copy has finished writing to disk, and
  // every earlier attempt read a still-incomplete file rather than a
  // genuinely broken one. This waits for the copy to actually land — a real
  // size on disk, not just a promise resolving — before treating it as usable.
  async function waitForFileReady(uri: string, timeoutMs = 4000, pollMs = 100): Promise<boolean> {
    const deadline = Date.now() + timeoutMs;
    while (Date.now() < deadline) {
      try {
        const info = await FileSystem.getInfoAsync(uri);
        if (info.exists && !info.isDirectory && info.size > 0) {
          return true;
        }
      } catch {
        // Not ready yet — fall through and retry.
      }
      await new Promise<void>((resolve) => setTimeout(() => resolve(), pollMs));
    }
    return false;
  }

  // Scoped to PDF and CSV, deliberately — images already go through
  // pickFromFiles' proven expo-image-picker path above; keeping this one
  // narrow means if the content:// fix below still doesn't hold up on a
  // real build, only these two file types break, not the already-reliable
  // photo picker too.
  const CSV_LOOKALIKE_MIME_TYPES = new Set(["text/csv", "text/comma-separated-values", "application/vnd.ms-excel", "text/plain"]);

  // kind restricts the OS picker itself to the relevant type (a "PDF"
  // choice shouldn't even offer a CSV to select) — a caller that already
  // knows which one it wants gets a tighter picker, not just a filtered
  // result checked after the fact.
  async function pickDocument(kind: "pdf" | "csv"): Promise<PickedFile | null> {
    const selected = await DocumentPicker.getDocumentAsync({
      copyToCacheDirectory: true,
      multiple: false,
      type: kind === "pdf" ? "application/pdf" : ["application/pdf", ...CSV_LOOKALIKE_MIME_TYPES]
    });

    if (selected.canceled || selected.assets.length === 0) {
      return null;
    }

    const asset = selected.assets[0];
    const ready = await waitForFileReady(asset.uri);
    if (!ready) {
      Alert.alert(
        "Could not access file",
        "The selected file could not be read. Please try picking it again, or use a photo instead."
      );
      return null;
    }

    // Real-world CSV mimetype reporting is inconsistent across OSes/apps
    // (and sometimes absent entirely), so the file extension is the more
    // reliable signal — normalized here to the one canonical value the
    // backend actually recognizes, rather than teaching it every lookalike.
    const name = asset.name ?? "file";
    const isCsvByName = name.toLowerCase().endsWith(".csv");
    const isCsvByMimeType = !!asset.mimeType && CSV_LOOKALIKE_MIME_TYPES.has(asset.mimeType);
    const mimeType =
      asset.mimeType === "application/pdf" ? "application/pdf" : isCsvByName || isCsvByMimeType ? "text/csv" : (asset.mimeType ?? "application/octet-stream");

    return { uri: asset.uri, name, mimeType };
  }

  // Used to read a picked CSV's text for client-side parsing (deterministic,
  // structured-data parsing — no OCR/AI needed, unlike photo/PDF invoices).
  async function readLocalTextFile(uri: string): Promise<string> {
    return FileSystem.readAsStringAsync(uri, { encoding: FileSystem.EncodingType.UTF8 });
  }

  // Downloads to a local file and returns its uri, without doing anything
  // with it — the caller decides whether to view it in-app or share it.
  async function downloadToLocalUri(url: string, filename: string): Promise<string | null> {
    const cacheDir = FileSystem.cacheDirectory ?? FileSystem.documentDirectory;
    if (!cacheDir) {
      Alert.alert("File error", "No writable directory is available on this device.");
      return null;
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
        return null;
      }

      return result.uri;
    } catch (error) {
      Alert.alert("Download error", String(error));
      return null;
    }
  }

  async function shareLocalUri(uri: string): Promise<void> {
    if (await Sharing.isAvailableAsync()) {
      await Sharing.shareAsync(uri, { dialogTitle: "Share file" });
    } else {
      Alert.alert("Sharing unavailable", `File saved at ${uri}`);
    }
  }

  return { captureFromCamera, pickFromFiles, pickMultipleFromFiles, pickDocument, readLocalTextFile, downloadToLocalUri, shareLocalUri };
}
