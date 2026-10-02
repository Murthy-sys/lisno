#!/bin/bash

set -e

cd "$HOME"

# ============================================================
# Lisno AI Estimator Sync
#
# SOURCE:
#   Production MongoDB (READ ONLY)
#
# TARGET:
#   Local lisno_demo
#
# IMPORTANT:
#   - Never writes to production
#   - Never modifies local lisno
#   - Never drops lisno_demo database
#   - Only replaces aiEstimatorKnowledge* collections
# ============================================================

SOURCE_URI="$(security find-generic-password -a "$USER" -s "lisno-prod-mongo-uri" -w)"≈
TARGET_URI="mongodb://127.0.0.1:27017/lisno_demo"

BACKUP_DIR="$HOME/lisno-estimator-daily-sync"
SOURCE_DIR="$BACKUP_DIR/lisno"

COLLECTIONS=(
  aiEstimatorKnowledgeBasketQualityRevisions
  aiEstimatorKnowledgeBaskets
  aiEstimatorKnowledgeDisplayOrderSequences
  aiEstimatorKnowledgeMainLines
  aiEstimatorKnowledgeModes
  aiEstimatorKnowledgePriceVersions
  aiEstimatorKnowledgePriorities
  aiEstimatorKnowledgeQualityControlOptions
  aiEstimatorKnowledgeRevisions
  aiEstimatorKnowledgeSections
  aiEstimatorKnowledgeSubBaskets
  aiEstimatorKnowledgeSurfaces
  aiEstimatorKnowledgeTaxRules
  aiEstimatorKnowledgeTaxVersions
  aiEstimatorKnowledgeUoms
  aiEstimatorKnowledgeVendors
)

echo "========================================"
echo "Lisno AI Estimator Sync"
echo "$(date)"
echo "========================================"

# ------------------------------------------------------------
# Safety check
# ------------------------------------------------------------

if [ -z "$SOURCE_URI" ]; then
  echo "ERROR: MONGO_PROD_URI is not set."
  exit 1
fi

# ------------------------------------------------------------
# Prepare temporary dump directory
# ------------------------------------------------------------

rm -rf "$SOURCE_DIR"
mkdir -p "$SOURCE_DIR"

# ------------------------------------------------------------
# Step 1: READ ONLY from Production
# ------------------------------------------------------------

echo ""
echo "1. Reading AI Estimator data from Production..."

for collection in "${COLLECTIONS[@]}"
do
  echo ""
  echo "  Dumping: $collection"

  mongodump \
    --uri="$SOURCE_URI" \
    --db=lisno \
    --collection="$collection" \
    --out="$BACKUP_DIR"
done

echo ""
echo "Production dump completed."

# ------------------------------------------------------------
# Step 2: Replace ONLY the 16 estimator collections
# ------------------------------------------------------------

echo ""
echo "2. Updating ONLY AI Estimator collections in lisno_demo..."

for collection in "${COLLECTIONS[@]}"
do
  echo ""
  echo "  Updating: $collection"

  # Drop ONLY this collection.
  # The lisno_demo database itself is NEVER dropped.
  mongosh "$TARGET_URI" --quiet --eval \
    "db.getCollection('$collection').drop()"

  # Restore ONLY this collection.
  mongorestore \
    --uri="$TARGET_URI" \
    --db=lisno_demo \
    --collection="$collection" \
    "$SOURCE_DIR/$collection.bson"
done

# ------------------------------------------------------------
# Step 3: Verify
# ------------------------------------------------------------

echo ""
echo "3. Verifying AI Estimator collections..."

mongosh "$TARGET_URI" --quiet --eval '
db.getCollectionNames()
  .filter(name => name.startsWith("aiEstimatorKnowledge"))
  .sort()
  .forEach(name =>
    print(name + " = " + db.getCollection(name).countDocuments())
  )
'

echo ""
echo "========================================"
echo "Estimator sync completed successfully"
echo "$(date)"
echo "========================================"
