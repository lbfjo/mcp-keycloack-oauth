import express, { Request, Response, NextFunction } from 'express';
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { StreamableHTTPServerTransport } from '@modelcontextprotocol/sdk/server/streamableHttp.js';
import { z } from 'zod';
import * as jose from 'jose';
import cors from 'cors';

// Configuration
const CONFIG = {
  port: parseInt(process.env.MCP_PORT || '3001'),
  keycloak: {
    baseUrl: process.env.KEYCLOAK_URL || 'http://localhost:8080',
    realm: process.env.KEYCLOAK_REALM || 'mcp-demo',
    clientId: process.env.KEYCLOAK_CLIENT_ID || 'mcp-server',
  },
  mcpServerUrl: process.env.MCP_SERVER_URL || 'http://localhost:3001',
};

// Keycloak JWKS for token verification
let jwks: jose.JWTVerifyGetKey;

async function initializeJwks() {
  const jwksUrl = `${CONFIG.keycloak.baseUrl}/realms/${CONFIG.keycloak.realm}/protocol/openid-connect/certs`;
  console.log(`Fetching JWKS from: ${jwksUrl}`);

  try {
    jwks = jose.createRemoteJWKSet(new URL(jwksUrl));
    console.log('JWKS initialized successfully');
  } catch (error) {
    console.error('Failed to initialize JWKS:', error);
    throw error;
  }
}

// Token verification using Keycloak
async function verifyAccessToken(token: string): Promise<{ valid: boolean; payload?: jose.JWTPayload; error?: string }> {
  try {
    const { payload } = await jose.jwtVerify(token, jwks, {
      issuer: `${CONFIG.keycloak.baseUrl}/realms/${CONFIG.keycloak.realm}`,
    });

    // Verify the audience includes our client or the token is for this resource
    const aud = Array.isArray(payload.aud) ? payload.aud : [payload.aud];
    const azp = payload.azp as string | undefined;

    // Accept if client_id matches or if token was issued for this resource
    if (!aud.includes(CONFIG.keycloak.clientId) &&
        !aud.includes('account') &&
        azp !== CONFIG.keycloak.clientId) {
      console.log('Token audience/azp mismatch:', { aud, azp, expected: CONFIG.keycloak.clientId });
      // For development, we'll be lenient with audience validation
    }

    return { valid: true, payload };
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    console.error('Token verification failed:', errorMessage);
    return { valid: false, error: errorMessage };
  }
}

// OAuth middleware for protecting MCP endpoints
async function oauthMiddleware(req: Request, res: Response, next: NextFunction) {
  console.log(`[oauthMiddleware] Received request: ${req.method} ${req.path}`);
  console.log(`[oauthMiddleware] Headers: ${JSON.stringify(req.headers, null, 2)}`);

  const authHeader = req.headers.authorization;

  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    // Return 401 with WWW-Authenticate header per MCP spec
    const resourceMetadataUrl = `${CONFIG.mcpServerUrl}/.well-known/oauth-protected-resource`;
    res.set('WWW-Authenticate', `Bearer resource_metadata="${resourceMetadataUrl}"`);
    return res.status(401).json({
      error: 'unauthorized',
      error_description: 'Missing or invalid Authorization header'
    });
  }

  const token = authHeader.substring(7);
  const result = await verifyAccessToken(token);

  if (!result.valid) {
    const resourceMetadataUrl = `${CONFIG.mcpServerUrl}/.well-known/oauth-protected-resource`;
    res.set('WWW-Authenticate', `Bearer resource_metadata="${resourceMetadataUrl}", error="invalid_token", error_description="${result.error}"`);
    return res.status(401).json({
      error: 'invalid_token',
      error_description: result.error
    });
  }

  // Attach user info to request
  (req as any).user = result.payload;
  next();
}

// Create MCP Server
function createMcpServer() {
  const server = new McpServer({
    name: 'mcp-oauth-keycloak-server',
    version: '1.0.0',
  });

  // Register a simple greeting tool
  server.tool(
    'greet',
    'Greets the user by name',
    {
      name: z.string().describe('The name to greet'),
    },
    async ({ name }) => {
      return {
        content: [
          {
            type: 'text',
            text: `Hello, ${name}! Welcome to the OAuth-protected MCP server.`,
          },
        ],
      };
    }
  );

  // Register a tool that shows the authenticated user
  server.tool(
    'whoami',
    'Returns information about the authenticated user',
    {},
    async (_args, extra) => {
      // Access user info from the session context
      const sessionId = extra.sessionId;
      return {
        content: [
          {
            type: 'text',
            text: `Session ID: ${sessionId}\nThis request was authenticated via OAuth with Keycloak.`,
          },
        ],
      };
    }
  );

  // Register a resource
  server.resource(
    'server-info',
    'mcp://server/info',
    async () => ({
      contents: [
        {
          uri: 'mcp://server/info',
          mimeType: 'application/json',
          text: JSON.stringify({
            name: 'MCP OAuth Demo Server',
            version: '1.0.0',
            oauth: {
              provider: 'Keycloak',
              realm: CONFIG.keycloak.realm,
            },
          }, null, 2),
        },
      ],
    })
  );

  // Register a prompt
  server.prompt(
    'oauth-test',
    'A test prompt for the OAuth-protected server',
    async () => ({
      messages: [
        {
          role: 'user',
          content: {
            type: 'text',
            text: 'You are connected to an OAuth-protected MCP server using Keycloak. The connection is secure.',
          },
        },
      ],
    })
  );

  return server;
}

