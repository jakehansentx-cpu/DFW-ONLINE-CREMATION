#!/bin/bash
# Run this once on the Pi/mini PC, from inside the cooler_board folder,
# after editing cooler-board.service's paths/user to match your setup.
set -e
sudo cp cooler-board.service /etc/systemd/system/cooler-board.service
sudo systemctl daemon-reload
sudo systemctl enable cooler-board
sudo systemctl start cooler-board
echo "Installed. Check status with: sudo systemctl status cooler-board"
echo "View logs with: sudo journalctl -u cooler-board -f"
