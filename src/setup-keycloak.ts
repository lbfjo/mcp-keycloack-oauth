/**
 * Keycloak Setup Script
 *
 * This script configures Keycloak with:
 * - A realm for MCP demo
 * - A public client for MCP clients (Claude Desktop, IDEs, etc.)
 * - A confidential client for the MCP server
 * - A test user for development
 */

const KEYCLOAK_URL = process.env.KEYCLOAK_URL || 'http://localhost:8080';
const ADMIN_USERNAME = process.env.KEYCLOAK_ADMIN || 'admin';
const ADMIN_PASSWORD = process.env.KEYCLOAK_ADMIN_PASSWORD || 'admin';

const REALM_NAME = 'mcp-demo';
const MCP_SERVER_CLIENT_ID = 'mcp-server';
const MCP_PUBLIC_CLIENT_ID = 'mcp-client';
const TEST_USER_USERNAME = 'testuser';
const TEST_USER_PASSWORD = 'testpassword';

interface TokenResponse {
  access_token: string;
  token_type: string;
  expires_in: number;
}

async function getAdminToken(): Promise<string> {
  console.log('Getting admin access token...');

  const response = await fetch(
    `${KEYCLOAK_URL}/realms/master/protocol/openid-connect/token`,
    {
      method: 'POST',
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
      },
      body: new URLSearchParams({
        grant_type: 'password',
        client_id: 'admin-cli',
        username: ADMIN_USERNAME,
        password: ADMIN_PASSWORD,
      }),
    }
  );

  if (!response.ok) {
    throw new Error(`Failed to get admin token: ${response.status} ${response.statusText}`);
  }

  const data = (await response.json()) as TokenResponse;
  return data.access_token;
}

async function createRealm(token: string): Promise<void> {
  console.log(`Creating realm: ${REALM_NAME}...`);

  // Check if realm already exists
  const checkResponse = await fetch(`${KEYCLOAK_URL}/admin/realms/${REALM_NAME}`, {
    headers: { Authorization: `Bearer ${token}` },
  });

  if (checkResponse.ok) {
    console.log(`Realm ${REALM_NAME} already exists, skipping creation.`);
    return;
  }

  const response = await fetch(`${KEYCLOAK_URL}/admin/realms`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      realm: REALM_NAME,
      enabled: true,
      displayName: 'MCP Demo Realm',
      registrationAllowed: false,
      loginWithEmailAllowed: true,
      duplicateEmailsAllowed: false,
      resetPasswordAllowed: true,
      editUsernameAllowed: false,
      bruteForceProtected: true,
    }),
  });

  if (!response.ok) {
    const error = await response.text();
    throw new Error(`Failed to create realm: ${response.status} ${error}`);
  }

  console.log(`Realm ${REALM_NAME} created successfully.`);
}

