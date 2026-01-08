#!/bin/bash

# Get fresh token
echo "Getting access token..."
TOKEN_RESPONSE=$(curl -s -X POST "http://localhost:8080/realms/mcp-demo/protocol/openid-connect/token" \
  -H "Content-Type: application/x-www-form-urlencoded" \
  -d "grant_type=password&client_id=mcp-client&username=testuser&password=testpassword&scope=openid profile email")

ACCESS_TOKEN=$(echo "$TOKEN_RESPONSE" | jq -r '.access_token')

if [ "$ACCESS_TOKEN" == "null" ] || [ -z "$ACCESS_TOKEN" ]; then
  echo "Failed to get access token"
  echo "$TOKEN_RESPONSE"
  exit 1
fi

echo "Token obtained successfully!"
echo ""

# Test 1: Initialize
echo "=== Test 1: MCP Initialize ==="
INIT_RESPONSE=$(curl -s -X POST "http://localhost:3001/mcp" \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer $ACCESS_TOKEN" \
  -H "Accept: application/json, text/event-stream" \
  -D /tmp/mcp_headers.txt \
  -d '{"jsonrpc":"2.0","id":1,"method":"initialize","params":{"protocolVersion":"2024-11-05","capabilities":{},"clientInfo":{"name":"test-client","version":"1.0.0"}}}')

echo "Response:"
echo "$INIT_RESPONSE" | jq .

# Get session ID from headers
SESSION_ID=$(grep -i "mcp-session-id" /tmp/mcp_headers.txt | awk '{print $2}' | tr -d '\r')
echo ""
echo "Session ID: $SESSION_ID"

if [ -z "$SESSION_ID" ]; then
  echo "No session ID received"
  exit 1
fi

# Test 2: Send initialized notification
echo ""
echo "=== Test 2: Send Initialized Notification ==="
curl -s -X POST "http://localhost:3001/mcp" \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer $ACCESS_TOKEN" \
  -H "Accept: application/json, text/event-stream" \
  -H "mcp-session-id: $SESSION_ID" \
  -d '{"jsonrpc":"2.0","method":"notifications/initialized"}'
echo "Notification sent"

# Test 3: List tools
echo ""
echo "=== Test 3: List Tools ==="
TOOLS_RESPONSE=$(curl -s -X POST "http://localhost:3001/mcp" \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer $ACCESS_TOKEN" \
  -H "Accept: application/json, text/event-stream" \
  -H "mcp-session-id: $SESSION_ID" \
  -d '{"jsonrpc":"2.0","id":2,"method":"tools/list"}')

echo "$TOOLS_RESPONSE" | jq .

# Test 4: Call greet tool
echo ""
echo "=== Test 4: Call Greet Tool ==="
GREET_RESPONSE=$(curl -s -X POST "http://localhost:3001/mcp" \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer $ACCESS_TOKEN" \
  -H "Accept: application/json, text/event-stream" \
  -H "mcp-session-id: $SESSION_ID" \
  -d '{"jsonrpc":"2.0","id":3,"method":"tools/call","params":{"name":"greet","arguments":{"name":"OAuth User"}}}')

echo "$GREET_RESPONSE" | jq .

echo ""
echo "=== All tests completed! ==="
