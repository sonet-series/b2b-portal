import { Badge, Card } from "@/components/ui";
import { formatBytes, type OffsiteStatus, type DeployStatus } from "@/lib/backup-status";
import { formatDateDisplay } from "@/lib/dates";

/**
 * Whether the nightly backup is leaving this box.
 *
 * A server component, not a client one: there is nothing to press. The host
 * script does the work and this only reports what it wrote — the portal must
 * not be able to start, stop or configure a backup, because it runs as an
 * unprivileged user inside a container and has no business holding ssh keys.
 *
 * It exists for the reason the email panel exists. Configuration an operator
 * cannot see is configuration nobody trusts, and the specific failure worth
 * surfacing is not a loud one — it is the job that quietly stopped running and
 * left a cheerful "ok" from three weeks ago.
 */
export function BackupPanel({
  status,
  deploy,
}: {
  status: OffsiteStatus;
  deploy: DeployStatus;
}) {
  const tone =
    status.state === "ok" && !status.stale
      ? "green"
      : status.state === "error" || status.stale
        ? "red"
        : "slate";
  const label =
    status.state === "ok" && !status.stale
      ? "On"
      : status.stale
        ? "Stale"
        : status.state === "error"
          ? "Failing"
          : status.state === "unconfigured"
            ? "Off"
            : "Unknown";

  return (
    <Card className="mt-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h2 className="text-sm font-semibold text-slate-900">Off-box backups</h2>
        <Badge tone={tone}>{label}</Badge>
      </div>

      {status.state === "ok" && (
        <>
          <dl className="mt-3 grid gap-x-8 gap-y-1 text-sm sm:grid-cols-2">
            <Row
              label="Last copy"
              value={
                status.at
                  ? `${formatDateDisplay(status.at)} at ${status.at
                      .toISOString()
                      .slice(11, 16)} UTC`
                  : "—"
              }
            />
            <Row label="Size" value={formatBytes(status.bytes)} />
            <Row label="Goes to" value={status.remote || "—"} />
            <Row label="Kept for" value={status.keepDays ? `${status.keepDays} days` : "—"} />
          </dl>
          {status.stale ? (
            <p className="mt-3 rounded-md bg-red-50 px-3 py-2 text-sm text-red-800 ring-1 ring-inset ring-red-200">
              The last copy succeeded, but that was more than two nights ago — so the nightly job
              has stopped running rather than started failing. Check{" "}
              <code className="rounded bg-red-100 px-1">crontab -l</code> and{" "}
              <code className="rounded bg-red-100 px-1">/var/log/b2b-backup.log</code> on the
              server.
            </p>
          ) : (
            <p className="mt-3 text-sm text-slate-500">
              Encrypted on the server before it is sent, and read back afterwards to check it
              arrived byte for byte. Only the private key — which is not on the server — can open
              it.
            </p>
          )}
        </>
      )}

      {status.state === "error" && (
        <p className="mt-3 rounded-md bg-red-50 px-3 py-2 text-sm text-red-800 ring-1 ring-inset ring-red-200">
          The last attempt failed{status.at ? ` on ${formatDateDisplay(status.at)}` : ""}:{" "}
          {status.detail || "no detail was recorded"}. The copies kept on the server itself are
          unaffected — it is the off-box copy that did not happen.
        </p>
      )}

      {status.state === "unconfigured" && (
        <p className="mt-2 text-sm text-slate-500">
          Backups are being taken nightly and kept on the server, but no copy is being sent
          anywhere else — so a lost server would take them with it. Set this up on the box with{" "}
          <code className="rounded bg-slate-100 px-1">deploy/offsite.sh keygen</code> and an{" "}
          <code className="rounded bg-slate-100 px-1">OFFSITE_REMOTE</code> in{" "}
          <code className="rounded bg-slate-100 px-1">.env.offsite</code>.
        </p>
      )}

      {status.state === "unknown" && (
        <p className="mt-2 text-sm text-slate-500">
          No report from the backup job yet. It writes one each time it runs, so this fills in
          after the next nightly run — or straight away if you run{" "}
          <code className="rounded bg-slate-100 px-1">deploy/backup.sh</code> on the server.
        </p>
      )}

      {/*
        What is actually RUNNING here.
        CI stopped deploying on 6 Oct 2026 and it went unnoticed for a day —
        every push reached GitHub and stopped there, and the only symptom was
        a change that never appeared. A green build elsewhere is not evidence.
      */}
      <div className="mt-5 border-t border-slate-100 pt-4">
        {deploy.at === null ? (
          <p className="text-sm text-slate-500">
            Nothing has recorded a deploy yet. The next run of{" "}
            <code className="rounded bg-slate-100 px-1">deploy/deploy.sh</code> will fill this in.
          </p>
        ) : (
          <>
            <p className="text-sm text-slate-600">
              <span className="text-xs uppercase tracking-wide text-slate-400">Running </span>
              <code className="rounded bg-slate-100 px-1">{deploy.commit}</code>
              {deploy.subject && <span className="text-slate-500"> — {deploy.subject}</span>}
            </p>
            <p className="mt-1 text-sm text-slate-500">
              Deployed {formatDateDisplay(deploy.at)} at{" "}
              {deploy.at.toISOString().slice(11, 16)} UTC
              {deploy.by && deploy.by !== "manual" ? ` by ${deploy.by}` : " by hand"}.
            </p>
            {deploy.stale && (
              <p className="mt-2 rounded-md bg-amber-50 px-3 py-2 text-sm text-amber-900 ring-1 ring-inset ring-amber-200">
                Nothing has deployed in over a week. If you have pushed since, the pipeline has
                stopped working rather than had nothing to do — check the repository&rsquo;s
                Actions tab.
              </p>
            )}
          </>
        )}
      </div>
    </Card>
  );
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex justify-between gap-4 sm:block">
      <dt className="text-xs uppercase tracking-wide text-slate-400">{label}</dt>
      <dd className="break-all text-slate-700">{value}</dd>
    </div>
  );
}
