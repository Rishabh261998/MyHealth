"use client";

/** Last-resort boundary: catches failures in the root layout itself. */
export default function GlobalError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  return (
    <html lang="en">
      <body
        style={{
          margin: 0,
          minHeight: "100dvh",
          display: "grid",
          placeItems: "center",
          background: "#0b0f14",
          color: "#e8eef5",
          font: "16px/1.6 system-ui, sans-serif",
          padding: "2rem",
        }}
      >
        <div style={{ maxWidth: "26rem" }}>
          <h1 style={{ fontSize: "1.5rem", margin: "0 0 0.75rem" }}>Something broke</h1>
          <p style={{ color: "#8ba0b5", margin: "0 0 1.25rem" }}>
            The app failed to start. On a new deployment this is usually a missing environment
            variable or a database that has not been created yet.
          </p>
          <a
            href="/api/health"
            style={{
              display: "inline-block",
              padding: "0.7rem 1.3rem",
              borderRadius: "0.8rem",
              background: "#3ba3f2",
              color: "#fff",
              fontWeight: 600,
              textDecoration: "none",
            }}
          >
            Run the deployment check
          </a>
          <button
            type="button"
            onClick={reset}
            style={{
              marginLeft: "0.6rem",
              padding: "0.7rem 1.3rem",
              borderRadius: "0.8rem",
              border: "1px solid #26313d",
              background: "transparent",
              color: "#e8eef5",
              fontWeight: 600,
            }}
          >
            Try again
          </button>
          {error.digest && (
            <p style={{ color: "#8ba0b5", fontSize: "0.8rem", marginTop: "1.25rem" }}>
              Error reference: <code>{error.digest}</code>
            </p>
          )}
        </div>
      </body>
    </html>
  );
}
