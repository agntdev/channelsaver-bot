# Private Video Downloader — Bot specification

**Archetype:** custom

**Voice:** professional and concise — write every user-facing message, button label, error, and empty state in this voice.

Telegram bot that lets private channel/group members request videos be downloaded and uploaded as Telegram video/file messages, preserving access controls and metadata

> This is the complete contract for the bot. Implement EVERY entry point, flow, feature, integration, and edge case below. The completeness review checks the bot against this document after each build pass.

## Primary audience

- Telegram channel owners
- private group members
- content sharers

## Success criteria

- Members can download videos from private chats via /download command or reply button
- Bot validates membership before processing requests
- Original video metadata is preserved during delivery

## Entry points

Every feature must be reachable from the bot's command/button surface (button-first; only /start and /help are slash commands).

- **/start** (command, actor: user, command: /start) — Open main menu with bot functionality overview
- **Download video** (command, actor: user, command: /download) — Trigger video download when replying to a video message
  - inputs: video message ID, chat context
  - outputs: download confirmation, uploaded video/file
- **Download** (button, actor: user, callback: download:reply) — Inline button shown under video messages for quick download requests

## Flows

### video_download
_Trigger:_ /download or reply button

1. Validate requester is chat member
2. Identify target video message
3. Fetch video content
4. Upload as Telegram message
5. Send completion confirmation

_Data touched:_ video_request, delivered_file

### error_handling
_Trigger:_ Invalid message ID or access denied

1. Check error type
2. Send appropriate error message
3. Log incident for admin

_Data touched:_ video_request

## Data entities

Durable data (must survive a restart) uses the toolkit's persistent store, never in-memory maps.

- **video_request** _(retention: persistent)_ — User request to download a video
  - fields: requester_id, chat_id, message_id, timestamp, status
- **delivered_file** _(retention: session)_ — Downloaded video uploaded back to Telegram
  - fields: original_filename, mime_type, metadata_hash, delivery_chat_id
- **admin_settings** _(retention: persistent)_ — Owner configuration preferences
  - fields: admin_chat_id, filename_format, retention_days

## Integrations

- **Telegram** (required) — Bot API messaging and file handling
Call external APIs against their real contract (correct endpoints, ids, params); credentials from env. Do not fake responses.

## Owner controls

- Configure admin notification settings
- Set video filename formatting rules
- Adjust audit log retention period (default 30 days)

## Notifications

- Admin receives alerts for failed downloads
- Users get status updates during processing

## Permissions & privacy

- Only members of the source chat can request downloads
- Bot never accesses public channels or external content
- Metadata stripped from delivered files by default

## Edge cases

- Request from non-member user
- Invalid or deleted message ID
- Video message without downloadable content
- Rate limiting for excessive requests

## Required tests

- Verify download flow works in private chat with valid video
- Test error handling for non-member requests
- Confirm metadata preservation with different video formats

## Assumptions

- Bot uses Telegram's message reply system for discovery
- 30-day default retention for audit logs
- Admin receives minimal noise from routine operations
