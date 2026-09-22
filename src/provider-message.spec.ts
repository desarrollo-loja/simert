import { providerMessage } from './provider-message';

describe('providerMessage', () => {
    it('prefers the provider message over its machine error code', () => {
        expect(providerMessage({ message: '  Motivo de GIM  ', error: 'invalid_request' })).toBe('Motivo de GIM');
    });

    it('supports Keycloak and Alfresco error envelopes', () => {
        expect(providerMessage({ error: 'invalid_grant', error_description: 'Invalid user credentials' })).toBe('Invalid user credentials');
        expect(providerMessage({ error: { briefSummary: 'Node not found' } })).toBe('Node not found');
    });

    it('does not expose HTML or invent a message', () => {
        expect(providerMessage('<html>Error</html>')).toBeUndefined();
        expect(providerMessage({ message: '<html>Error</html>' })).toBeUndefined();
        expect(providerMessage({})).toBeUndefined();
        expect(providerMessage({ error: 'invalid_grant' })).toBeUndefined();
    });
});
