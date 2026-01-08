/**
 * MCP OAuth Test Client
 *
 * This script demonstrates the OAuth flow for connecting to an MCP server
 * protected by Keycloak authentication.
 *
 * It performs:
 * 1. OAuth authorization code flow with PKCE
 * 2. Token exchange
 * 3. MCP connection with the obtained token
 */

import * as crypto from 'crypto';
import * as http from 'http';
import { URL } from 'url';

// Configuration
const CONFIG = {
  keycloak: {
    baseUrl: process.env.KEYCLOAK_URL || 'http://localhost:8080',
    realm: process.env.KEYCLOAK_REALM || 'mcp-demo',
    clientId: process.env.KEYCLOAK_CLIENT_ID || 'mcp-client',
  },
  mcp: {
    serverUrl: process.env.MCP_SERVER_URL || 'http://localhost:3001',
  },
  callback: {
    host: '127.0.0.1',
    port: 3000,
    path: '/callback',
  },
};

// PKCE utilities
function generateCodeVerifier(): string {
  return crypto.randomBytes(32).toString('base64url');
}

function generateCodeChallenge(verifier: string): string {
  return crypto.createHash('sha256').update(verifier).digest('base64url');
}

function generateState(): string {
  return crypto.randomBytes(16).toString('hex');
}

interface TokenResponse {
  access_token: string;
  token_type: string;
  expires_in: number;
  refresh_token?: string;
  scope?: string;
}

// Start a local server to receive the OAuth callback
async function startCallbackServer(
  expectedState: string,
  codeVerifier: string
): Promise<TokenResponse> {
  return new Promise((resolve, reject) => {
    const server = http.createServer(async (req, res) => {
      const url = new URL(req.url!, `http://${CONFIG.callback.host}:${CONFIG.callback.port}`);

      if (url.pathname === CONFIG.callback.path) {
        const code = url.searchParams.get('code');
        const state = url.searchParams.get('state');
        const error = url.searchParams.get('error');

        if (error) {
          const errorDescription = url.searchParams.get('error_description') || 'Unknown error';
          res.writeHead(400, { 'Content-Type': 'text/html' });
          res.end(`<h1>Authorization Error</h1><p>${error}: ${errorDescription}</p>`);
          server.close();
          reject(new Error(`Authorization error: ${error} - ${errorDescription}`));
          return;
        }

        if (!code || state !== expectedState) {
          res.writeHead(400, { 'Content-Type': 'text/html' });
          res.end('<h1>Invalid callback</h1><p>Missing code or state mismatch</p>');
          server.close();
          reject(new Error('Invalid callback: missing code or state mismatch'));
          return;
        }

        try {
          // Exchange authorization code for tokens
          const tokenUrl = `${CONFIG.keycloak.baseUrl}/realms/${CONFIG.keycloak.realm}/protocol/openid-connect/token`;

          const tokenResponse = await fetch(tokenUrl, {
            method: 'POST',
            headers: {
              'Content-Type': 'application/x-www-form-urlencoded',
            },
            body: new URLSearchParams({
              grant_type: 'authorization_code',
              client_id: CONFIG.keycloak.clientId,
              code,
              redirect_uri: `http://${CONFIG.callback.host}:${CONFIG.callback.port}${CONFIG.callback.path}`,
              code_verifier: codeVerifier,
            }),
          });

          if (!tokenResponse.ok) {
            const errorText = await tokenResponse.text();
            throw new Error(`Token exchange failed: ${tokenResponse.status} ${errorText}`);
          }

          const tokens = (await tokenResponse.json()) as TokenResponse;

          res.writeHead(200, { 'Content-Type': 'text/html' });
          res.end(`
            <html>
              <head><title>Authorization Successful</title></head>
              <body>
                <h1>✅ Authorization Successful!</h1>
                <p>You have been authenticated with Keycloak.</p>
                <p>You can close this window now.</p>
                <p><small>Access token obtained (expires in ${tokens.expires_in} seconds)</small></p>
              </body>
            </html>
          `);

          server.close();
          resolve(tokens);
        } catch (error) {
          res.writeHead(500, { 'Content-Type': 'text/html' });
          res.end(`<h1>Token Exchange Error</h1><p>${error}</p>`);
          server.close();
          reject(error);
        }
      } else {
        res.writeHead(404);
        res.end('Not found');
      }
    });

    server.listen(CONFIG.callback.port, CONFIG.callback.host, () => {
      console.log(`Callback server listening on http://${CONFIG.callback.host}:${CONFIG.callback.port}`);
    });

    // Timeout after 5 minutes
    setTimeout(() => {
      server.close();
      reject(new Error('Authorization timeout'));
    }, 5 * 60 * 1000);
  });
}

