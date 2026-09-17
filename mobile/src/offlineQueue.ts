// See useReceiptCapture.ts for why this imports the /legacy subpath.
import * as FileSystem from "expo-file-system/legacy";
import { ApiError } from "./api/client";
import { createExpense, type CreateExpenseInput } from "./api/expenses";
import { createIncomeInvoice, type CreateIncomeInvoiceInput } from "./api/income";

type PendingExpense = {
  localId: string;
  kind: "expense";
  queuedAt: string;
  input: Omit<CreateExpenseInput, "receiptUri" | "receiptName" | "receiptType">;
  localFilePath: string;
  fileName: string;
  fileType: string;
};

type PendingIncome = {
  localId: string;
  kind: "income";
  queuedAt: string;
  input: Omit<CreateIncomeInvoiceInput, "fileUri" | "fileName" | "fileType">;
  localFilePath: string | null;
  fileName: string | null;
  fileType: string | null;
};

export type PendingItem = PendingExpense | PendingIncome;

const QUEUE_PATH = `${FileSystem.documentDirectory}pending-queue.json`;
const UPLOADS_DIR = `${FileSystem.documentDirectory}pending-uploads/`;

function generateLocalId(): string {
  return `${Date.now().toString(36)}${Math.random().toString(36).slice(2)}`;
}

async function readQueue(): Promise<PendingItem[]> {
  const info = await FileSystem.getInfoAsync(QUEUE_PATH);
  if (!info.exists) {
    return [];
  }
  try {
    const raw = await FileSystem.readAsStringAsync(QUEUE_PATH);
    return JSON.parse(raw) as PendingItem[];
  } catch {
    return [];
  }
}

async function writeQueue(items: PendingItem[]): Promise<void> {
  await FileSystem.writeAsStringAsync(QUEUE_PATH, JSON.stringify(items));
}

export async function listPending(): Promise<PendingItem[]> {
  return readQueue();
}

// Copies the receipt/invoice file out of the OS-managed cache directory
// (where expo-image-picker writes it) into the persistent documents
// directory before queueing — the cache can be purged by the OS at any
// time, independent of app state, which would otherwise silently break a
// later retry.
async function persistFile(sourceUri: string, localId: string, fileName: string): Promise<string> {
  await FileSystem.makeDirectoryAsync(UPLOADS_DIR, { intermediates: true }).catch(() => {});
  const destination = `${UPLOADS_DIR}${localId}-${fileName}`;
  await FileSystem.copyAsync({ from: sourceUri, to: destination });
  return destination;
}

async function deletePersistedFile(path: string | null): Promise<void> {
  if (!path) return;
  await FileSystem.deleteAsync(path, { idempotent: true }).catch(() => {});
}

export async function enqueueExpense(
  input: Omit<CreateExpenseInput, "receiptUri" | "receiptName" | "receiptType">,
  receiptUri: string,
  receiptName: string,
  receiptType: string
): Promise<void> {
  const localId = generateLocalId();
  const localFilePath = await persistFile(receiptUri, localId, receiptName);
  const items = await readQueue();
  items.push({ localId, kind: "expense", queuedAt: new Date().toISOString(), input, localFilePath, fileName: receiptName, fileType: receiptType });
  await writeQueue(items);
}

export async function enqueueIncome(
  input: Omit<CreateIncomeInvoiceInput, "fileUri" | "fileName" | "fileType">,
  fileUri: string | undefined,
  fileName: string | undefined,
  fileType: string | undefined
): Promise<void> {
  const localId = generateLocalId();
  const localFilePath = fileUri ? await persistFile(fileUri, localId, fileName ?? "invoice") : null;
  const items = await readQueue();
  items.push({
    localId,
    kind: "income",
    queuedAt: new Date().toISOString(),
    input,
    localFilePath,
    fileName: fileUri ? fileName ?? "invoice" : null,
    fileType: fileUri ? fileType ?? "application/octet-stream" : null
  });
  await writeQueue(items);
}

export async function removePending(localId: string): Promise<void> {
  const items = await readQueue();
  const target = items.find((item) => item.localId === localId);
  await deletePersistedFile(target?.localFilePath ?? null);
  await writeQueue(items.filter((item) => item.localId !== localId));
}

let isSyncing = false;

// Retries queued items in order. Stops at the first item that still fails
// with a non-ApiError (i.e. still offline) rather than hammering the rest —
// an ApiError on a queued item (most likely a 401 from an expired token
// after being offline a while) is also left queued: the app-wide
// unauthorizedListener already handles the forced logout, and since this
// function only ever removes an item on success, the item survives that
// and retries automatically once the user signs back in.
export async function syncQueue(onItemSynced?: () => void): Promise<void> {
  if (isSyncing) return;
  isSyncing = true;
  try {
    const items = await readQueue();
    for (const item of items) {
      try {
        if (item.kind === "expense") {
          await createExpense({ ...item.input, receiptUri: item.localFilePath, receiptName: item.fileName, receiptType: item.fileType });
        } else {
          await createIncomeInvoice({
            ...item.input,
            fileUri: item.localFilePath ?? undefined,
            fileName: item.fileName ?? undefined,
            fileType: item.fileType ?? undefined
          });
        }
        await removePending(item.localId);
        onItemSynced?.();
      } catch (error) {
        if (!(error instanceof ApiError)) {
          break; // still offline — stop, don't hammer the remaining items
        }
        // real server error (e.g. expired-token 401) — leave queued, keep trying the rest
      }
    }
  } finally {
    isSyncing = false;
  }
}
