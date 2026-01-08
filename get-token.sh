#!/bin/bash

# Get a fresh token from Keycloak
TOKEN=$(curl -s -X POST "http://localhost:8080/realms/mcp-demo/protocol/openid-connect/token" \
  -H "Content-Type: application/x-www-form-urlencoded" \
  -d "grant_type=password&client_id=mcp-client&username=testuser&password=testpassword&scope=openid profile email" | jq -r '.access_token')

if [ "$TOKEN" == "null" ] || [ -z "$TOKEN" ]; then
  echo "Failed to get token. Is Keycloak running?"
  exit 1
fi

echo "Fresh token (expires in 5 minutes):"
echo ""
echo "$TOKEN"
echo ""
echo "Update .cursor/mcp.json with:"
echo ""
echo "\"Authorization\": \"Bearer $TOKEN\""
