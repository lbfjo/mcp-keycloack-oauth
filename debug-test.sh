#!/bin/bash

# Get fresh token
TOKEN_RESPONSE=$(curl -s -X POST "http://localhost:8080/realms/mcp-demo/protocol/openid-connect/token" \
  -H "Content-Type: application/x-www-form-urlencoded" \
  -d "grant_type=password&client_id=mcp-client&username=testuser&password=testpassword&scope=openid profile email")

ACCESS_TOKEN=$(echo "$TOKEN_RESPONSE" | jq -r '.access_token')
echo "Token obtained: ${ACCESS_TOKEN:0:30}..."
echo ""

echo "=== Initialize with verbose output ==="
curl -v -X POST "http://localhost:3001/mcp" \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer $ACCESS_TOKEN" \
  -H "Accept: application/json, text/event-stream" \
  -d '{"jsonrpc":"2.0","id":1,"method":"initialize","params":{"protocolVersion":"2024-11-05","capabilities":{},"clientInfo":{"name":"test","version":"1.0.0"}}}' 2>&1
