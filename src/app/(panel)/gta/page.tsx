import { redirect } from "next/navigation";
import { GTA_INSTANCE_ID } from "@/lib/gta";
import { ensureGtaInstance } from "@/lib/server/store";

export default async function GtaPage() {
  await ensureGtaInstance();
  redirect(`/gta/${GTA_INSTANCE_ID}`);
}
