import { connection } from "next/server";
import { Suspense } from "react";
import { ProfileEditor } from "@/components/profile-editor";
import { Loading, PageHeader } from "@/components/ui";
import { getProfile, latestDocument } from "@/lib/store";

export default function ProfilePage() {
  return (
    <>
      <PageHeader title="Profile">
        Your master record. Every resume Sortie tailors and every form it fills is built from this page, and
        nothing on it is ever made up.
      </PageHeader>
      <Suspense fallback={<Loading />}>
        <ProfileData />
      </Suspense>
    </>
  );
}

async function ProfileData() {
  await connection();
  const { value, updatedAt } = getProfile();
  const doc = latestDocument("resume");
  return (
    <ProfileEditor
      initial={value}
      updatedAt={updatedAt}
      resume={doc ? { filename: doc.filename, uploadedAt: doc.created_at } : null}
    />
  );
}
