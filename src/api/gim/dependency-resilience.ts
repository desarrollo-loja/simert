/** Returned instead of contacting a dependency while its circuit is open. */
export class CircuitOpenError extends Error {
    constructor() {
        super('Dependency circuit is open');
        this.name = 'CircuitOpenError';
    }
}

/** A small, per-process circuit breaker for one outbound dependency. */
export class CircuitBreaker {
    private failures = 0;
    private openedAt: number | null = null;
    private probeInFlight = false;

    constructor(
        private readonly failureThreshold: number,
        private readonly resetAfterMs: number,
        private readonly isDependencyFailure: (error: unknown) => boolean,
        private readonly now: () => number = Date.now,
    ) {
        if (failureThreshold < 1 || resetAfterMs < 1) {
            throw new Error('Invalid circuit breaker thresholds');
        }
    }

    get state(): 'closed' | 'open' | 'half-open' {
        if (this.openedAt === null) return 'closed';
        return this.now() - this.openedAt >= this.resetAfterMs
            ? 'half-open'
            : 'open';
    }

    async execute<T>(operation: () => Promise<T>): Promise<T> {
        const state = this.state;
        const openedAtStart = this.openedAt;
        if (state === 'open' || (state === 'half-open' && this.probeInFlight)) {
            throw new CircuitOpenError();
        }
        if (state === 'half-open') this.probeInFlight = true;

        try {
            const result = await operation();
            // An older concurrent call must not close a circuit opened later.
            if (state === 'half-open' || this.openedAt === openedAtStart) {
                this.failures = 0;
                this.openedAt = null;
            }
            return result;
        } catch (error) {
            if (state === 'closed' && this.openedAt !== openedAtStart) {
                throw error;
            }
            if (this.isDependencyFailure(error)) {
                this.failures += 1;
                if (
                    state === 'half-open' ||
                    this.failures >= this.failureThreshold
                ) {
                    this.openedAt = this.now();
                }
            } else if (
                state === 'half-open' ||
                this.openedAt === openedAtStart
            ) {
                // A business 4xx proves the dependency is reachable.
                this.failures = 0;
                this.openedAt = null;
            }
            throw error;
        } finally {
            if (state === 'half-open') this.probeInFlight = false;
        }
    }
}

/** Retry only an idempotent operation, with an explicit bound and delay. */
export async function retryIdempotent<T>(
    operation: () => Promise<T>,
    maxRetries: number,
    delayMs: number,
    isRetryable: (error: unknown) => boolean,
    sleep: (ms: number) => Promise<void> = (ms) =>
        new Promise((resolve) => setTimeout(resolve, ms)),
): Promise<T> {
    if (maxRetries < 0 || delayMs < 0) {
        throw new Error('Invalid retry policy');
    }
    for (let attempt = 0; ; attempt += 1) {
        try {
            return await operation();
        } catch (error) {
            if (attempt >= maxRetries || !isRetryable(error)) throw error;
            await sleep(delayMs);
        }
    }
}
