# Universal Multimeter Web Interface

Browser-based multimeter dashboard. The first device driver targets the **EEVblog 121GW over Bluetooth Low Energy**.

## Current implementation

This development branch contains an initial end-to-end implementation:

- Dark responsive dashboard inspired by the [FY8300 Commander](https://github.com/Robbertjv/FY8300_Commander/) look and feel.
- Web Bluetooth 121GW connection, 19-byte packet framing and XOR checksum validation.
- Measurement decoding, LCD annunciators, secondary display, battery indicator and bargraph.
- Remote RANGE, HOLD, REL, PEAK, MODE, MIN/MAX, MEM and SETUP key presses.
- Live trend chart, basic statistics, IndexedDB storage and CSV export.
- MQTT over WebSockets (WS/WSS) from the browser.
- Optional local Python backend for standard MQTT/TCP publishing and a read-only MCP endpoint for AI clients.
- PWA manifest/service worker and automated driver tests.

**Important:** this code has not yet been exercised against a physical 121GW in this environment. It is a first implementation requiring hardware validation, not a certified measurement instrument.

## Run the web app and local services

Python 3.10+ is recommended. From the repository root:

    python -m venv .venv
    # Windows: .venv\Scripts\activate
    # Linux/macOS: source .venv/bin/activate
    pip install -r requirements.txt

Set MCP_TOKEN in your shell to a long random secret, then start the app server:

    # Linux/macOS
    export MCP_TOKEN="replace-with-a-long-random-secret"
    # PowerShell: $env:MCP_TOKEN="replace-with-a-long-random-secret"
    uvicorn backend.app:app --host 127.0.0.1 --port 8765

Open http://localhost:8765. The FastAPI backend serves the frontend and local API from one origin. Web Bluetooth requires HTTPS or localhost and a supported Chromium browser. Enable Bluetooth on the meter, click CONNECT BLE, and select the 121GW.

Android Chrome can use a deployed HTTPS origin. Browser BLE availability depends on platform/browser support; iOS Safari does not provide the Web Bluetooth API required here.

## Automated tests

Requires Node.js 20 or later:

    npm test

Tests cover the 121GW packet checksum, framing, key frames, and representative measurement conversion.

## MQTT options

### MQTT over WebSockets

Select **MQTT over WebSocket** and enter the broker host, WebSocket listener port and topic. The browser chooses ws:// for an HTTP origin and wss:// for HTTPS. Configure the broker's WebSocket listener and allowed origin. Credentials remain in browser memory only.

### Standard MQTT over TCP

Select **MQTT TCP via local bridge**. The local backend connects to the broker using the host and port entered in the UI (normally 1883) and publishes measurements to the configured topic. This bridge currently supports plain MQTT/TCP with optional username/password; TLS configuration is a follow-up.

## MCP / AI access

The optional local backend exposes a read-only MCP-compatible Streamable HTTP endpoint at http://127.0.0.1:8765/mcp. It exposes get_status, get_reading, and get_recent_readings. The frontend forwards its selected meter instance's readings to the local backend; the MCP endpoint therefore addresses that running browser instance.

Configure your MCP client with the URL above and an HTTP header Authorization: Bearer <MCP_TOKEN>. Keep the backend bound to loopback; do not expose it to a network without adding a reviewed authentication and origin/security layer. The current MCP tools are read-only; remote meter button presses are not exposed to AI.

## Protocol reference

The BLE implementation follows the documented 121GW binary protocol: characteristic E7ADD780-B042-4876-AAE1-112855353CC1, service 0BD51666-E7CB-469B-8E4D-2742F1BA77CC, 19-byte frames, XOR checksum, and five-byte key commands. The meter's physical rotary switch still selects the measurement function.

## Known limitations / next validation

- Test BLE discovery, indication notifications and key writes with the actual meter on Windows, Android Chrome and Ubuntu Chrome.
- Verify every mode/range conversion against the physical display; voltage, resistance, current, frequency, temperature and power modes should all be checked.
- Battery voltage is available when the meter visits its battery SETUP page; the low-battery symbol is continuously available.
- MQTT TCP currently has no TLS option. MQTT WebSocket path is currently /mqtt.
- MCP is read-only and local-only. AI-driven button control and multi-instance selection need additional design and authorization.
- This software is not a replacement for a calibrated instrument. Independently verify readings before any safety-critical use.

## Architecture

The 121GW packet driver is separate from the dashboard. The documented architecture remains extensible to additional drivers, transports, measurement processing, graphing, logging/storage and AI integration.

## License

MIT. See LICENSE.
