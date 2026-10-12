import type { Metadata } from "next";
import { Suspense } from "react";
import { AppSidebarView } from "@/components/shell/app-sidebar";
import { SidebarWithDrafts } from "@/components/shell/sidebar-with-drafts";
import "./globals.css";

export const metadata: Metadata = {
  title: { template: "%s · Email to Draft", default: "Email to Draft" },
  description: "Turn a pasted RFQ email into a draft quote priced from inventory.",
};

/**
 * The app shell (D-020): the sidebar on every page, and each page's own toolbar and
 * content beside it. The window never scrolls as a whole; each page scrolls its content.
 */
export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html lang="en" className="h-full antialiased">
      <body className="h-full overflow-hidden">
        <div className="flex h-dvh">
          <Suspense fallback={<AppSidebarView recent={null} draftCount={null} pathname={null} />}>
            <SidebarWithDrafts />
          </Suspense>
          <div className="flex min-w-0 flex-1 flex-col">{children}</div>
        </div>
      </body>
    </html>
  );
}
