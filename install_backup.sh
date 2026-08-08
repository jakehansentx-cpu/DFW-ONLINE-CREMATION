#!/bin/bash
# Run this once on the Pi, from inside the cooler_board folder, AFTER:
#   1. Mounting the external backup drive at /mnt/cooler-backup (see
#      README's "Automated backups" section for the one-time drive
#      setup -- formatting, fstab entry, etc.)
#   2. Editing cooler-backup.service's WorkingDirectory/ExecStart/User
#      to match your setup (same paths as cooler-board.service).
set -e
sudo cp cooler-backup.service /etc/systemd/system/cooler-backup.service
sudo cp cooler-backup.timer /etc/systemd/system/cooler-backup.timer
sudo systemctl daemon-reload
sudo systemctl enable --now cooler-backup.timer
echo "Installed. Backups run automatically every 4 hours."
echo "Run one manually right now with: sudo systemctl start cooler-backup.service"
echo "Check the last run with:         sudo systemctl status cooler-backup.service"
echo "See the timer's schedule with:   systemctl list-timers cooler-backup.timer"
echo "Full backup log:                 cat /mnt/cooler-backup/backup.log"
