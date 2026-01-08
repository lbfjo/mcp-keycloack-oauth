# MCP Server with OAuth (Keycloak)

This project demonstrates how to implement an MCP (Model Context Protocol) server with OAuth 2.1 authentication using Keycloak as the authorization server.

## Architecture

```
┌─────────────────┐     ┌─────────────────┐     ┌─────────────────┐
│   MCP Client    │────>│   MCP Server    │────>│    Keycloak     │
│ (Claude, IDE)   │     │  (Resource)     │     │  (Auth Server)  │
└─────────────────┘     └─────────────────┘     └─────────────────┘
        │                                               │
        └───────────── OAuth 2.1 Flow ─────────────────┘
```

## Prerequisites

- Node.js 18+
- Docker and Docker Compose
- npm or yarn

## Quick Start

### 1. Install Dependencies

```bash
npm install
```

### 2. Start Keycloak

```bash
docker-compose up -d
```

Wait for Keycloak to be ready (usually 30-60 seconds). You can check the logs:

```bash
docker-compose logs -f keycloak
```

### 3. Configure Keycloak

Run the setup script to create the realm, clients, and test user:

```bash
npm run keycloak:setup
```

This creates:
- **Realm**: `mcp-demo`
- **Public Client**: `mcp-client` (for MCP clients like Claude Desktop)
- **Server Client**: `mcp-server` (for token validation)
- **Test User**: `testuser` / `testpassword`

### 4. Start the MCP Server

```bash
npm run dev
```

The server will start on `http://localhost:3001`.

### 5. Test the OAuth Flow

In a new terminal, run the test client:

```bash
npx tsx src/test-client.ts
```

This will:
1. Open your browser for Keycloak login
2. Complete the OAuth authorization code flow with PKCE
3. Exchange the code for tokens
4. Connect to the MCP server and call tools

## Endpoints

### MCP Server (http://localhost:3001)

| Endpoint | Method | Description |
|----------|--------|-------------|
| `/mcp` | POST | MCP JSON-RPC requests |
| `/mcp` | GET | SSE streaming |
| `/mcp` | DELETE | Session termination |
| `/.well-known/oauth-protected-resource` | GET | RFC 9728 metadata |
| `/health` | GET | Health check |

### Keycloak (http://localhost:8080)

| Endpoint | Description |
|----------|-------------|
| `/realms/mcp-demo/.well-known/openid-configuration` | OpenID Configuration |
| `/realms/mcp-demo/protocol/openid-connect/auth` | Authorization |
| `/realms/mcp-demo/protocol/openid-connect/token` | Token |
| `/realms/mcp-demo/protocol/openid-connect/certs` | JWKS |

## MCP Tools Available

The server exposes these tools:

- **greet**: Greets a user by name
- **whoami**: Returns session information

## OAuth Flow Details

This implementation follows the MCP OAuth specification:

1. **Discovery**: Client fetches `/.well-known/oauth-protected-resource` to find the authorization server
2. **Authorization**: Client redirects user to Keycloak with PKCE challenge
3. **Callback**: User authenticates, Keycloak redirects with authorization code
4. **Token Exchange**: Client exchanges code for access token (with PKCE verifier)
5. **API Access**: Client includes Bearer token in all MCP requests

## IDE Integration

### VS Code (Recommended - Native OAuth Support)

VS Code 1.102+ supports MCP OAuth natively. It will automatically:
1. Detect the 401 response from the MCP server
2. Discover the authorization server via `/.well-known/oauth-protected-resource`
3. Handle the OAuth flow with Keycloak

**Setup:**

1. Open this project in VS Code
2. The `.vscode/mcp.json` is already configured:

```json
{
  "servers": {
    "mcp-oauth-keycloak": {
      "type": "http",
      "url": "http://localhost:3001/mcp"
    }
  }
}
```

3. Open GitHub Copilot Chat (Ctrl+Shift+I / Cmd+Shift+I)
4. Click the MCP tools icon or type `@` to see available tools
5. VS Code will prompt you to authenticate with Keycloak
6. Login with `testuser` / `testpassword`

**Alternative: Global configuration**

Add to your user settings or use the command line:

```bash
code --add-mcp '{"name":"mcp-oauth-keycloak","type":"http","url":"http://localhost:3001/mcp"}'
```

### Claude Desktop

Add to your Claude Desktop config (`~/Library/Application Support/Claude/claude_desktop_config.json` on macOS):

```json
{
  "mcpServers": {
    "mcp-oauth-keycloak": {
      "url": "http://localhost:3001/mcp",
      "transport": "streamable-http"
    }
  }
}
```

Note: Claude Desktop OAuth support may vary. Check the latest documentation.

### Continue Extension

Add to your Continue config:

```json
{
  "models": [...],
  "mcpServers": [
    {
      "name": "mcp-oauth-keycloak",
      "url": "http://localhost:3001/mcp"
    }
  ]
}
```

## Configuration

Environment variables:

| Variable | Default | Description |
|----------|---------|-------------|
| `MCP_PORT` | `3001` | MCP server port |
| `MCP_SERVER_URL` | `http://localhost:3001` | Public URL of MCP server |
| `KEYCLOAK_URL` | `http://localhost:8080` | Keycloak base URL |
| `KEYCLOAK_REALM` | `mcp-demo` | Keycloak realm |
| `KEYCLOAK_CLIENT_ID` | `mcp-server` | Server client ID |

## Security Considerations

This is a **demo implementation**. For production:

1. Use HTTPS for all endpoints
2. Implement token refresh
3. Add rate limiting
4. Use proper secret management
5. Enable Keycloak production mode
6. Configure proper CORS policies
7. Implement token revocation

## Troubleshooting

### Keycloak not starting

```bash
docker-compose down -v
docker-compose up -d
```

### Token verification fails

1. Check Keycloak is running: `curl http://localhost:8080/health/ready`
2. Verify realm exists: `curl http://localhost:8080/realms/mcp-demo`
3. Check JWKS endpoint: `curl http://localhost:8080/realms/mcp-demo/protocol/openid-connect/certs`

### CORS errors

The MCP server allows all origins in dev mode. For production, configure specific origins.

## License

MIT
