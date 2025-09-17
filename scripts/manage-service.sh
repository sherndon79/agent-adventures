#!/bin/bash
# Management script for Agent Adventures service

set -e

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

SERVICE_NAME="agent-adventures"

show_usage() {
    echo "Agent Adventures Service Manager"
    echo ""
    echo "Usage: $0 [COMMAND]"
    echo ""
    echo "Commands:"
    echo "  start     Start the service"
    echo "  stop      Stop the service"
    echo "  restart   Restart the service"
    echo "  status    Show service status"
    echo "  logs      Show live logs"
    echo "  logs-today Show today's logs"
    echo "  enable    Enable service to start on boot"
    echo "  disable   Disable service from starting on boot"
    echo "  install   Install the service (run install-service.sh)"
    echo "  remove    Remove the service from systemd"
    echo ""
}

check_service_exists() {
    if ! systemctl list-unit-files | grep -q "^${SERVICE_NAME}.service"; then
        echo -e "${RED}❌ Service ${SERVICE_NAME} is not installed${NC}"
        echo "Run: $0 install"
        exit 1
    fi
}

case "${1:-}" in
    start)
        check_service_exists
        echo -e "${YELLOW}🚀 Starting ${SERVICE_NAME} service...${NC}"
        sudo systemctl start $SERVICE_NAME
        echo -e "${GREEN}✅ Service started${NC}"
        sudo systemctl status $SERVICE_NAME --no-pager
        ;;

    stop)
        check_service_exists
        echo -e "${YELLOW}🛑 Stopping ${SERVICE_NAME} service...${NC}"
        sudo systemctl stop $SERVICE_NAME
        echo -e "${GREEN}✅ Service stopped${NC}"
        ;;

    restart)
        check_service_exists
        echo -e "${YELLOW}🔄 Restarting ${SERVICE_NAME} service...${NC}"
        sudo systemctl restart $SERVICE_NAME
        echo -e "${GREEN}✅ Service restarted${NC}"
        sudo systemctl status $SERVICE_NAME --no-pager
        ;;

    status)
        check_service_exists
        echo -e "${BLUE}📊 Service status:${NC}"
        sudo systemctl status $SERVICE_NAME --no-pager
        ;;

    logs)
        check_service_exists
        echo -e "${BLUE}📋 Live logs (Ctrl+C to exit):${NC}"
        journalctl -u $SERVICE_NAME -f
        ;;

    logs-today)
        check_service_exists
        echo -e "${BLUE}📋 Today's logs:${NC}"
        journalctl -u $SERVICE_NAME --since today
        ;;

    enable)
        check_service_exists
        echo -e "${YELLOW}✅ Enabling ${SERVICE_NAME} service to start on boot...${NC}"
        sudo systemctl enable $SERVICE_NAME
        echo -e "${GREEN}✅ Service enabled${NC}"
        ;;

    disable)
        check_service_exists
        echo -e "${YELLOW}❌ Disabling ${SERVICE_NAME} service from starting on boot...${NC}"
        sudo systemctl disable $SERVICE_NAME
        echo -e "${GREEN}✅ Service disabled${NC}"
        ;;

    install)
        SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
        echo -e "${YELLOW}📦 Running installation script...${NC}"
        "${SCRIPT_DIR}/install-service.sh"
        ;;

    remove)
        if systemctl list-unit-files | grep -q "^${SERVICE_NAME}.service"; then
            echo -e "${YELLOW}🗑️ Removing ${SERVICE_NAME} service...${NC}"

            # Stop service if running
            if systemctl is-active --quiet $SERVICE_NAME; then
                sudo systemctl stop $SERVICE_NAME
            fi

            # Disable service
            sudo systemctl disable $SERVICE_NAME

            # Remove service file
            sudo rm -f "/etc/systemd/system/${SERVICE_NAME}.service"

            # Reload systemd
            sudo systemctl daemon-reload

            echo -e "${GREEN}✅ Service removed${NC}"
        else
            echo -e "${YELLOW}⚠️ Service ${SERVICE_NAME} is not installed${NC}"
        fi
        ;;

    *)
        show_usage
        exit 1
        ;;
esac