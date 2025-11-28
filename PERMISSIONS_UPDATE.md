# Permissions Update Summary

## Overview
Updated the Tauri shell to be maximally permissive for development and desktop assistant functionality. This addresses permission-related issues and prepares for future features.

---

## Files Modified

### 1. `/apps/tauri-shell/src-tauri/Info.plist` (macOS Entitlements)

#### File System Access
- **`com.apple.security.files.user-selected.read-only`** - Read user-selected files via file picker/drag-drop
- **`com.apple.security.files.user-selected.read-write`** - Write to user-selected files
- **`com.apple.security.files.downloads.read-only`** - Read from Downloads folder
- **`com.apple.security.files.downloads.read-write`** - Write to Downloads folder

**Why:** Desktop assistant needs to read/write files selected by the user and access Downloads for common file operations.

#### Network Access
- **`com.apple.security.network.client`** - Outgoing connections (API calls, Claude SDK, ComfyUI, etc.)
- **`com.apple.security.network.server`** - Incoming connections (webhooks, local servers)

**Why:** Required for Claude API calls and potential future features like local HTTP servers or webhook endpoints.

#### Hardware Access (Future-Proofing)
- **`com.apple.security.device.camera`** - Camera access
- **`com.apple.security.device.audio-input`** - Microphone access

**Why:** Claude SDK supports vision features. Prepares for future voice/video capabilities.

#### Automation
- **`com.apple.security.automation.apple-events`** - AppleScript/JXA automation

**Why:** Enables automation of other macOS applications, useful for assistant tasks.

#### App Sandbox
- **`com.apple.security.app-sandbox`** - Enable sandboxing

**Why:** Required for Mac App Store distribution and security best practices.

#### Development Entitlements (Review Before Production)
- **`com.apple.security.cs.disable-library-validation`** - Disable library validation
- **`com.apple.security.cs.allow-unsigned-executable-memory`** - Allow JIT/unsigned memory
- **`com.apple.security.cs.allow-dyld-environment-variables`** - Allow DYLD vars for debugging

**Why:** Makes development easier. **IMPORTANT:** Review these before production release.

#### Privacy Descriptions
- **`NSCameraUsageDescription`** - User prompt for camera access
- **`NSMicrophoneUsageDescription`** - User prompt for microphone access
- **`NSAppleEventsUsageDescription`** - User prompt for automation access

**Why:** Required by macOS when requesting these permissions. Provides clear user messaging.

---

### 2. `/apps/tauri-shell/src-tauri/tauri.conf.json` (Tauri Configuration)

#### Shell Permissions
```json
"shell": {
  "all": true,
  "execute": true,
  "sidecar": true,
  "open": true
}
```
**Why:** Execute commands, open files/URLs, run sidecar binaries.

#### Dialog Permissions
```json
"dialog": {
  "all": true,
  "ask": true,
  "confirm": true,
  "message": true,
  "open": true,
  "save": true
}
```
**Why:** File pickers, save dialogs, user prompts - essential for assistant UX.

#### File System Permissions
```json
"fs": {
  "all": true,
  "readFile": true,
  "writeFile": true,
  "readDir": true,
  "copyFile": true,
  "createDir": true,
  "removeDir": true,
  "removeFile": true,
  "renameFile": true,
  "exists": true,
  "scope": [
    "$HOME/**",
    "$APPDATA/**",
    "$APPLOCALDATA/**",
    "$APPCONFIG/**",
    "$APPCACHE/**",
    "$APPLOG/**",
    "$RESOURCE/**",
    "$TEMP/**",
    "$DOWNLOAD/**",
    "$DESKTOP/**",
    "$DOCUMENT/**"
  ]
}
```
**Why:** Full filesystem operations within user directories. Scope protects system files while allowing access to all user-accessible locations.

#### HTTP Permissions
```json
"http": {
  "all": true,
  "request": true,
  "scope": ["http://**", "https://**"]
}
```
**Why:** Make HTTP requests from frontend (if needed for direct API calls).

#### Path API
```json
"path": {
  "all": true
}
```
**Why:** Resolve platform-specific paths.

#### Notification Permissions
```json
"notification": {
  "all": true
}
```
**Why:** Send native notifications for assistant responses or alerts.

#### OS API
```json
"os": {
  "all": true
}
```
**Why:** Query OS information (platform, version, etc.).

#### Process Control
```json
"process": {
  "all": true,
  "relaunch": true,
  "exit": true
}
```
**Why:** Restart/exit app programmatically.

#### Clipboard
```json
"clipboard": {
  "all": true,
  "readText": true,
  "writeText": true
}
```
**Why:** Read/write clipboard (useful for assistant interactions).

#### Window Management
```json
"window": {
  "all": true,
  [... extensive window manipulation APIs ...]
}
```
**Why:** Full window control for popup behavior, resizing, positioning, etc.

---

#### Content Security Policy (CSP)
**Before:** `null` (very restrictive default)

**After:**
```
default-src 'self' 'unsafe-inline' 'unsafe-eval' data: blob: http: https:;
connect-src 'self' http: https: ws: wss:;
img-src 'self' data: blob: http: https:;
media-src 'self' data: blob: http: https:;
font-src 'self' data:;
style-src 'self' 'unsafe-inline';
```

**Why:**
- `'unsafe-inline'` - Allows inline styles/scripts (needed for React/Vite)
- `'unsafe-eval'` - Allows eval (needed for some React dev tools)
- `data: blob:` - Allows data URLs and blob URLs (for images, file previews)
- `http: https:` - Allows loading resources from any HTTP(S) source
- `ws: wss:` - WebSocket support (future real-time features)

---

#### File Drop
**Before:** `"fileDropEnabled": false`

**After:** `"fileDropEnabled": true`

**Why:** Already implemented custom drag-and-drop handler, this re-enables native support as fallback.

---

## Testing Checklist

After restarting the app, test these scenarios:

- [ ] Image upload via file picker still works
- [ ] Image upload via paste (Cmd+V) still works
- [ ] Image upload via drag-and-drop still works
- [ ] Claude API calls work (network access)
- [ ] No permission errors in console
- [ ] App successfully reads/writes user-selected files
- [ ] Global shortcut (Cmd+Shift+Space) still works

---

## Security Considerations

### Safe for Development
All permissions are appropriate for a desktop assistant app during development.

### Before Production Release
1. **Review development entitlements** - Remove or restrict:
   - `com.apple.security.cs.disable-library-validation`
   - `com.apple.security.cs.allow-unsigned-executable-memory`
   - `com.apple.security.cs.allow-dyld-environment-variables`

2. **Tighten CSP** - Consider removing `'unsafe-eval'` if not needed

3. **Audit file system scope** - Ensure only necessary paths are included

4. **Test with restricted permissions** - Verify graceful degradation

---

## Rationale

This update follows the principle of **"start permissive, then restrict as needed"** for development. It:

1. **Eliminates permission blockers** during development
2. **Prepares for future features** (camera, microphone, automation)
3. **Maintains security** through sandboxing and scoped access
4. **Provides clear upgrade path** to production-ready permissions

All permissions align with the app's purpose as a desktop AI assistant with file access, API integration, and potential multimedia features.
