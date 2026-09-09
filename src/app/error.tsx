"use client";

import { useEffect } from "react";

export default function ErrorPage({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    console.error(error);
  }, [error]);

  return (
    <main className="mx-auto flex min-h-dvh w-full max-w-md flex-col justify-center gap-4 px-6 py-10">
      <h1 className="text-2xl font-bold">Something broke</h1>
      <p className="text-sm text-muted">
        The server hit an error loading this page. If this is a fresh deployment, it is almost
        always a missing environment variable or a database that has not been set up yet.
      </p>

      <a href="/api/health" className="btn-primary">
        Run the deployment check
      </a>
      <button type="button" onClick={reset} className="btn-ghost">
        Try again
      </button>

      {error.digest && (
        <p className="text-center text-xs text-muted">
          Error reference: <code>{error.digest}</code>
        </p>
      )}
    </main>
  );
}
