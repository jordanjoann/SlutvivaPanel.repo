import { canAccessInstanceGame } from "@/lib/access-policy";
import { getSessionAccount } from "@/lib/server/auth";
import { forbidden, loadInstance, unauthorized } from "@/lib/server/http";

export async function requireInstanceGameAccess(id: string) {
  const session = await getSessionAccount();
  if (!session) return { response: unauthorized() };
  const res = await loadInstance(id);
  if ("response" in res) return res;
  if (!canAccessInstanceGame(session.account.role, res.instance.game)) {
    return { response: forbidden() };
  }
  return { instance: res.instance };
}
