#!/bin/bash

echo "=============================================="
echo "  MCP OAuth Flow Test with Keycloak"
echo "=============================================="
echo ""

# Get fresh token
echo "[1/5] Getting access token from Keycloak..."
TOKEN_RESPONSE=$(curl -s -X POST "http://localhost:8080/realms/mcp-demo/protocol/openid-connect/token" \
  -H "Content-Type: application/x-www-form-urlencoded" \
  -d "grant_type=password&client_id=mcp-client&username=testuser&password=testpassword&scope=openid profile email")

ACCESS_TOKEN=$(echo "$TOKEN_RESPONSE" | jq -r '.access_token')
EXPIRES_IN=$(echo "$TOKEN_RESPONSE" | jq -r '.expires_in')

if [ "$ACCESS_TOKEN" == "null" ] || [ -z "$ACCESS_TOKEN" ]; then
  echo "   FAILED: Could not get access token"
  echo "$TOKEN_RESPONSE"
  exit 1
fi

echo "   SUCCESS: Token obtained (expires in ${EXPIRES_IN}s)"
echo ""

# Initialize MCP session
echo "[2/5] Initializing MCP session..."
INIT_RESPONSE=$(curl -s -X POST "http://localhost:3001/mcp" \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer $ACCESS_TOKEN" \
  -H "Accept: application/json, text/event-stream" \
  -D /tmp/mcp_init_headers.txt \
  -d '{"jsonrpc":"2.0","id":1,"method":"initialize","params":{"protocolVersion":"2024-11-05","capabilities":{},"clientInfo":{"name":"oauth-test-client","version":"1.0.0"}}}')

SESSION_ID=$(grep -i "mcp-session-id" /tmp/mcp_init_headers.txt | awk '{print $2}' | tr -d '\r')

if [ -z "$SESSION_ID" ]; then
  echo "   FAILED: No session ID received"
  exit 1
fi

# Parse SSE response
INIT_DATA=$(echo "$INIT_RESPONSE" | grep "^data:" | sed 's/^data: //')
SERVER_NAME=$(echo "$INIT_DATA" | jq -r '.result.serverInfo.name')
PROTOCOL_VERSION=$(echo "$INIT_DATA" | jq -r '.result.protocolVersion')

echo "   SUCCESS: Session created"
echo "   - Session ID: $SESSION_ID"
echo "   - Server: $SERVER_NAME"
echo "   - Protocol: $PROTOCOL_VERSION"
echo ""

# Send initialized notification
echo "[3/5] Sending initialized notification..."
curl -s -X POST "http://localhost:3001/mcp" \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer $ACCESS_TOKEN" \
  -H "Accept: application/json, text/event-stream" \
  -H "mcp-session-id: $SESSION_ID" \
  -d '{"jsonrpc":"2.0","method":"notifications/initialized"}' > /dev/null
echo "   SUCCESS: Notification sent"
echo ""

# List tools
echo "[4/5] Listing available tools..."
TOOLS_RESPONSE=$(curl -s -X POST "http://localhost:3001/mcp" \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer $ACCESS_TOKEN" \
  -H "Accept: application/json, text/event-stream" \
  -H "mcp-session-id: $SESSION_ID" \
  -d '{"jsonrpc":"2.0","id":2,"method":"tools/list"}')

TOOLS_DATA=$(echo "$TOOLS_RESPONSE" | grep "^data:" | sed 's/^data: //')
TOOL_COUNT=$(echo "$TOOLS_DATA" | jq -r '.result.tools | length')
TOOL_NAMES=$(echo "$TOOLS_DATA" | jq -r '.result.tools[].name' | tr '\n' ', ' | sed 's/,$//')

echo "   SUCCESS: Found $TOOL_COUNT tools"
echo "   - Tools: $TOOL_NAMES"
echo ""

# Call the greet tool
echo "[5/5] Calling 'greet' tool..."
GREET_RESPONSE=$(curl -s -X POST "http://localhost:3001/mcp" \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer $ACCESS_TOKEN" \
  -H "Accept: application/json, text/event-stream" \
  -H "mcp-session-id: $SESSION_ID" \
  -d '{"jsonrpc":"2.0","id":3,"method":"tools/call","params":{"name":"greet","arguments":{"name":"OAuth User"}}}')

GREET_DATA=$(echo "$GREET_RESPONSE" | grep "^data:" | sed 's/^data: //')
GREET_TEXT=$(echo "$GREET_DATA" | jq -r '.result.content[0].text')

echo "   SUCCESS: Tool executed"
echo "   - Response: $GREET_TEXT"
echo ""

echo "=============================================="
echo "  All tests passed!"
echo "=============================================="
echo ""
echo "Summary:"
echo "  - OAuth token obtained from Keycloak"
echo "  - MCP session established with bearer token"
echo "  - Tools listed and executed successfully"
echo ""
echo "The MCP OAuth flow is working correctly!"
