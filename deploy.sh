#!/bin/bash
set -e

echo "Deploying Vibehub..."

# Stop the service if running
echo "Stopping vibehub service..."
sudo systemctl stop vibehub || true

# Install systemd service
echo "Installing systemd service..."
sudo ln -sf /root/projects/vibehub/vibehub.service /etc/systemd/system/vibehub.service
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
