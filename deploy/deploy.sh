#!/bin/bash
# Build and deploy script for Draw and Guess game
# Run this on your dev machine, then copy to server

set -e

echo "=== Building frontend ==="
cd "$(dirname "$0")/../client"
npm install
npm run build

echo "=== Building backend (release) ==="
cd "$(dirname "$0")/../server"
cargo build --release

echo "=== Preparing deployment package ==="
DEPLOY_DIR="$(dirname "$0")/deploy-package"
rm -rf "$DEPLOY_DIR"
mkdir -p "$DEPLOY_DIR/client"

# Copy binary
cp server/target/release/draw-and-guess "$DEPLOY_DIR/"

# Copy static files (goes under client/dist/)
cp -r client/dist "$DEPLOY_DIR/client/"

# Copy systemd unit
cp deploy/draw-and-guess.service "$DEPLOY_DIR/"

echo "=== Done ==="
echo "Deployment package ready at: $DEPLOY_DIR"
echo ""
echo "Next steps on your server:"
echo "  1. scp -r $DEPLOY_DIR/* user@your-server:/opt/draw-and-guess/"
echo "  2. sudo cp /opt/draw-and-guess/draw-and-guess.service /etc/systemd/system/"
echo "  3. sudo systemctl daemon-reload"
echo "  4. sudo systemctl enable --now draw-and-guess"
echo ""
echo "Directory structure on server:"
echo "  /opt/draw-and-guess/"
echo "  ├── draw-and-guess        (binary)"
echo "  ├── draw-and-guess.service (systemd unit)"
echo "  └── client/"
echo "      └── dist/"
echo "          ├── index.html"
echo "          └── assets/"
