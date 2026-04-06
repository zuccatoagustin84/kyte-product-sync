#!/usr/bin/env bash
# configure-supabase-auth.sh
# Configures Supabase redirect URLs for Google OAuth callback.
# Usage: SUPABASE_ACCESS_TOKEN=sbp_... bash configure-supabase-auth.sh

set -euo pipefail

TOKEN="${SUPABASE_ACCESS_TOKEN:?Set SUPABASE_ACCESS_TOKEN first}"
API="https://api.supabase.com/v1"

# Project IDs
PROD_PROJECT="knxqeebtynqchhwdmxae"
STAGING_PROJECT="tlecvwxzkszgjpucpdij"

PROD_SITE_URL="https://store-lyart-delta.vercel.app"
STAGING_SITE_URL="https://store-lyart-delta.vercel.app"  # Vercel preview URLs vary

echo "=== Configuring Supabase Auth redirect URLs ==="
echo ""

for PROJECT in "$PROD_PROJECT" "$STAGING_PROJECT"; do
  if [ "$PROJECT" = "$PROD_PROJECT" ]; then
    LABEL="PRODUCCIÓN"
  else
    LABEL="STAGING"
  fi

  echo "--- $LABEL ($PROJECT) ---"

  # Get current auth config
  echo "Fetching current config..."
  CURRENT=$(curl -sf -H "Authorization: Bearer $TOKEN" "$API/projects/$PROJECT/config/auth")

  if [ -z "$CURRENT" ]; then
    echo "ERROR: Could not fetch config for $PROJECT. Check your token."
    continue
  fi

  # Extract current redirect URLs
  CURRENT_URIS=$(echo "$CURRENT" | python3 -c "
import sys, json
cfg = json.load(sys.stdin)
print(cfg.get('EXTERNAL_REDIRECT_URLS', '') or '')
" 2>/dev/null || echo "")

  echo "Current redirect URLs: ${CURRENT_URIS:-<none>}"

  # Build new redirect URLs list
  # We need these callback URLs to be allowed:
  NEW_URLS=""
  NEEDED_URLS=(
    "https://store-lyart-delta.vercel.app/auth/callback"
    "https://*.vercel.app/auth/callback"
    "http://localhost:3000/auth/callback"
  )

  # Start with existing URLs
  if [ -n "$CURRENT_URIS" ]; then
    NEW_URLS="$CURRENT_URIS"
  fi

  CHANGED=false
  for URL in "${NEEDED_URLS[@]}"; do
    if [[ "$NEW_URLS" != *"$URL"* ]]; then
      if [ -n "$NEW_URLS" ]; then
        NEW_URLS="${NEW_URLS},${URL}"
      else
        NEW_URLS="$URL"
      fi
      CHANGED=true
      echo "  + Adding: $URL"
    else
      echo "  ✓ Already present: $URL"
    fi
  done

  if [ "$CHANGED" = false ]; then
    echo "No changes needed."
    echo ""
    continue
  fi

  # Update auth config
  echo "Updating redirect URLs..."
  RESULT=$(curl -sf -X PATCH \
    -H "Authorization: Bearer $TOKEN" \
    -H "Content-Type: application/json" \
    -d "{\"EXTERNAL_REDIRECT_URLS\": \"$NEW_URLS\"}" \
    "$API/projects/$PROJECT/config/auth")

  if [ $? -eq 0 ]; then
    echo "✓ Updated successfully!"
  else
    echo "ERROR: Failed to update. Response: $RESULT"
  fi

  # Check if Google provider is enabled
  echo ""
  echo "Checking Google OAuth provider..."
  GOOGLE_ENABLED=$(echo "$CURRENT" | python3 -c "
import sys, json
cfg = json.load(sys.stdin)
enabled = cfg.get('EXTERNAL_GOOGLE_ENABLED', False)
print('true' if enabled else 'false')
" 2>/dev/null || echo "unknown")

  if [ "$GOOGLE_ENABLED" = "true" ]; then
    echo "✓ Google OAuth is enabled"
  elif [ "$GOOGLE_ENABLED" = "false" ]; then
    echo "⚠ Google OAuth is DISABLED! Enable it in the Supabase dashboard:"
    echo "  https://supabase.com/dashboard/project/$PROJECT/auth/providers"
    echo "  You need a Google Cloud OAuth Client ID and Secret."
  else
    echo "? Could not determine Google OAuth status"
  fi

  echo ""
done

echo "=== Done ==="
echo ""
echo "Next steps:"
echo "1. If Google OAuth is disabled on any project, enable it in the Supabase dashboard"
echo "2. In Google Cloud Console, add these authorized redirect URIs:"
echo "   - https://${PROD_PROJECT}.supabase.co/auth/v1/callback"
echo "   - https://${STAGING_PROJECT}.supabase.co/auth/v1/callback"
echo "3. Deploy the branch and test login at the preview URL"
