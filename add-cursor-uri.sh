#!/bin/bash

TOKEN=$(curl -s -X POST "http://localhost:8080/realms/master/protocol/openid-connect/token" \
  -H "Content-Type: application/x-www-form-urlencoded" \
  -d "grant_type=password&client_id=admin-cli&username=admin&password=admin" | jq -r '.access_token')

CLIENT_UUID=$(curl -s "http://localhost:8080/admin/realms/mcp-demo/clients?clientId=mcp-client" \
  -H "Authorization: Bearer $TOKEN" | jq -r '.[0].id')

echo "Adding Cursor redirect URI..."
curl -s -X PUT "http://localhost:8080/admin/realms/mcp-demo/clients/$CLIENT_UUID" \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "clientId": "mcp-client",
    "enabled": true,
    "publicClient": true,
    "directAccessGrantsEnabled": true,
    "standardFlowEnabled": true,
    "redirectUris": [
      "http://localhost:*",
      "http://127.0.0.1:*",
      "https://localhost:*",
      "https://127.0.0.1:*",
      "https://vscode.dev/*",
      "https://vscode.dev/redirect",
      "cursor://anysphere.cursor-mcp/oauth/callback"
    ],
    "webOrigins": ["*"]
  }'

echo ""
echo "Done!"
