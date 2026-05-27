import type { Metadata } from "next";
import { WorkspaceClientProvider } from "./WorkspaceClientProvider";

export const metadata: Metadata = {
  robots: {
    index: false,
    follow: false
  }
};

export default function WorkspaceLayout({ children }: { children: React.ReactNode }) {
  return <WorkspaceClientProvider>{children}</WorkspaceClientProvider>;
}