// Test MCP connection with the obtained token
async function testMcpConnection(accessToken: string): Promise<void> {
  console.log('\n🔌 Testing MCP connection...\n');

  // First, check the protected resource metadata
  console.log('1. Fetching protected resource metadata...');
  const metadataUrl = `${CONFIG.mcp.serverUrl}/.well-known/oauth-protected-resource`;
  const metadataResponse = await fetch(metadataUrl);

  if (metadataResponse.ok) {
    const metadata = await metadataResponse.json();
    console.log('   Protected Resource Metadata:', JSON.stringify(metadata, null, 2));
  } else {
    console.log('   Could not fetch protected resource metadata');
  }

  // Test the MCP endpoint
  console.log('\n2. Testing MCP endpoint with OAuth token...');

  // Initialize MCP session
  const initRequest = {
    jsonrpc: '2.0',
    id: 1,
    method: 'initialize',
    params: {
      protocolVersion: '2024-11-05',
      capabilities: {},
      clientInfo: {
        name: 'mcp-oauth-test-client',
        version: '1.0.0',
      },
    },
  };

  const initResponse = await fetch(`${CONFIG.mcp.serverUrl}/mcp`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${accessToken}`,
    },
    body: JSON.stringify(initRequest),
  });

  if (!initResponse.ok) {
    const errorText = await initResponse.text();
    console.error('   MCP initialization failed:', initResponse.status, errorText);
    return;
  }

  const sessionId = initResponse.headers.get('mcp-session-id');
  console.log(`   Session ID: ${sessionId}`);

  const initResult = await initResponse.json();
  console.log('   Initialize response:', JSON.stringify(initResult, null, 2));

  // Send initialized notification
  const initializedNotification = {
    jsonrpc: '2.0',
    method: 'notifications/initialized',
  };

  await fetch(`${CONFIG.mcp.serverUrl}/mcp`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${accessToken}`,
      'mcp-session-id': sessionId!,
    },
    body: JSON.stringify(initializedNotification),
  });

  // List available tools
  console.log('\n3. Listing available tools...');
  const listToolsRequest = {
    jsonrpc: '2.0',
    id: 2,
    method: 'tools/list',
  };

  const toolsResponse = await fetch(`${CONFIG.mcp.serverUrl}/mcp`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${accessToken}`,
      'mcp-session-id': sessionId!,
    },
    body: JSON.stringify(listToolsRequest),
  });

  const toolsResult = await toolsResponse.json();
  console.log('   Available tools:', JSON.stringify(toolsResult, null, 2));

  // Call the greet tool
  console.log('\n4. Calling the greet tool...');
  const callToolRequest = {
    jsonrpc: '2.0',
    id: 3,
    method: 'tools/call',
    params: {
      name: 'greet',
      arguments: {
        name: 'OAuth User',
      },
    },
  };

  const callToolResponse = await fetch(`${CONFIG.mcp.serverUrl}/mcp`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${accessToken}`,
      'mcp-session-id': sessionId!,
    },
    body: JSON.stringify(callToolRequest),
  });

  const callToolResult = await callToolResponse.json();
  console.log('   Tool result:', JSON.stringify(callToolResult, null, 2));

  console.log('\n✅ MCP connection test completed successfully!');
}

async function main() {
  console.log('\n🔐 MCP OAuth Test Client\n');
  console.log('Configuration:');
  console.log(`  Keycloak URL: ${CONFIG.keycloak.baseUrl}`);
  console.log(`  Realm: ${CONFIG.keycloak.realm}`);
  console.log(`  Client ID: ${CONFIG.keycloak.clientId}`);
  console.log(`  MCP Server: ${CONFIG.mcp.serverUrl}`);
  console.log('');

  // Generate PKCE values
  const codeVerifier = generateCodeVerifier();
  const codeChallenge = generateCodeChallenge(codeVerifier);
  const state = generateState();

  // Build authorization URL
  const authUrl = new URL(
    `${CONFIG.keycloak.baseUrl}/realms/${CONFIG.keycloak.realm}/protocol/openid-connect/auth`
  );
  authUrl.searchParams.set('client_id', CONFIG.keycloak.clientId);
  authUrl.searchParams.set('response_type', 'code');
  authUrl.searchParams.set('scope', 'openid profile email');
  authUrl.searchParams.set(
    'redirect_uri',
    `http://${CONFIG.callback.host}:${CONFIG.callback.port}${CONFIG.callback.path}`
  );
  authUrl.searchParams.set('state', state);
  authUrl.searchParams.set('code_challenge', codeChallenge);
  authUrl.searchParams.set('code_challenge_method', 'S256');

  console.log('Starting authorization flow with PKCE...\n');
  console.log('Please open this URL in your browser to authorize:\n');
  console.log(`  ${authUrl.toString()}\n`);

  // Try to open the browser automatically
  const { exec } = await import('child_process');
  const openCommand =
    process.platform === 'darwin'
      ? 'open'
      : process.platform === 'win32'
        ? 'start'
        : 'xdg-open';

  exec(`${openCommand} "${authUrl.toString()}"`, (error) => {
    if (error) {
      console.log('Could not open browser automatically. Please open the URL manually.');
    }
  });

  try {
    // Wait for the callback
    const tokens = await startCallbackServer(state, codeVerifier);

    console.log('\n✅ OAuth authorization successful!\n');
    console.log('Token Information:');
    console.log(`  Token Type: ${tokens.token_type}`);
    console.log(`  Expires In: ${tokens.expires_in} seconds`);
    console.log(`  Scope: ${tokens.scope || 'not specified'}`);
    console.log(`  Access Token: ${tokens.access_token.substring(0, 50)}...`);

    // Test MCP connection
    await testMcpConnection(tokens.access_token);
  } catch (error) {
    console.error('\n❌ Authorization failed:', error);
    process.exit(1);
  }
}

main();
