# Beeminder support

TagTime Web can integrate with Beeminder, but some additional setup is required:
1. [Create an app](https://www.beeminder.com/apps/new)
    - Make the "Redirect URL" `[frontend]/goals`
    - Leave "Post Deauthorize Callback URL" empty
    - Make the "Autofetch Callback URL" `[backend]/internal/beem/autofetch`
2. Add this to `config.json`:
    ```
        "beem-client": "[client ID]",
        "beem-name": "[application name]"
    ```
