/** Extract a human-readable reason supplied by an external service. */
export function providerMessage(payload: unknown): string | undefined {
    if (!payload || typeof payload !== 'object') return undefined;

    const body = payload as Record<string, unknown>;
    const error =
        body.error && typeof body.error === 'object'
            ? (body.error as Record<string, unknown>)
            : undefined;
    const candidates = [
        body.message,
        body.error_description,
        body.detail,
        error?.briefSummary,
        error?.message,
        body.error,
    ];

    for (const candidate of candidates) {
        if (typeof candidate !== 'string') continue;
        const message = candidate.trim();
        // Some proxies return an HTML error page, not a message from the API.
        if (candidate === body.error && /^[a-z][a-z0-9_]*$/i.test(message)) continue;
        if (message && !/^\s*</.test(message)) return message;
    }

    return undefined;
}
