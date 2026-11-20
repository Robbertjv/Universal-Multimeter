"""Loopback-only MQTT TCP bridge and read-only MCP endpoint for the 121GW web UI."""
from __future__ import annotations

import json
import os
import secrets
import time
from collections import deque
from datetime import datetime
from pathlib import Path
from typing import Any

from fastapi import FastAPI, Header, HTTPException, Request
from fastapi.responses import JSONResponse
from fastapi.staticfiles import StaticFiles
from paho.mqtt import client as mqtt

app = FastAPI(title="Universal Multimeter Local Bridge", version="0.1.0")
WEB_ROOT = Path(__file__).resolve().parent.parent
latest: dict[str, Any] | None = None
history: deque[dict[str, Any]] = deque(maxlen=10000)
mqtt_client: mqtt.Client | None = None
mqtt_topic = "universal-multimeter/121gw/measurement"
mqtt_connected = False
MCP_TOKEN = os.environ.get("MCP_TOKEN", "")


def require_local(request: Request) -> None:
    host = request.client.host if request.client else ""
    if host not in ("127.0.0.1", "::1", "localhost"):
        raise HTTPException(403, "Loopback clients only")


def require_token(authorization: str | None) -> None:
    if not MCP_TOKEN:
        raise HTTPException(503, "Set MCP_TOKEN in the environment before enabling MCP")
    if not authorization or not secrets.compare_digest(authorization, "Bearer " + MCP_TOKEN):
        raise HTTPException(401, "Invalid bearer token")


def meter_is_fresh() -> bool:
    if not latest or not latest.get("timestamp"):
        return False
    try:
        stamp = datetime.fromisoformat(str(latest["timestamp"]).replace("Z", "+00:00")).timestamp()
        return time.time() - stamp < 10
    except (ValueError, TypeError):
        return False


@app.get("/api/status")
async def status(request: Request):
    require_local(request)
    return {"connected": meter_is_fresh(), "hasReading": latest is not None,
            "mqttConnected": mqtt_connected, "historyCount": len(history), "latest": latest}


@app.post("/api/measurement")
async def measurement(request: Request, payload: dict[str, Any]):
    require_local(request)
    global latest
    latest = payload
    history.append(payload)
    return {"ok": True}


@app.post("/api/mqtt/connect")
async def mqtt_connect(request: Request, config: dict[str, Any]):
    require_local(request)
    global mqtt_client, mqtt_topic, mqtt_connected
    host = str(config.get("host", "")).strip()
    try:
        port = int(config.get("port", 1883))
    except (TypeError, ValueError):
        raise HTTPException(400, "Invalid MQTT port")
    if not host or not (1 <= port <= 65535):
        raise HTTPException(400, "Invalid MQTT host or port")
    if mqtt_client:
        mqtt_client.loop_stop()
        mqtt_client.disconnect()
    mqtt_topic = str(config.get("topic") or mqtt_topic)
    client = mqtt.Client(mqtt.CallbackAPIVersion.VERSION2,
                         client_id=f"universal-meter-{secrets.token_hex(4)}")
    username = config.get("username")
    if username:
        client.username_pw_set(str(username), str(config.get("password") or ""))

    def on_connect(_client, _userdata, _flags, reason_code, _properties):
        global mqtt_connected
        mqtt_connected = int(reason_code) == 0

    def on_disconnect(_client, _userdata, _flags, _reason_code, _properties):
        global mqtt_connected
        mqtt_connected = False

    client.on_connect = on_connect
    client.on_disconnect = on_disconnect
    try:
        client.connect(host, port, keepalive=30)
        client.loop_start()
    except Exception as exc:
        raise HTTPException(502, f"MQTT connection failed: {exc}") from exc
    mqtt_client = client
    return {"ok": True, "host": host, "port": port, "topic": mqtt_topic}


@app.post("/api/mqtt/publish")
async def mqtt_publish(request: Request, payload: dict[str, Any]):
    require_local(request)
    if not mqtt_client or not mqtt_connected:
        raise HTTPException(409, "MQTT TCP bridge is not connected")
    info = mqtt_client.publish(mqtt_topic, json.dumps(payload, separators=(",", ":")), qos=0)
    if info.rc != mqtt.MQTT_ERR_SUCCESS:
        raise HTTPException(502, "MQTT publish failed")
    return {"ok": True}


@app.post("/api/mqtt/disconnect")
async def mqtt_disconnect(request: Request):
    require_local(request)
    global mqtt_client, mqtt_connected
    if mqtt_client:
        mqtt_client.loop_stop()
        mqtt_client.disconnect()
    mqtt_client = None
    mqtt_connected = False
    return {"ok": True}


TOOLS = [
    {"name": "get_status", "description": "Get 121GW connection and latest measurement status.",
     "inputSchema": {"type": "object", "properties": {}, "additionalProperties": False}},
    {"name": "get_reading", "description": "Get the latest measurement from the selected 121GW web frontend instance.",
     "inputSchema": {"type": "object", "properties": {}, "additionalProperties": False}},
    {"name": "get_recent_readings", "description": "Get recent measurements from the local in-memory history.",
     "inputSchema": {"type": "object", "properties": {
         "limit": {"type": "integer", "minimum": 1, "maximum": 500}},
         "additionalProperties": False}},
]


def call_tool(name: str, arguments: dict[str, Any]) -> Any:
    if name == "get_status":
        return {"connected": meter_is_fresh(), "latest": latest,
                "historyCount": len(history), "mqttConnected": mqtt_connected}
    if name == "get_reading":
        return latest or {"connected": False, "message": "No measurement received from the web frontend yet."}
    if name == "get_recent_readings":
        limit = max(1, min(500, int(arguments.get("limit", 50))))
        return list(history)[-limit:]
    raise ValueError(f"Unknown tool: {name}")


@app.post("/mcp")
async def mcp(request: Request, authorization: str | None = Header(default=None)):
    require_local(request)
    require_token(authorization)
    body = await request.json()
    method = body.get("method")
    request_id = body.get("id")
    if method == "notifications/initialized":
        return JSONResponse({}, status_code=202)
    if method == "initialize":
        requested = body.get("params", {}).get("protocolVersion", "2024-11-05")
        return {"jsonrpc": "2.0", "id": request_id, "result": {
            "protocolVersion": requested, "capabilities": {"tools": {}},
            "serverInfo": {"name": "universal-multimeter-121gw", "version": "0.1.0"}}}
    if method == "ping":
        return {"jsonrpc": "2.0", "id": request_id, "result": {}}
    if method == "tools/list":
        return {"jsonrpc": "2.0", "id": request_id, "result": {"tools": TOOLS}}
    if method == "tools/call":
        params = body.get("params", {})
        try:
            result = call_tool(str(params.get("name", "")), params.get("arguments") or {})
            return {"jsonrpc": "2.0", "id": request_id, "result": {
                "content": [{"type": "text", "text": json.dumps(result, ensure_ascii=False)}],
                "structuredContent": result, "isError": False}}
        except Exception as exc:
            return {"jsonrpc": "2.0", "id": request_id, "result": {
                "content": [{"type": "text", "text": str(exc)}], "isError": True}}
    return {"jsonrpc": "2.0", "id": request_id,
            "error": {"code": -32601, "message": f"Method not found: {method}"}}


# Mount last so API routes take precedence over static asset handling.
app.mount("/", StaticFiles(directory=WEB_ROOT, html=True), name="web")
