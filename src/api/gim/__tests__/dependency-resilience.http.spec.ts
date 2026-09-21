import axios from 'axios';
import { createServer, Server } from 'http';
import { AddressInfo } from 'net';
import {
    CircuitBreaker,
    CircuitOpenError,
    retryIdempotent,
} from '../dependency-resilience';

// A loopback-only fake GIM: no request reaches the municipality or production.
describe('GIM read policy against a simulated HTTP dependency', () => {
    let server: Server;
    let url: string;
    let calls: number;
    let mode: 'unavailable' | 'slow' | 'healthy';

    beforeEach(async () => {
        calls = 0;
        mode = 'unavailable';
        server = createServer((_request, response) => {
            calls += 1;
            if (mode === 'unavailable') {
                response.writeHead(503).end('unavailable');
            } else if (mode === 'slow') {
                setTimeout(() => response.writeHead(200).end('late'), 150);
            } else {
                response.writeHead(200).end('recovered');
            }
        });
        await new Promise<void>((resolve) =>
            server.listen(0, '127.0.0.1', resolve),
        );
        url = `http://127.0.0.1:${(server.address() as AddressInfo).port}/gim`;
    });

    afterEach(async () => {
        server.closeAllConnections();
        await new Promise<void>((resolve) => server.close(() => resolve()));
    });

    const transient = (error: unknown) =>
        axios.isAxiosError(error) &&
        (!error.response || error.response.status >= 500);

    it('bounds attempts, rejects rapidly while open and recovers with one probe', async () => {
        const breaker = new CircuitBreaker(3, 50, transient);
        const read = () =>
            breaker.execute(() =>
                retryIdempotent(
                    () => axios.get(url, { timeout: 50, proxy: false }),
                    1,
                    1,
                    transient,
                ),
            );

        for (let request = 0; request < 3; request += 1) {
            await expect(read()).rejects.toMatchObject({ response: { status: 503 } });
        }
        expect(calls).toBe(6);
        expect(breaker.state).toBe('open');
        await expect(read()).rejects.toBeInstanceOf(CircuitOpenError);
        expect(calls).toBe(6);

        mode = 'healthy';
        await new Promise((resolve) => setTimeout(resolve, 60));
        await expect(read()).resolves.toMatchObject({ status: 200, data: 'recovered' });
        expect(calls).toBe(7);
        expect(breaker.state).toBe('closed');
    });

    it('ends slow calls at the configured timeout, with only one retry', async () => {
        mode = 'slow';
        const read = () =>
            retryIdempotent(
                () => axios.get(url, { timeout: 30, proxy: false }),
                1,
                1,
                transient,
            );

        await expect(read()).rejects.toMatchObject({ code: 'ECONNABORTED' });
        expect(calls).toBe(2);
    });
});
