import { connection } from "next/server";
import { Suspense } from "react";
import { AnswersEditor } from "@/components/answers-editor";
import { Loading, PageHeader } from "@/components/ui";
import { answersStore } from "@/lib/store";

export default function AnswersPage() {
  return (
    <>
      <PageHeader title="Answers">
        Screening questions, answered once and reused on every form. Sortie fills the rest from your profile
        and preferences, and never makes up an answer it doesn&apos;t have.
      </PageHeader>
      <Suspense fallback={<Loading />}>
        <AnswersData />
      </Suspense>
    </>
  );
}

async function AnswersData() {
  await connection();
  const { value, updatedAt } = answersStore.get();
  return <AnswersEditor initial={value} updatedAt={updatedAt} />;
}
