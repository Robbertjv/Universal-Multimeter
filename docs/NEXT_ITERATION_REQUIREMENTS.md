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
