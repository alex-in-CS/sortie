import { connection } from "next/server";
import { Suspense } from "react";
import { PreferencesForm } from "@/components/preferences-form";
import { Loading, PageHeader } from "@/components/ui";
import { getPreferences } from "@/lib/store";

export default function PreferencesPage() {
  return (
    <>
      <PageHeader title="Preferences">
        Which jobs count as a fit and how hard the autopilot may push. Leave target roles empty to let your
        skills decide.
      </PageHeader>
      <Suspense fallback={<Loading />}>
        <PreferencesData />
      </Suspense>
    </>
  );
}

async function PreferencesData() {
  await connection();
  const { value, updatedAt } = getPreferences();
  return <PreferencesForm initial={value} updatedAt={updatedAt} />;
}
