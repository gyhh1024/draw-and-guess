#!/bin/bash
# Build and deploy Draw and Guess (Python + FastAPI) to Linux server
set -e

cd "$(dirname "$0")/.."

echo "=== 1. Building frontend ==="
cd client
npm install
npm run build
cd ..

echo "=== 2. Preparing server-python package ==="
DEPLOY_DIR="deploy/deploy-package"
rm -rf "$DEPLOY_DIR"
mkdir -p "$DEPLOY_DIR"

# Python server
cp -r server-python/*.py "$DEPLOY_DIR/"
cp -r server-python/requirements.txt "$DEPLOY_DIR/"

# Client static files
mkdir -p "$DEPLOY_DIR/client/dist"
cp -r client/dist/* "$DEPLOY_DIR/client/dist/"

# systemd service
cp deploy/draw-and-guess-python.service "$DEPLOY_DIR/"

# Remove test files and dev artifacts
rm -f "$DEPLOY_DIR/tests"/*.py 2>/dev/null || true
rmdir "$DEPLOY_DIR/tests" 2>/dev/null || true
rm -f "$DEPLOY_DIR/*.db" 2>/dev/null || true

echo ""
echo "=== Done ==="
echo "Package ready at: $DEPLOY_DIR"
echo ""
echo "=== Deploy to server ==="
echo "  1. Copy files:"
echo "     scp -r $DEPLOY_DIR/* user@your-server:/home/admin/draw-and-guess/"
echo ""
echo "  2. SSH into server and run setup:"
echo "     ssh user@your-server"
echo "     cd /home/admin/draw-and-guess"
echo "     bash setup.sh"
echo ""
echo "  Or deploy via git:"
echo "     cd /home/admin"
echo "     git clone https://github.com/gyhh1024/draw-and-guess.git"
echo "     cd draw-and-guess"
echo "     bash deploy/setup-server.sh"
