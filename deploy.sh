#!/bin/bash
set -e

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"

echo "Deploying Vibehub..."

# Stop the service if running
echo "Stopping vibehub service..."
sudo systemctl stop vibehub || true

# Create symlink to /opt/vibehub
echo "Creating /opt/vibehub symlink..."
sudo ln -sfn "$SCRIPT_DIR" /opt/vibehub

# Install systemd service
echo "Installing systemd service..."
sudo ln -sf /opt/vibehub/vibehub.service /etc/systemd/system/vibehub.service
sudo systemctl daemon-reload
sudo systemctl enable vibehub

# Start the service
echo "Starting vibehub service..."
sudo systemctl start vibehub

# Show status
echo ""
echo "Deployment complete! Status:"
sudo systemctl status vibehub --no-pager

echo ""
echo "Logs available via: journalctl -u vibehub -f"
