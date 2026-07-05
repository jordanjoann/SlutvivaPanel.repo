"use client";

import { useParams } from "next/navigation";
import { ConsoleView } from "@/components/vintage-story/console-view";

export default function GtaConsolePage() {
  const { id } = useParams<{ id: string }>();

  return <ConsoleView id={id} />;
}
