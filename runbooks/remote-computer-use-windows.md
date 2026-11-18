# Remote computer use on a Windows PC

Give a Claude Code session running on a Windows PC control of the desktop
when the owner is away and only reaches it through Remote Control (RC) on the phone.

## Facts
- Built-in computer use is not an MCP server on Windows: only the Claude Desktop app has it.
- An RC session runs unelevated. Anything that needs admin (Chrome Remote Desktop host,
  Windows RDP, firewall) raises a UAC prompt that cannot be clicked remotely.

## Procedure (tested)
1. Over RC, ask the session to install `uv` in user scope if missing.
2. Register a Windows control MCP server with `claude mcp add` (Windows-MCP, run with `uvx`).
   No admin, no security changes.
3. Restart the session so the tools load.
4. The session must run in the logged-in desktop session (a terminal opened on the PC),
   not over SSH or as a service, or it cannot see the screen.

## Fallbacks
- Remote desktop without admin: RustDesk portable `.exe` (official GitHub releases).
  It cannot click UAC prompts either.
- Anything needing admin: someone at the machine once.
- Durable path: put the PC on Tailscale (`tailscale up --ssh`) while someone is there.
