#!/bin/bash
# Install Agent Adventures as a systemd service

set -e

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

echo -e "${GREEN}🚀 Installing Agent Adventures as a systemd service...${NC}"

# Check if running as root
if [[ $EUID -eq 0 ]]; then
   echo -e "${RED}❌ This script should not be run as root${NC}"
   echo "Run this script as your regular user, it will prompt for sudo when needed."
   exit 1
fi

# Get the current directory
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_DIR="$(dirname "$SCRIPT_DIR")"

echo -e "${YELLOW}📁 Project directory: ${PROJECT_DIR}${NC}"

# Check if service file exists
SERVICE_FILE="${PROJECT_DIR}/agent-adventures.service"
if [[ ! -f "$SERVICE_FILE" ]]; then
    echo -e "${RED}❌ Service file not found: ${SERVICE_FILE}${NC}"
    exit 1
fi

# Check if .env file exists
ENV_FILE="${PROJECT_DIR}/.env"
if [[ ! -f "$ENV_FILE" ]]; then
    echo -e "${RED}❌ Environment file not found: ${ENV_FILE}${NC}"
    echo "Please create .env file with your configuration"
    exit 1
fi

# Check if node_modules exists
if [[ ! -d "${PROJECT_DIR}/node_modules" ]]; then
    echo -e "${YELLOW}⚠️ node_modules not found, running npm install...${NC}"
    cd "$PROJECT_DIR"
    npm install
fi

# Copy service file to systemd directory
echo -e "${YELLOW}📋 Installing service file...${NC}"
sudo cp "$SERVICE_FILE" /etc/systemd/system/

# Reload systemd daemon
echo -e "${YELLOW}🔄 Reloading systemd daemon...${NC}"
sudo systemctl daemon-reload

# Enable the service
echo -e "${YELLOW}✅ Enabling agent-adventures service...${NC}"
sudo systemctl enable agent-adventures.service

echo -e "${GREEN}✅ Agent Adventures service installed successfully!${NC}"
echo ""
echo "Available commands:"
echo "  sudo systemctl start agent-adventures    # Start the service"
echo "  sudo systemctl stop agent-adventures     # Stop the service"
echo "  sudo systemctl restart agent-adventures  # Restart the service"
echo "  sudo systemctl status agent-adventures   # Check service status"
echo "  journalctl -u agent-adventures -f        # View live logs"
echo "  journalctl -u agent-adventures --since today  # View today's logs"
echo ""
echo -e "${YELLOW}Note: The service is enabled but not started. Run 'sudo systemctl start agent-adventures' to start it.${NC}"