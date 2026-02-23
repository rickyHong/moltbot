# Windows Electron Action Client

Electron desktop client for Windows that sends:

- current screenshot
- selected user action (shortcut key or mouse action + coordinate)

to APIs across a step-based workflow (`check -> next` loop, then `done`).

## Features implemented

1. **Dialog layout**
   - Top: screenshot preview
   - Middle-left: API request message
   - Middle-right: API response message
   - Bottom: `Check`, `Next`, `Done` buttons

2. **Action creation by right-click menu**
   - Right-click on screenshot panel
   - Native context menu appears with submenus:
     - Shortcut Key actions
     - Mouse Action entries
   - Each action includes right-click coordinate

3. **Pre-execution API call**
   - When an action is selected, the app calls `/task/action-preview`
   - Payload includes screenshot + action info
   - This covers "non-executed actions" reporting before execution

4. **Button rules**
   - Action selected -> `Check` enabled
   - `Check` calls `/task/check`
     - success -> `Next` enabled
     - fail -> all buttons disabled
   - `Next` calls `/task/next` with previous check payload
   - `Done` calls `/task/done` to finish task

## Quick start

```bash
cd apps/windows-electron-action-client
npm install
```

Terminal 1 (mock API):

```bash
npm run start:mock-api
```

Terminal 2 (electron app):

```bash
npm start
```

## API endpoint config

- Default base URL: `http://127.0.0.1:8787`
- Override with env:

```bash
API_BASE_URL=http://your-api-host:port npm start
```

### Endpoints used

- `POST /task/action-preview`
- `POST /task/check`
- `POST /task/next`
- `POST /task/done`

Each payload includes:

- `taskId`
- `step` (or `finalStep`)
- `action` (kind, label, value, coordinate)
- `screenshot` as data URL

## Validation command

```bash
npm run check
```
