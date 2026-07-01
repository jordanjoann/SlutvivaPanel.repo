"use client";

import { useParams } from "next/navigation";
import { TerminalIcon } from "lucide-react";
import { ConsoleView } from "@/components/vintage-story/console-view";
import { QuickCommands } from "@/components/vintage-story/quick-commands";
import { SectionCard } from "@/components/panel/section-card";

export default function ConsolePage() {
  const { id } = useParams<{ id: string }>();

  return (
    <div className="flex flex-col gap-4">
      <SectionCard
        title="Quick admin commands"
        description="Run common server actions without typing"
        icon={TerminalIcon}
      >
        <QuickCommands id={id} />
      </SectionCard>
      <ConsoleView id={id} />
    </div>
  );
}
