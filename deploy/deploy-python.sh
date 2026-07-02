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
echo "     scp -r $DEPLOY_DIR/* user@your-server:/opt/draw-and-guess/"
echo ""
echo "  2. SSH into server:"
echo "     ssh user@your-server"
echo ""
echo "  3. Install dependencies:"
echo "     cd /opt/draw-and-guess"
echo "     python3 -m venv venv"
echo "     venv/bin/pip install -r requirements.txt"
echo ""
echo "  4. Edit service file to set config:"
echo "     sudo vi /etc/systemd/system/draw-and-guess-python.service"
echo "     # Set PUBLIC_URL to your domain (e.g. https://game.example.com)"
echo "     # Set ADMIN_PASSWORD to a strong password"
echo ""
echo "  5. Install systemd service:"
echo "     sudo cp draw-and-guess-python.service /etc/systemd/system/"
echo "     sudo systemctl daemon-reload"
echo "     sudo systemctl enable --now draw-and-guess-python"
echo ""
echo "  6. Admin panel:"
echo "     http://your-server/#/admin"
echo "     Login with ADMIN_PASSWORD (default: admin)"
echo ""
echo "  7. Check status:"
echo "     sudo systemctl status draw-and-guess-python"
echo "     curl http://localhost:3000/health"
