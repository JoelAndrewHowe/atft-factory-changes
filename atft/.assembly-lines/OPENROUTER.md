# OpenRouter disabled

All saved machines explicitly use `openai-codex` / `gpt-6-sol`, including
those referenced by the historical `careful-openrouter.dot` line. Reviewer
names remain for graph compatibility; they all use Codex now.
The old `openrouter-pi` launcher exits without loading credentials.

Pi settings in `~/.pi/agent/settings.json` select `openai-codex` and restrict
model cycling to that provider. Its private `auth.json` contains OAuth credentials
imported from the existing Codex login; the stored OpenRouter credential was removed.
No credentials are stored in machine configurations. Pi refreshes its imported
login independently. If a later token refresh invalidates either client's login,
sign that client in again. In Pi, use `/login` and choose OpenAI (ChatGPT Plus/Pro).

Restart existing Pi sessions to apply the defaults. Explicit CLI overrides
or future configuration edits can still select another provider; this is
configuration, not a network firewall. The local OpenRouter key file is unused.
