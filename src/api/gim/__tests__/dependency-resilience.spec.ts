import {
    CircuitBreaker,
    CircuitOpenError,
    retryIdempotent,
} from '../dependency-resilience';

describe('CircuitBreaker', () => {
    let clock = 0;
    const dependencyFailure = (error: unknown) =>
        error instanceof Error && error.message === 'unavailable';
    let breaker: CircuitBreaker;

    beforeEach(() => {
        clock = 0;
        breaker = new CircuitBreaker(3, 1000, dependencyFailure, () => clock);
    });

    it('opens after the configured failures and does not call the dependency', async () => {
        const call = jest.fn().mockRejectedValue(new Error('unavailable'));
        for (let attempt = 0; attempt < 3; attempt += 1) {
            await expect(breaker.execute(call)).rejects.toThrow('unavailable');
        }
        expect(breaker.state).toBe('open');
        await expect(breaker.execute(call)).rejects.toBeInstanceOf(CircuitOpenError);
        expect(call).toHaveBeenCalledTimes(3);
    });

    it('allows one half-open probe and closes after recovery', async () => {
        const failure = () => Promise.reject(new Error('unavailable'));
        for (let attempt = 0; attempt < 3; attempt += 1) {
            await expect(breaker.execute(failure)).rejects.toThrow();
        }
        clock = 1000;
        expect(breaker.state).toBe('half-open');
        let finishProbe!: (value: string) => void;
        const probe = breaker.execute(
            () => new Promise<string>((resolve) => (finishProbe = resolve)),
        );
        await expect(breaker.execute(failure)).rejects.toBeInstanceOf(
            CircuitOpenError,
        );
        finishProbe('ok');
        await expect(probe).resolves.toBe('ok');
        expect(breaker.state).toBe('closed');
    });

    it('reopens after a failed half-open probe', async () => {
        const failure = () => Promise.reject(new Error('unavailable'));
        for (let attempt = 0; attempt < 3; attempt += 1) {
            await expect(breaker.execute(failure)).rejects.toThrow();
        }
        clock = 1000;
        await expect(breaker.execute(failure)).rejects.toThrow('unavailable');
        expect(breaker.state).toBe('open');
    });

    it('does not count a business error as dependency unavailability', async () => {
        await expect(
            breaker.execute(() => Promise.reject(new Error('bad request'))),
        ).rejects.toThrow('bad request');
        expect(breaker.state).toBe('closed');
    });

    it('does not let an older successful request close a newly opened circuit', async () => {
        let finishOld!: (value: string) => void;
        const old = breaker.execute(
            () => new Promise<string>((resolve) => (finishOld = resolve)),
        );
        const failure = () => Promise.reject(new Error('unavailable'));
        for (let attempt = 0; attempt < 3; attempt += 1) {
            await expect(breaker.execute(failure)).rejects.toThrow();
        }
        finishOld('ok');
        await expect(old).resolves.toBe('ok');
        expect(breaker.state).toBe('open');
    });
});

describe('retryIdempotent', () => {
    it('retries only up to the configured count', async () => {
        const call = jest.fn().mockRejectedValue(new Error('unavailable'));
        const sleep = jest.fn().mockResolvedValue(undefined);
        await expect(
            retryIdempotent(call, 1, 200, () => true, sleep),
        ).rejects.toThrow('unavailable');
        expect(call).toHaveBeenCalledTimes(2);
        expect(sleep).toHaveBeenCalledTimes(1);
        expect(sleep).toHaveBeenCalledWith(200);
    });

    it('does not retry a non-retryable error', async () => {
        const call = jest.fn().mockRejectedValue(new Error('bad request'));
        await expect(
            retryIdempotent(call, 1, 0, () => false),
        ).rejects.toThrow('bad request');
        expect(call).toHaveBeenCalledTimes(1);
    });

    it('returns when the second attempt recovers', async () => {
        const call = jest
            .fn()
            .mockRejectedValueOnce(new Error('unavailable'))
            .mockResolvedValueOnce('ok');
        await expect(
            retryIdempotent(call, 1, 0, () => true),
        ).resolves.toBe('ok');
        expect(call).toHaveBeenCalledTimes(2);
    });
});
