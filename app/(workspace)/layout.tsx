import { Sidebar } from "@/components/layout/Sidebar";
import { AccessGate } from "@/components/layout/AccessGate";
import { JourneyProgress } from "@/components/layout/JourneyProgress";
import { MvpBanner } from "@/components/layout/MvpBanner";

export default function WorkspaceLayout({ children }: { children: React.ReactNode }) {
  return (
    <main className="mx-auto grid max-w-7xl gap-6 px-4 py-6 sm:px-6 lg:grid-cols-[280px_1fr] lg:px-8 lg:py-8">
      <Sidebar />
      <div className="min-w-0 space-y-6">
        <AccessGate>
          <MvpBanner />
          <JourneyProgress />
          {children}
        </AccessGate>
      </div>
    </main>
  );
}
