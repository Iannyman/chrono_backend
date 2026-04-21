import { Client } from 'ldapts';
import dotenv from 'dotenv';
dotenv.config();

const LDAP_URL = process.env.LDAP_URL_IP ?? '';
const SEARCH_BASE = process.env.LDAP_SEARCH_BASE ?? '';
const SEARCH_BASE2 = process.env.LDAP_SEARCH_BASE2 ?? '';
const BIND_DN = process.env.LDAP_BIND_DN ?? '';
const BIND_PASSWORD = process.env.LDAP_BIND_PASSWORD ?? '';

export interface LdapUser {
  displayName: string;
  department: string;
  sAMAccountName: string;
}

async function searchUser(client: Client, searchBase: string, username: string) {
  const { searchEntries } = await client.search(searchBase, {
    scope: 'sub',
    filter: `(sAMAccountName=${username})`,
    attributes: ['dn', 'displayName', 'department', 'sAMAccountName'],
  });
  return searchEntries;
}

export async function authenticateUser(username: string, password: string): Promise<LdapUser> {
  const client = new Client({ url: LDAP_URL });

  try {
    await client.bind(BIND_DN, BIND_PASSWORD);

    let entries = await searchUser(client, SEARCH_BASE, username);

    if (entries.length === 0 && SEARCH_BASE2) {
      entries = await searchUser(client, SEARCH_BASE2, username);
    }

    if (entries.length === 0) {
      throw new Error('User not found in any search base');
    }

    const user = entries[0];
    const userDN = user.dn;

    const authClient = new Client({ url: LDAP_URL });
    await authClient.bind(userDN, password);
    await authClient.unbind();

    return {
      displayName: user.displayName as string,
      department: user.department as string,
      sAMAccountName: user.sAMAccountName as string,
    };
  } catch (err) {
    throw new Error(`Authentication failed: ${(err as Error).message}`);
  } finally {
    await client.unbind();
  }
}

export async function logAllUsers(searchBase: string = SEARCH_BASE): Promise<void> {
  const client = new Client({ url: LDAP_URL });
  try {
    await client.bind(BIND_DN, BIND_PASSWORD);

    const { searchEntries } = await client.search(searchBase, {
      scope: 'sub',
      filter: '(&(objectClass=user)(sAMAccountName=*))',
      attributes: ['dn', 'displayName', 'department', 'sAMAccountName', 'mail', 'title', 'company', 'telephoneNumber', 'memberOf'],
    });

    console.log(`Found ${searchEntries.length} users:`);
    searchEntries.forEach((user: Record<string, unknown>, idx: number) => {
      console.log(`\nUser #${idx + 1}:`);
      Object.entries(user).forEach(([key, value]) => {
        console.log(`  ${key}: ${Array.isArray(value) ? value.join(', ') : value}`);
      });
    });
  } catch (err) {
    console.error('Error fetching users:', (err as Error).message);
  } finally {
    await client.unbind();
  }
}

export async function logUserAttributes(username: string, searchBase: string = SEARCH_BASE): Promise<void> {
  const client = new Client({ url: LDAP_URL });
  try {
    await client.bind(BIND_DN, BIND_PASSWORD);

    const { searchEntries } = await client.search(searchBase, {
      scope: 'sub',
      filter: `(sAMAccountName=${username})`,
      attributes: ['*'],
    });

    if (searchEntries.length === 0) {
      console.log(`User "${username}" not found in ${searchBase}`);
      return;
    }

    const user = searchEntries[0];
    console.log(`Attributes for user "${username}":`);
    Object.entries(user).forEach(([key, value]) => {
      console.log(`  ${key}: ${Array.isArray(value) ? value.join(', ') : value}`);
    });
  } catch (err) {
    console.error('Error fetching user:', (err as Error).message);
  } finally {
    await client.unbind();
  }
}

export async function getAllOUs(searchBase: string = SEARCH_BASE) {
  const client = new Client({ url: LDAP_URL });
  try {
    await client.bind(BIND_DN, BIND_PASSWORD);

    const { searchEntries } = await client.search(searchBase, {
      scope: 'sub',
      filter: '(objectClass=organizationalUnit)',
      attributes: ['ou', 'distinguishedName', 'description'],
    });

    searchEntries.forEach((ou: Record<string, unknown>, idx: number) => {
      console.log(`OU #${idx + 1}:`, ou);
    });

    return searchEntries;
  } catch (err) {
    console.error('Error fetching OUs:', (err as Error).message);
    return [];
  } finally {
    await client.unbind();
  }
}
