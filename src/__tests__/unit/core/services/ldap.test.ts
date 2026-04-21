import { describe, it, expect, beforeEach, vi } from 'vitest';

// Set env vars BEFORE importing the module under test
process.env.LDAP_URL_IP = 'ldap://localhost:389';
process.env.LDAP_SEARCH_BASE = 'dc=example,dc=com';
process.env.LDAP_SEARCH_BASE2 = 'ou=users,dc=example,dc=com';
process.env.LDAP_BIND_DN = 'cn=admin,dc=example,dc=com';
process.env.LDAP_BIND_PASSWORD = 'adminpass';

const { mockBind, mockUnbind, mockSearch } = vi.hoisted(() => ({
  mockBind: vi.fn(),
  mockUnbind: vi.fn(),
  mockSearch: vi.fn(),
}));

vi.mock('ldapts', () => ({
  Client: class {
    bind = mockBind;
    unbind = mockUnbind;
    search = mockSearch;
  },
}));

vi.mock('dotenv', () => ({
  default: { config: vi.fn() },
}));

vi.mock('../../../../infrastructure/logging/logger.js', () => ({
  logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() },
}));

vi.mock('../../../../config/index.js', () => ({
  config: {
    server: { port: 3000, nodeEnv: 'test' },
    logging: { level: 'info', prettyPrint: false },
  },
}));

import { authenticateUser, getAllOUs } from '../../../../core/services/ldap.js';

describe('LDAP Service', () => {
  beforeEach(() => {
    vi.resetAllMocks();
    mockBind.mockResolvedValue(undefined);
    mockUnbind.mockResolvedValue(undefined);
  });

  describe('authenticateUser', () => {
    it('should return LdapUser when found in first search base', async () => {
      mockSearch.mockResolvedValueOnce({
        searchEntries: [{
          dn: 'cn=testuser,dc=example,dc=com',
          displayName: 'Test User',
          department: 'IT',
          sAMAccountName: 'testuser',
        }],
      });

      const user = await authenticateUser('testuser', 'password123');

      expect(user).toEqual({
        displayName: 'Test User',
        department: 'IT',
        sAMAccountName: 'testuser',
      });
    });

    // Note: The fallback to SEARCH_BASE2 cannot be tested here because the ldap
    // module reads process.env at import time. The dotenvx vitest plugin injects
    // .env vars after our process.env assignments, overriding them with empty values.
    // This test would require refactoring ldap.ts to accept config via parameters.

    it('should throw when user not found in any base', async () => {
      mockSearch.mockResolvedValue({ searchEntries: [] });

      await expect(authenticateUser('nobody', 'pass')).rejects.toThrow('User not found');
    });

    it('should call unbind in finally block even on error', async () => {
      mockBind.mockRejectedValue(new Error('Connection failed'));

      await expect(authenticateUser('testuser', 'pass')).rejects.toThrow();
      expect(mockUnbind).toHaveBeenCalled();
    });
  });

  describe('getAllOUs', () => {
    it('should return search entries for OU objects', async () => {
      const entries = [{ ou: 'Users', distinguishedName: 'ou=Users,dc=example,dc=com' }];
      mockSearch.mockResolvedValueOnce({ searchEntries: entries });

      const result = await getAllOUs();

      expect(result).toEqual(entries);
    });

    it('should return empty array on error', async () => {
      mockSearch.mockRejectedValueOnce(new Error('LDAP error'));

      const result = await getAllOUs();

      expect(result).toEqual([]);
    });
  });
});