// Main application setup
async function main() {
  const app = express();

  // Enable CORS for all origins (required for MCP clients like Cursor)
  app.use(cors({
    origin: '*',
    methods: ['GET', 'POST', 'DELETE', 'OPTIONS'],
    allowedHeaders: ['Content-Type', 'Authorization', 'mcp-session-id', 'Accept'],
    exposedHeaders: ['mcp-session-id', 'WWW-Authenticate'],
  }));

  app.use(express.json());

  // Initialize JWKS for token verification
  try {
    await initializeJwks();
  } catch (error) {
    console.warn('Warning: Could not initialize JWKS. Starting server anyway...');
    console.warn('Make sure Keycloak is running and the realm is configured.');
  }

  const mcpServer = createMcpServer();
  const transports = new Map<string, StreamableHTTPServerTransport>();

  // RFC 9728: Protected Resource Metadata endpoint
  app.get('/.well-known/oauth-protected-resource', (req, res) => {
    res.json({
      resource: `${CONFIG.mcpServerUrl}/mcp`,
      authorization_servers: [
        `${CONFIG.keycloak.baseUrl}/realms/${CONFIG.keycloak.realm}`
      ],
      scopes_supported: ['openid', 'profile', 'email'],
      bearer_methods_supported: ['header'],
      resource_documentation: 'https://modelcontextprotocol.io/specification/draft/basic/authorization',
    });
  });

  // Health check endpoint (unprotected)
  app.get('/health', (req, res) => {
    res.json({ status: 'ok', timestamp: new Date().toISOString() });
  });

  // MCP endpoint - POST for requests
  app.post('/mcp', oauthMiddleware, async (req, res) => {
    const sessionId = req.headers['mcp-session-id'] as string | undefined;

    let transport = sessionId ? transports.get(sessionId) : undefined;

    if (!transport) {
      // Create new transport for this session
      transport = new StreamableHTTPServerTransport({
        sessionIdGenerator: () => crypto.randomUUID(),
        onsessioninitialized: (newSessionId) => {
          transports.set(newSessionId, transport!);
          console.log(`New session initialized: ${newSessionId}`);
        },
      });

      // Connect the transport to the MCP server
      await mcpServer.connect(transport);
    }

    // Handle the request
    await transport.handleRequest(req, res, req.body);
  });

  // MCP endpoint - GET for SSE streaming
  app.get('/mcp', oauthMiddleware, async (req, res) => {
    const sessionId = req.headers['mcp-session-id'] as string;

    if (!sessionId) {
      return res.status(400).json({ error: 'Missing mcp-session-id header' });
    }

    const transport = transports.get(sessionId);

    if (!transport) {
      return res.status(404).json({ error: 'Session not found' });
    }

    await transport.handleRequest(req, res);
  });

  // MCP endpoint - DELETE for session termination
  app.delete('/mcp', oauthMiddleware, async (req, res) => {
    const sessionId = req.headers['mcp-session-id'] as string;

    if (!sessionId) {
      return res.status(400).json({ error: 'Missing mcp-session-id header' });
    }

    const transport = transports.get(sessionId);

    if (transport) {
      await transport.close();
      transports.delete(sessionId);
      console.log(`Session terminated: ${sessionId}`);
    }

    res.status(204).send();
  });

  // Start the server
  app.listen(CONFIG.port, () => {
    console.log(`\n🚀 MCP OAuth Server started!`);
    console.log(`   Server URL: ${CONFIG.mcpServerUrl}`);
    console.log(`   MCP endpoint: ${CONFIG.mcpServerUrl}/mcp`);
    console.log(`   Health check: ${CONFIG.mcpServerUrl}/health`);
    console.log(`\n📋 OAuth Configuration:`);
    console.log(`   Keycloak URL: ${CONFIG.keycloak.baseUrl}`);
    console.log(`   Realm: ${CONFIG.keycloak.realm}`);
    console.log(`   Client ID: ${CONFIG.keycloak.clientId}`);
    console.log(`\n📄 Protected Resource Metadata:`);
    console.log(`   ${CONFIG.mcpServerUrl}/.well-known/oauth-protected-resource`);
    console.log(`\n🔑 Keycloak OpenID Configuration:`);
    console.log(`   ${CONFIG.keycloak.baseUrl}/realms/${CONFIG.keycloak.realm}/.well-known/openid-configuration`);
  });
}

main().catch(console.error);
