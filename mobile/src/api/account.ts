import { apiJson } from "./client";

export async function requestAccountDeletion(message?: string): Promise<{ success: true; message: string }> {
  return apiJson("/auth/account-deletion-request", {
    method: "POST",
    body: JSON.stringify(message ? { message } : {})
  });
}
