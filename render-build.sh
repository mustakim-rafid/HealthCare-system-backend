set -o errexit

npm ci --include=dev
npx prisma generate
npm run build
# Additive, idempotent migrations only (never drops data)
npx prisma migrate deploy
# Idempotent demo seed (creates missing demo doctor/patient/slots only; never overwrites).
# Set SEED_DEMO_DATA=false in the environment to skip it.
if [ "${SEED_DEMO_DATA:-true}" != "false" ]; then npm run seed || echo "Seed skipped/failed (non-fatal)"; fi
