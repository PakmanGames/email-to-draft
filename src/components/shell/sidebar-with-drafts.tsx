import { connection } from "next/server";
import { draftTitle } from "@/components/quotes/format";
import { listQuotes } from "@/lib/quotes";
import { AppSidebar } from "./app-sidebar";

/** How many saved drafts the sidebar lists by name. The rest are one click away in Drafts. */
const RECENT_DRAFTS = 8;

/**
 * The sidebar with the saved drafts filled in. Read per request and never at build time,
 * since the database isn't reachable then. A failed read leaves navigation working, so
 * the paste page stays usable when the database isn't.
 */
export async function SidebarWithDrafts() {
  await connection();
  let drafts;
  try {
    drafts = await listQuotes();
  } catch (error) {
    console.error("Couldn't load drafts for the sidebar", error);
    return <AppSidebar recent={[]} draftCount={null} failed />;
  }
  const recent = drafts.slice(0, RECENT_DRAFTS).map((draft) => ({
    id: draft.id,
    title: draftTitle(draft),
    createdAt: draft.createdAt.toISOString(),
    totalCents: draft.totalCents,
  }));
  return <AppSidebar recent={recent} draftCount={drafts.length} />;
}
