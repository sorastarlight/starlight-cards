/**
 * PostgREST / Supabase RPC error classification for Free Daily opens.
 * Kept dependency-free so Node tests can import it without a browser client.
 */

/**
 * True only for a definitive PostgREST “function/signature missing” response.
 * Timeouts, network failures, 5xx, and generic 404s must NOT match — those are
 * ambiguous and must never trigger a fresh zero-arg grant.
 */
export function isUnsupportedRpcSignatureError(error, { functionName, argumentHint = null } = {}) {
  if (!error) return false;
  const code = String(error.code || "").toUpperCase();
  const message = String(error.message || "");
  const details = String(error.details || "");
  const hint = String(error.hint || "");
  const blob = `${message}\n${details}\n${hint}`;
  const lower = blob.toLowerCase();

  // Ambiguous / non-capability failures — never treat as unsupported.
  if (
    /timeout|timed out|network|failed to fetch|econnreset|502|503|504|statement timeout|canceling statement/i.test(
      blob
    )
  ) {
    return false;
  }

  const named = String(functionName || "").toLowerCase();
  const mentionsFn = named ? lower.includes(named) : true;
  const mentionsArg = argumentHint
    ? lower.includes(String(argumentHint).toLowerCase())
    : true;

  if (code === "PGRST202" && mentionsFn) {
    return argumentHint ? mentionsArg : true;
  }

  if (mentionsFn && /could not find the function/i.test(blob) && mentionsArg) {
    return true;
  }

  // Schema-cache miss variants used by PostgREST.
  if (mentionsFn && /not find.*(function|rpc)/i.test(blob) && mentionsArg) {
    return true;
  }

  return false;
}
