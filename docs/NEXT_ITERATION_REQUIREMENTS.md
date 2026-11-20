# Next Iteration Requirements — Multi-Instance Logging and Visualization

**Status:** Proposed requirements for a future iteration.  
**Scope:** Requirements capture only. These items are not part of the current 121GW implementation and must not be treated as implemented functionality.

## 1. Per-instance CSV logging

The application shall allow each connected meter instance to be logged independently to its own CSV file.

Requirements:
- Each meter instance can start and stop its own logging session.
- Each CSV file contains a timestamp for every measurement.
- Each row identifies the originating meter instance and, where available, its device model and connection identifier.
- Measurement value, unit, measurement mode/range and relevant status/quality information are included where available.
- Logging one instance must not interrupt or change the logging state of another instance.
- The user can select or provide a meaningful file name and export/download the resulting CSV.

## 2. Combined CSV logging across instances

The application shall support logging multiple meter instances simultaneously into one combined CSV file.

Requirements:
- The user can select which connected instances are included in a combined logging session.
- Measurements from all selected instances are written to the same CSV output.
- Every row includes a timestamp and a stable instance identifier so measurements from different meters remain distinguishable.
- The combined format must support instances reporting at different rates and at different times. Missing values must not be fabricated; rows should represent actual measurement events.
- The CSV should include sufficient metadata to interpret each measurement, including unit, mode/range and device identity where available.
- Starting or stopping a combined session must not unintentionally start or stop independent per-instance sessions.

## 3. Combined live graphing

The application shall support a live graph view that combines measurements from multiple meter instances.

Requirements:
- The user can select multiple connected instances and choose which measurements to display.
- Each instance/measurement series is visually distinguishable and identified in the legend.
- The graph updates live as new readings arrive from the selected instances.
- Time alignment uses measurement timestamps rather than assuming that all instances update at the same rate.
- The user can enable or disable individual series without disconnecting the meter.
- Units and scales must be handled explicitly. Measurements with incompatible units or dimensions must not silently share one axis; the UI should use separate graphs/axes or require a compatible selection.
- The user can clear the live graph and choose an appropriate visible time window.

## 4. Architectural considerations

These capabilities should build on the existing multi-instance direction rather than being implemented as single-meter-only features.

- Give each connected meter instance a stable runtime identity.
- Route each measurement event through a shared measurement/event model that preserves source identity and timestamp.
- Keep per-instance logging, combined logging and graph subscriptions independent of the device-specific driver.
- Ensure disconnecting one meter does not stop logging or graph updates for other connected meters.
- Keep CSV export usable without requiring an MQTT or MCP connection.

## 5. Acceptance criteria for the future iteration

1. Two or more meter instances can each log to separate CSV files at the same time.
2. Two or more meter instances can log into one combined CSV file, with every measurement row attributed to its source.
3. A live graph can display series from at least two instances concurrently.
4. Instances with different update intervals remain correctly time-aligned.
5. Series with incompatible units are not plotted on a misleading shared scale.
6. Disconnecting one instance does not interrupt the other instances' logging or live graph series.

## Out of scope for this requirements note

- No implementation changes are made by adding this document.
- No specific CSV schema, UI layout, graph library changes or persistence strategy are finalized here; these should be designed during the future iteration while preserving the requirements above.


## 6. Independent southbound and northbound MQTT / WebSocket instances

MQTT connectivity (including MQTT over WebSockets) shall be supported independently on both the **southbound** and **northbound** sides of the application. These are separate connection instances with separate configuration; a single global MQTT broker configuration is not sufficient.

### 6.1 Southbound — per meter instance

- Each meter instance can have its own southbound MQTT/WebSocket connection configuration.
- Each connection has independent broker settings, including protocol/transport (MQTT TCP or MQTT over WebSockets), broker hostname/address, port, credentials and any required WebSocket path or TLS options.
- Each meter instance can use its own topic configuration and publish its own measurement stream without depending on another meter instance's connection.
- One meter instance may connect, disconnect or change broker settings without interrupting the other instances.
- The configuration should identify which meter instance is the source of the published measurements.

### 6.2 Northbound — independent application connection instances

- The application shall also support one or more independently configured northbound MQTT/WebSocket connection instances.
- Every northbound connection instance has its own broker settings, credentials, transport/protocol options and topic/subscription configuration.
- Northbound connections are not implicitly tied to the broker settings of any southbound meter connection.
- The user can independently connect, disconnect and configure each northbound instance.
- Northbound data sources and their messages must retain source/connection identity when made available to the application or its higher-level consumers.

### 6.3 Separation and routing

- Southbound and northbound connections must be represented as distinct, named connection instances managed independently.
- Broker credentials and connection state must be stored per connection instance, not in one shared global settings object.
- The application must make the direction and purpose of each connection clear in the UI and in its configuration.
- Message routing between meter instances, southbound publishers, northbound subscribers, logging and visualization must be explicit and configurable; do not assume every message is automatically forwarded in both directions.
- MQTT over WebSockets is a transport option on both sides, alongside standard MQTT over TCP where supported.
- Connection loss or reconfiguration on one side must not silently change or interrupt unrelated connections on the other side.

### 6.4 Future-iteration acceptance criteria

1. Two meter instances can publish concurrently using different southbound broker configurations.
2. A meter instance can be configured to use MQTT TCP while another uses MQTT over WebSockets, where the respective broker listeners are available.
3. At least two independent northbound connections can be configured with different broker settings and topic subscriptions.
4. A southbound connection can be disconnected or reconfigured without disconnecting northbound connections or other meter instances.
5. The UI and message model make the source, direction and connection instance of each message identifiable.
6. Routing/bridging between southbound and northbound connections is explicit, rather than implicit global forwarding.
