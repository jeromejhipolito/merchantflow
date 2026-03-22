#!/usr/bin/env bash
# =============================================================================
# MerchantFlow — Migration Rollback Script
# =============================================================================
# Usage:
#   ./prisma/rollback.sh <migration_number>
#
# Examples:
#   ./prisma/rollback.sh 7    # Rollback outbox_events
#   ./prisma/rollback.sh 5    # Rollback webhook system (also rolls back 6, 7)
#   ./prisma/rollback.sh all  # Rollback everything (nuclear option)
#
# This script runs rollback.sql files in REVERSE order from the specified
# migration down to migration 1. It does NOT update the _prisma_migrations
# table — after rolling back, you should run `prisma migrate resolve` or
# `prisma migrate deploy` to reconcile state.
# =============================================================================

set -euo pipefail

DATABASE_URL="${DATABASE_URL:-postgresql://merchantflow:merchantflow_dev@localhost:5432/merchantflow}"
MIGRATIONS_DIR="$(dirname "$0")/migrations"

# All migrations in order
MIGRATIONS=(
  "20260330000001_create_stores"
  "20260330000002_create_products"
  "20260330000003_create_orders_and_line_items"
  "20260330000004_create_shipments"
  "20260330000005_create_webhook_system"
  "20260330000006_create_idempotency_keys"
  "20260330000007_create_outbox_events"
)

if [ $# -eq 0 ]; then
  echo "Usage: ./prisma/rollback.sh <migration_number|all>"
  echo ""
  echo "Available migrations:"
  for i in "${!MIGRATIONS[@]}"; do
    echo "  $((i + 1)). ${MIGRATIONS[$i]}"
  done
  exit 1
fi

TARGET="$1"

if [ "$TARGET" = "all" ]; then
  START=0
else
  START=$((TARGET - 1))
fi

TOTAL=${#MIGRATIONS[@]}

echo "=== MerchantFlow Migration Rollback ==="
echo ""

# Rollback in reverse order from the last migration down to the target
for ((i = TOTAL - 1; i >= START; i--)); do
  MIGRATION="${MIGRATIONS[$i]}"
  ROLLBACK_FILE="$MIGRATIONS_DIR/$MIGRATION/rollback.sql"

  if [ -f "$ROLLBACK_FILE" ]; then
    echo "Rolling back: $MIGRATION"
    psql "$DATABASE_URL" -f "$ROLLBACK_FILE"
    echo "  ✓ Done"
  else
    echo "  ⚠ No rollback.sql found for $MIGRATION, skipping"
  fi
done

echo ""
echo "=== Rollback complete ==="
echo ""
echo "Next steps:"
echo "  1. Delete rolled-back entries from _prisma_migrations table"
echo "  2. Run 'prisma migrate deploy' to re-apply if needed"
