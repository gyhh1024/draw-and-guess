#!/bin/bash
# Run this on the server after git clone: bash deploy/setup-server.sh
set -e

PROJECT_DIR="/home/admin/draw-and-guess"

echo "=== 1. Setup Python virtual environment ==="
python3 -m venv "$PROJECT_DIR/venv"
$PROJECT_DIR/venv/bin/pip install -r "$PROJECT_DIR/server-python/requirements.txt"

echo ""
echo "=== 2. Fix npm registry (remove private repo) ==="
npm config set registry https://registry.npmjs.org/

echo ""
echo "=== 3. Build frontend ==="
cd "$PROJECT_DIR/client"
npm install
npm run build

echo ""
echo "=== 4. Install systemd service ==="
sudo cp "$PROJECT_DIR/deploy/draw-and-guess-python.service" /etc/systemd/system/
sudo systemctl daemon-reload
sudo systemctl enable --now draw-and-guess-python

echo ""
echo "=== Done ==="
echo "Check status: sudo systemctl status draw-and-guess-python"
echo "Visit: https://yysls-draw-and-guess.site"
echo "Admin: https://yysls-draw-and-guess.site/#/admin"
echo ""
echo "Remember to set ADMIN_PASSWORD in /etc/systemd/system/draw-and-guess-python.service"
echo "  then: sudo systemctl daemon-reload && sudo systemctl restart draw-and-guess-python"
