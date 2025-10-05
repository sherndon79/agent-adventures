#!/usr/bin/env python3
"""
Simple YouTube Live Chat tester.

Before running:
  1. Create a project in Google Cloud Console, enable "YouTube Data API v3".
  2. Generate an OAuth 2.0 Client ID (Desktop) and save client_secret.json next to this script
     if you plan to post messages.
  3. Optionally create a .env file in this directory with YOUTUBE_API_KEY and
     YOUTUBE_LIVE_BROADCAST_ID.

Usage:
  python youtube_chat_test.py --broadcast-id <LIVE_BROADCAST_ID>

The script loads environment variables from .env (if present), fetches the liveChatId,
prints recent messages, and optionally posts a test message via OAuth.
"""

import argparse
import json
import os
from typing import Optional

from dotenv import load_dotenv
import google.oauth2.credentials
import google_auth_oauthlib.flow
from googleapiclient.discovery import build

SCOPES = ["https://www.googleapis.com/auth/youtube.force-ssl"]
CLIENT_SECRET_FILE = "client_secret.json"
TOKEN_FILE = "youtube_chat_token.json"


def load_env() -> None:
    env_path = os.path.join(os.path.dirname(__file__), ".env")
    if os.path.exists(env_path):
        load_dotenv(dotenv_path=env_path)


def get_oauth_credentials() -> google.oauth2.credentials.Credentials:
    """Obtain OAuth credentials, storing refresh tokens locally."""
    if os.path.exists(TOKEN_FILE):
        with open(TOKEN_FILE, "r", encoding="utf-8") as f:
            data = json.load(f)
            return google.oauth2.credentials.Credentials.from_authorized_user_info(data, SCOPES)

    flow = google_auth_oauthlib.flow.InstalledAppFlow.from_client_secrets_file(
        CLIENT_SECRET_FILE, SCOPES
    )
    creds = flow.run_local_server(port=0, prompt="consent")
    with open(TOKEN_FILE, "w", encoding="utf-8") as f:
        f.write(creds.to_json())
    return creds


def get_live_chat_id(youtube, broadcast_id: str) -> Optional[str]:
    response = youtube.videos().list(
        part="liveStreamingDetails",
        id=broadcast_id
    ).execute()
    items = response.get("items", [])
    if not items:
        return None
    details = items[0].get("liveStreamingDetails", {})
    return details.get("activeLiveChatId") or details.get("liveChatId")


def list_chat_messages(youtube, live_chat_id: str, page_size: int = 10):
    response = youtube.liveChatMessages().list(
        liveChatId=live_chat_id,
        part="snippet,authorDetails",
        maxResults=page_size
    ).execute()
    return response.get("items", [])


def insert_chat_message(youtube, live_chat_id: str, message_text: str):
    body = {
        "snippet": {
            "type": "textMessageEvent",
            "liveChatId": live_chat_id,
            "textMessageDetails": {"messageText": message_text},
        }
    }
    youtube.liveChatMessages().insert(
        part="snippet",
        body=body
    ).execute()


def main():
    load_env()

    parser = argparse.ArgumentParser(description="YouTube live chat tester")
    parser.add_argument("--broadcast-id", default=os.getenv("YOUTUBE_LIVE_BROADCAST_ID"),
                        help="Active YouTube live broadcast ID")
    parser.add_argument("--post", action="store_true", help="Post a test message via OAuth")
    parser.add_argument("--message", default="Hello from API!", help="Message text when posting")
    args = parser.parse_args()

    if not args.broadcast_id:
        raise SystemExit("Provide --broadcast-id or set YOUTUBE_LIVE_BROADCAST_ID")

    api_key = os.getenv("YOUTUBE_API_KEY")
    if not api_key:
        raise SystemExit("Set YOUTUBE_API_KEY in .env or environment")

    youtube_api = build("youtube", "v3", developerKey=api_key)
    live_chat_id = get_live_chat_id(youtube_api, args.broadcast_id)
    if not live_chat_id:
        raise SystemExit("Could not find liveChatId for broadcast (is it live?)")

    messages = list_chat_messages(youtube_api, live_chat_id)
    print(f"Fetched {len(messages)} messages:")
    for item in messages:
        author = item["authorDetails"].get("displayName")
        text = item["snippet"].get("textMessageDetails", {}).get("messageText")
        print(f"[{author}] {text}")

    if args.post:
        creds = get_oauth_credentials()
        youtube_oauth = build("youtube", "v3", credentials=creds)
        insert_chat_message(youtube_oauth, live_chat_id, args.message)
        print("Posted message.")


if __name__ == "__main__":
    main()
