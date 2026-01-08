#!/bin/bash
TOKEN=$(curl -s -X POST "http://localhost:8080/realms/master/protocol/openid-connect/token" \
  -H "Content-Type: application/x-www-form-urlencoded" \
  -d "grant_type=password&client_id=admin-cli&username=admin&password=admin" | jq -r '.access_token')

echo "Current redirect URIs for mcp-client:"
curl -s "http://localhost:8080/admin/realms/mcp-demo/clients?clientId=mcp-client" \
  -H "Authorization: Bearer $TOKEN" | jq '.[0].redirectUris'
