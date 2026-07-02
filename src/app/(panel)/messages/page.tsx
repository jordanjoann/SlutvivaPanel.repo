import { MessagesSquareIcon } from "lucide-react";
import { PageHeader } from "@/components/panel/page-header";
import { SectionCard } from "@/components/panel/section-card";

export default function MessagesPage() {
  return (
    <div className="flex flex-col gap-6">
      <PageHeader title="Messages" description="Panel messages and alerts." icon={MessagesSquareIcon} />
      <SectionCard>
        <p className="py-8 text-center text-sm text-muted-foreground">No messages.</p>
      </SectionCard>
    </div>
  );
}
