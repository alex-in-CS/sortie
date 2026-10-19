import { connection } from "next/server";
import { Suspense } from "react";
import { CompanyList } from "@/components/company-list";
import { FetchButton } from "@/components/fetch-button";
import { Loading, PageHeader, Section } from "@/components/ui";
import { formatCount, formatDateTime } from "@/lib/format";
import { jobCounts, lastTask, listCompanies, syncRegistry } from "@/lib/jobs";
import { registry, registryEntries } from "@/lib/registry";

export default function CompaniesPage() {
  return (
    <>
      <PageHeader title="Companies">
        Every company here has a public job board that answered a live check. Sortie reads those boards every
        two hours. Switch off any you don&apos;t want; they won&apos;t be fetched or matched.
      </PageHeader>
      <Suspense fallback={<Loading />}>
        <CompaniesData />
      </Suspense>
    </>
  );
}

async function CompaniesData() {
  await connection();
  // The list should be visible before the first fetch, so sync it on view too.
  syncRegistry(registryEntries());
  const companies = listCompanies();
  const task = lastTask("fetch");
  const done = lastTask("fetch", "done");
  const counts = jobCounts();
  const result = done?.result
    ? (JSON.parse(done.result) as { added?: number; closed?: number; failed?: unknown[]; resting?: unknown[] })
    : null;
  const resting = result?.resting?.length ? `, ${result.resting.length} resting after a rate limit` : "";

  return (
    <>
      <Section
        title="Fetching"
        hint={
          done?.finished_at
            ? `Last run ${formatDateTime(done.finished_at)}${result ? `: ${formatCount(result.added)} new, ${formatCount(result.closed)} closed, ${result.failed?.length ?? 0} boards failed${resting}` : ""}. ${formatCount(counts.open)} open jobs stored.`
            : "Nothing fetched yet. Start the worker (npm run worker) or press Fetch now."
        }
        action={<FetchButton initial={task?.status ?? null} />}
      >
        <CompanyList initial={companies} />
      </Section>

      {registry.unsupported.length > 0 && (
        <Section
          title="Not covered automatically"
          hint="These run their own careers systems with no public feed Sortie can read. Check them by hand for now."
        >
          <ul className="grid gap-2 text-sm sm:grid-cols-2">
            {registry.unsupported.map((u) => (
              <li key={u.name} className="flex items-baseline justify-between gap-3">
                <span>
                  {u.careersUrl ? (
                    <a href={u.careersUrl} target="_blank" rel="noreferrer" className="underline-offset-2 hover:underline">
                      {u.name}
                    </a>
                  ) : (
                    u.name
                  )}
                </span>
                <span className="font-mono text-xs text-faint">{u.ats}</span>
              </li>
            ))}
          </ul>
        </Section>
      )}

      <Section
        title="Checked, no board found"
        hint={`Probed on Greenhouse, Ashby and Lever on ${formatDateTime(registry.verifiedAt)} with no match. They likely use another system.`}
      >
        <p className="text-sm leading-6 text-muted">{registry.notFound.join(" · ")}</p>
      </Section>
    </>
  );
}