async function createClient(
  token: string,
  clientId: string,
  isPublic: boolean,
  redirectUris: string[],
  webOrigins: string[]
): Promise<void> {
  console.log(`Creating client: ${clientId}...`);

  const clientConfig = {
    clientId,
    name: clientId,
    description: isPublic
      ? 'Public client for MCP clients (Claude Desktop, IDEs)'
      : 'Confidential client for MCP server resource validation',
    enabled: true,
    publicClient: isPublic,
    directAccessGrantsEnabled: true,
    standardFlowEnabled: true,
    implicitFlowEnabled: false,
    serviceAccountsEnabled: !isPublic,
    authorizationServicesEnabled: false,
    redirectUris,
    webOrigins,
    protocol: 'openid-connect',
    attributes: {
      'pkce.code.challenge.method': 'S256',
      'oauth2.device.authorization.grant.enabled': 'false',
      'oidc.ciba.grant.enabled': 'false',
    },
    defaultClientScopes: ['openid', 'profile', 'email'],
    optionalClientScopes: [],
  };

  // Check if client already exists
  const checkResponse = await fetch(
    `${KEYCLOAK_URL}/admin/realms/${REALM_NAME}/clients?clientId=${clientId}`,
    {
      headers: { Authorization: `Bearer ${token}` },
    }
  );

  if (checkResponse.ok) {
    const clients = (await checkResponse.json()) as any[];
    if (clients.length > 0) {
      console.log(`Client ${clientId} already exists, updating...`);
      const clientUuid = clients[0].id;
      const updateResponse = await fetch(`${KEYCLOAK_URL}/admin/realms/${REALM_NAME}/clients/${clientUuid}`, {
        method: 'PUT',
        headers: {
          Authorization: `Bearer ${token}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(clientConfig),
      });

      if (!updateResponse.ok) {
        const error = await updateResponse.text();
        throw new Error(`Failed to update client ${clientId}: ${updateResponse.status} ${error}`);
      }

      console.log(`Client ${clientId} updated successfully.`);
      return;
    }
  }

  const response = await fetch(`${KEYCLOAK_URL}/admin/realms/${REALM_NAME}/clients`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(clientConfig),
  });

  if (!response.ok) {
    const error = await response.text();
    throw new Error(`Failed to create client ${clientId}: ${response.status} ${error}`);
  }

  console.log(`Client ${clientId} created successfully.`);
}

async function createUser(token: string): Promise<void> {
  console.log(`Creating test user: ${TEST_USER_USERNAME}...`);

  // Check if user already exists
  const checkResponse = await fetch(
    `${KEYCLOAK_URL}/admin/realms/${REALM_NAME}/users?username=${TEST_USER_USERNAME}`,
    {
      headers: { Authorization: `Bearer ${token}` },
    }
  );

  if (checkResponse.ok) {
    const users = (await checkResponse.json()) as any[];
    if (users.length > 0) {
      console.log(`User ${TEST_USER_USERNAME} already exists, skipping creation.`);
      return;
    }
  }

  // Create user
  const userResponse = await fetch(`${KEYCLOAK_URL}/admin/realms/${REALM_NAME}/users`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      username: TEST_USER_USERNAME,
      email: `${TEST_USER_USERNAME}@example.com`,
      firstName: 'Test',
      lastName: 'User',
      enabled: true,
      emailVerified: true,
      credentials: [
        {
          type: 'password',
          value: TEST_USER_PASSWORD,
          temporary: false,
        },
      ],
    }),
  });

  if (!userResponse.ok) {
    const error = await userResponse.text();
    throw new Error(`Failed to create user: ${userResponse.status} ${error}`);
  }

  console.log(`User ${TEST_USER_USERNAME} created successfully.`);
}

async function createCustomScopes(token: string): Promise<void> {
  console.log('Creating custom MCP scopes...');

  const scopes = [
    { name: 'mcp:read', description: 'Read access to MCP resources' },
    { name: 'mcp:write', description: 'Write access to MCP resources' },
  ];

  for (const scope of scopes) {
    // Check if scope exists
    const checkResponse = await fetch(
      `${KEYCLOAK_URL}/admin/realms/${REALM_NAME}/client-scopes`,
      {
        headers: { Authorization: `Bearer ${token}` },
      }
    );

    if (checkResponse.ok) {
      const existingScopes = (await checkResponse.json()) as any[];
      if (existingScopes.some((s) => s.name === scope.name)) {
        console.log(`Scope ${scope.name} already exists, skipping.`);
        continue;
      }
    }

    const response = await fetch(`${KEYCLOAK_URL}/admin/realms/${REALM_NAME}/client-scopes`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${token}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        name: scope.name,
        description: scope.description,
        protocol: 'openid-connect',
        attributes: {
          'include.in.token.scope': 'true',
          'display.on.consent.screen': 'true',
        },
      }),
    });

    if (response.ok) {
      console.log(`Scope ${scope.name} created successfully.`);
    } else {
      console.warn(`Failed to create scope ${scope.name}: ${response.status}`);
    }
  }
}

async function main() {
  console.log('\n🔧 Keycloak Setup for MCP OAuth Demo\n');
  console.log(`Keycloak URL: ${KEYCLOAK_URL}`);
  console.log(`Realm: ${REALM_NAME}\n`);

  try {
    // Wait for Keycloak to be ready (check master realm endpoint)
    console.log('Waiting for Keycloak to be ready...');
    let ready = false;
    for (let i = 0; i < 30; i++) {
      try {
        const response = await fetch(`${KEYCLOAK_URL}/realms/master`);
        if (response.ok) {
          ready = true;
          break;
        }
      } catch {
        // Keycloak not ready yet
      }
      await new Promise((resolve) => setTimeout(resolve, 2000));
      process.stdout.write('.');
    }
    console.log('');

    if (!ready) {
      throw new Error('Keycloak did not become ready in time');
    }

    console.log('Keycloak is ready!\n');

    // Get admin token
    const token = await getAdminToken();

    // Create realm
    await createRealm(token);

    // Create custom scopes
    await createCustomScopes(token);

    // Create public client for MCP clients (Claude Desktop, IDEs, etc.)
    await createClient(
      token,
      MCP_PUBLIC_CLIENT_ID,
      true, // public client
      [
        'http://localhost:*',
        'http://127.0.0.1:*',
        'https://localhost:*',
        'https://127.0.0.1:*',
        // Common callback paths for various MCP clients
        'http://localhost:3000/callback',
        'http://127.0.0.1:3000/callback',
        'http://localhost:8888/callback',
        'http://127.0.0.1:8888/callback',
        // Add Cursor's redirect URI
        'cursor://anysphere.cursor-mcp/oauth/callback',
      ],
      ['http://localhost:*', 'http://127.0.0.1:*']
    );

    // Create confidential client for MCP server (token introspection)
    await createClient(
      token,
      MCP_SERVER_CLIENT_ID,
      false, // confidential client
      [],
      []
    );

    // Create test user
    await createUser(token);

    console.log('\n✅ Keycloak setup completed successfully!\n');
    console.log('Configuration Summary:');
    console.log('----------------------');
    console.log(`Realm: ${REALM_NAME}`);
    console.log(`Public Client ID: ${MCP_PUBLIC_CLIENT_ID}`);
    console.log(`Server Client ID: ${MCP_SERVER_CLIENT_ID}`);
    console.log(`Test User: ${TEST_USER_USERNAME} / ${TEST_USER_PASSWORD}`);
    console.log(`\nOpenID Configuration URL:`);
    console.log(`${KEYCLOAK_URL}/realms/${REALM_NAME}/.well-known/openid-configuration`);
    console.log(`\nAuthorization URL:`);
    console.log(`${KEYCLOAK_URL}/realms/${REALM_NAME}/protocol/openid-connect/auth`);
    console.log(`\nToken URL:`);
    console.log(`${KEYCLOAK_URL}/realms/${REALM_NAME}/protocol/openid-connect/token`);
  } catch (error) {
    console.error('\n❌ Setup failed:', error);
    process.exit(1);
  }
}

main();
