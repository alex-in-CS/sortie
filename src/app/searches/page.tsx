import { connection } from "next/server";
import { Suspense } from "react";
import { SearchesEditor } from "@/components/searches-editor";
import { Loading, PageHeader } from "@/components/ui";
import { searchesStore } from "@/lib/store";

export default function SearchesPage() {
  return (
    <>
      <PageHeader title="Searches">
        What to hunt for. Your skills decide what fits; titles narrow it. Start in review mode and switch a
        search to auto-apply once you trust its picks.
      </PageHeader>
      <Suspense fallback={<Loading />}>
        <SearchesData />
      </Suspense>
    </>
  );
}

async function SearchesData() {
  await connection();
  const { value, updatedAt } = searchesStore.get();
  return <SearchesEditor initial={value} updatedAt={updatedAt} />;
}
