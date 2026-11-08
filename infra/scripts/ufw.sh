#!/usr/bin/env bash
# Configura o firewall da VPS (Ubuntu). Execute como root: sudo bash infra/scripts/ufw.sh
set -euo pipefail

ufw default deny incoming
ufw default allow outgoing

ufw allow 22/tcp comment 'SSH'
ufw allow 80/tcp comment 'HTTP (ACME)'
ufw allow 443/tcp comment 'HTTPS'
ufw allow 7881/tcp comment 'LiveKit WebRTC TCP'
ufw allow 7882/udp comment 'LiveKit WebRTC UDP'
ufw allow 3478/udp comment 'TURN/STUN'
ufw allow 3478/tcp comment 'TURN/STUN'
ufw allow 49152:49252/udp comment 'Relay do Coturn'

ufw --force enable
ufw status verbose
