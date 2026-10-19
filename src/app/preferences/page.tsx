import { connection } from "next/server";
import { Suspense } from "react";
import { PreferencesForm } from "@/components/preferences-form";
import { Loading, PageHeader } from "@/components/ui";
import { preferencesStore } from "@/lib/store";

export default function PreferencesPage() {
  return (
    <>
      <PageHeader title="Preferences">
        Where you can work, your pay floor, and the limits that hold across every search.
      </PageHeader>
      <Suspense fallback={<Loading />}>
        <PreferencesData />
      </Suspense>
    </>
  );
}

async function PreferencesData() {
  await connection();
  const { value, updatedAt } = preferencesStore.get();
  return <PreferencesForm initial={value} updatedAt={updatedAt} />;
}
