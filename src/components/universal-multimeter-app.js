const template = document.createElement("template");

template.innerHTML = `
  <main class="app-shell">
    <header class="app-header">
      <div>
        <p class="eyebrow">MEETINSTRUMENTEN · UNIVERSELE INTERFACE</p>
        <h1>Universal Multimeter</h1>
        <p class="intro">Eén werkplek voor multimeters en andere meetinstrumenten.</p>
      </div>
      <span class="connection-badge" role="status" aria-live="polite" data-status>
        <span class="status-dot" aria-hidden="true"></span>
        Geen instrument verbonden
      </span>
    </header>

    <section class="device-panel" aria-labelledby="device-title">
      <div class="section-heading">
        <div>
          <p class="eyebrow">APPARAATBEHEER</p>
          <h2 id="device-title">Instrument verbinden</h2>
        </div>
        <span class="support-note">Drivers experimenteel · hardware niet gevalideerd</span>
      </div>
      <div class="device-actions">
        <label for="profile-select">Instrumentprofiel
          <select id="profile-select" data-profile>
            <option value="">Profielen laden…</option>
          </select>
        </label>
        <button type="button" data-connect>Verbinden</button>
        <button type="button" class="secondary" data-disconnect disabled>Verbreken</button>
      </div>
      <p class="help-text" data-message aria-live="polite">
        Kies een instrument en start de verbinding. Browser-toestemming wordt pas dan gevraagd.
      </p>
    </section>

    <section class="measurement-panel" aria-labelledby="measurement-title">
      <div class="section-heading">
        <div>
          <p class="eyebrow">LIVE METING</p>
          <h2 id="measurement-title">Actuele meetwaarde</h2>
        </div>
        <span class="measurement-quality" data-quality>Geen meetgegevens</span>
      </div>
      <div class="measurement-reading" data-reading aria-live="polite">
        <span class="reading-value">—</span>
        <span class="reading-unit"></span>
      </div>
      <p class="measurement-detail" data-detail>Verbind een instrument om metingen te ontvangen.</p>
    </section>

    <section class="graph-panel" aria-labelledby="graph-title">
      <div class="section-heading">
        <div>
          <p class="eyebrow">MEETVERLOOP</p>
          <h2 id="graph-title">Live trend</h2>
        </div>
        <div class="graph-actions">
          <label for="graph-window">Tijdsvenster
            <select id="graph-window" data-graph-window>
              <option value="60000">1 minuut</option>
              <option value="300000" selected>5 minuten</option>
              <option value="900000">15 minuten</option>
              <option value="3600000">1 uur</option>
            </select>
          </label>
          <button type="button" class="secondary" data-clear-graph>Wis grafiek</button>
        </div>
      </div>
      <svg data-graph viewBox="0 0 800 220" role="img" aria-label="Live meetwaardegrafiek">
        <text x="400" y="110" text-anchor="middle" class="graph-empty">Nog geen numerieke meetpunten</text>
      </svg>
      <p data-graph-detail class="measurement-detail">Grafiek toont één kanaal en één eenheid tegelijk.</p>
      <ul data-channels class="channel-list" aria-label="Meetkanalen"></ul>
    </section>

    <section class="history-panel" aria-labelledby="history-title">
      <div class="section-heading">
        <div>
          <p class="eyebrow">LOKALE DATA</p>
          <h2 id="history-title">Meetgeschiedenis</h2>
        </div>
        <span data-logging-status class="measurement-quality">Logging gestopt</span>
      </div>
      <label for="history-session">Bewaarde sessie
        <select id="history-session" data-history-session>
          <option value="">Geen opgeslagen sessies</option>
        </select>
      </label>
      <div class="history-actions">
        <button type="button" data-log-start disabled>Start logging</button>
        <button type="button" class="secondary" data-log-stop disabled>Stop logging</button>
        <button type="button" class="secondary" data-log-export disabled>Exporteer CSV</button>
      </div>
      <p class="help-text">Metingen worden lokaal in IndexedDB opgeslagen. Export bevat alleen de gekozen logsessie.</p>
    </section>

    <section class="device-list-panel" aria-labelledby="devices-title">
      <div class="section-heading">
        <h2 id="devices-title">Verbonden instrumenten</h2>
        <label for="active-device">Actief instrument
          <select id="active-device" data-active-device disabled>
            <option value="">Geen instrument verbonden</option>
          </select>
        </label>
      </div>
      <ul data-devices><li class="empty-state">Geen instrument verbonden</li></ul>
    </section>

    <footer class="app-footer">
      <span>Universal Multimeter Web Interface</span>
      <span>Modular runtime · software-first</span>
    </footer>
  </main>
`;

const STATE_LABELS = {
  connecting: "Verbinding maken…",
  initializing: "Instrument initialiseren…",
  connected: "Verbonden",
  disconnecting: "Verbinding verbreken…",
  disconnected: "Niet verbonden",
  error: "Verbindingsfout",
};

export class UniversalMultimeterApp extends HTMLElement {
  constructor() {
    super();
    this._runtime = null;
    this._unsubscribers = [];
    this._deviceStates = new Map();
    this._latestMeasurements = new Map();
    this._measurementHistory = [];
    this._activeLoggingSessions = new Map();
    this._lastLoggingSessions = new Map();
    this._currentDeviceId = null;
    this._bound = false;
    this._disposed = false;
  }

  connectedCallback() {
    if (!this._bound) {
      this.append(template.content.cloneNode(true));
      this._bindControls();
      this._bound = true;
    }
    if (this._runtime) this._attachRuntime();
  }

  setRuntime(runtime) {
    if (this._runtime === runtime) return;
    this._detachRuntime();
    this._runtime = runtime;
    this._disposed = false;
    if (this.isConnected) this._attachRuntime();
  }

  _bindControls() {
    this.querySelector("[data-connect]").addEventListener("click", () => {
      const profileId = this.querySelector("[data-profile]").value;
      if (!profileId || !this._runtime) return;
      this._setMessage("Browser vraagt zo nodig om apparaattoestemming…");
      this.querySelector("[data-connect]").disabled = true;
      // This call is deliberately made directly in the click handler so
      // Web Bluetooth, Web Serial and WebHID permission prompts are user-driven.
      this._runtime.connect(profileId).catch((error) => {
        this._setMessage(this._friendlyError(error));
        this.querySelector("[data-connect]").disabled = false;
        this._renderStatus();
      });
    });

    this.querySelector("[data-active-device]").addEventListener(
      "change",
      (event) => {
        this._currentDeviceId = event.target.value || null;
        this._renderMeasurement();
        this._renderLogging();
      },
    );

    this.querySelector("[data-history-session]").addEventListener(
      "change",
      () => {
        this._renderLogging();
      },
    );

    this.querySelector("[data-log-start]").addEventListener("click", () => {
      if (!this._currentDeviceId || !this._runtime) return;
      try {
        const session = this._runtime.startLogging(this._currentDeviceId);
        this._activeLoggingSessions.set(this._currentDeviceId, session);
        this._lastLoggingSessions.set(this._currentDeviceId, session);
        this._ensureHistorySessionOption(session);
        this._renderLogging();
        this._setMessage("Lokale meetlogging gestart.");
      } catch (error) {
        this._setMessage(this._friendlyError(error));
      }
    });
    this.querySelector("[data-log-stop]").addEventListener("click", () => {
      if (!this._currentDeviceId || !this._runtime) return;
      const session = this._runtime.stopLogging(this._currentDeviceId);
      if (session)
        this._lastLoggingSessions.set(this._currentDeviceId, session);
      this._activeLoggingSessions.delete(this._currentDeviceId);
      this._renderLogging();
      this._setMessage("Lokale meetlogging gestopt.");
    });
    this.querySelector("[data-log-export]").addEventListener(
      "click",
      async () => {
        const selectedSessionId = this.querySelector(
          "[data-history-session]",
        ).value;
        const session =
          (selectedSessionId ? { sessionId: selectedSessionId } : null) ??
          this._lastLoggingSessions.get(this._currentDeviceId);
        if (!session || !this._runtime) return;
        try {
          const csv = await this._runtime.exportHistoryCsv({
            sessionId: session.sessionId,
          });
          if (csv.trim().split(/\r?\n/).length < 2) {
            this._setMessage("Geen meetgegevens om te exporteren.");
            return;
          }
          const blob = new Blob([csv], { type: "text/csv;charset=utf-8" });
          const url = URL.createObjectURL(blob);
          const link = document.createElement("a");
          link.href = url;
          link.download = `universal-multimeter-${session.sessionId}.csv`;
          link.click();
          setTimeout(() => URL.revokeObjectURL(url), 1000);
          this._setMessage("CSV-export is aangemaakt.");
        } catch (error) {
          this._setMessage(this._friendlyError(error));
        }
      },
    );

    this.querySelector("[data-graph-window]").addEventListener("change", () => {
      this._renderGraph();
    });
    this.querySelector("[data-clear-graph]").addEventListener("click", () => {
      this._measurementHistory = [];
      this._renderGraph();
    });

    this.querySelector("[data-disconnect]").addEventListener("click", () => {
      if (!this._currentDeviceId || !this._runtime) return;
      this._runtime.disconnect(this._currentDeviceId).catch((error) => {
        this._setMessage(this._friendlyError(error));
      });
    });
  }

  _attachRuntime() {
    if (!this._runtime || this._unsubscribers.length) return;
    const profiles = this._runtime.listProfiles();
    const select = this.querySelector("[data-profile]");
    select.replaceChildren();
    for (const profile of profiles) {
      const option = document.createElement("option");
      option.value = profile.profileId;
      option.textContent = `${profile.manufacturer} ${profile.model} · ${
        profile.supportLevel ?? "status onbekend"
      }`;
      select.append(option);
    }
    if (!profiles.length) {
      const option = document.createElement("option");
      option.value = "";
      option.textContent = "Geen instrumentprofielen beschikbaar";
      select.append(option);
    }
    this.querySelector("[data-connect]").disabled = profiles.length === 0;

    const eventTypes = [
      "device-state",
      "device-connected",
      "device-disconnected",
      "device-error",
      "device-warning",
      "measurement",
      "measurement-error",
      "history-error",
    ];
    for (const type of eventTypes) {
      this._unsubscribers.push(
        this._runtime.on(type, (event) => this._handleRuntimeEvent(event)),
      );
    }
    for (const device of this._runtime.listConnectedDevices()) {
      this._deviceStates.set(device.deviceId, device);
      this._currentDeviceId ??= device.deviceId;
    }
    for (const measurement of this._runtime.getSnapshot()) {
      this._latestMeasurements.set(
        `${measurement.deviceId}\u0000${measurement.channelId ?? "primary"}`,
        measurement,
      );
    }
    this._renderAll();
    void this._loadHistorySessions();
  }

  async _loadHistorySessions() {
    if (!this._runtime?.listHistorySessions) return;
    try {
      const sessions = await this._runtime.listHistorySessions();
      const select = this.querySelector("[data-history-session]");
      const selectedSessionId = select.value;
      select.replaceChildren();
      const placeholder = document.createElement("option");
      placeholder.value = "";
      placeholder.textContent = sessions.length
        ? "Selecteer een logsessie"
        : "Geen opgeslagen sessies";
      select.append(placeholder);
      for (const session of sessions) {
        this._ensureHistorySessionOption(session);
      }
      const preferredSession =
        selectedSessionId ||
        this._lastLoggingSessions.get(this._currentDeviceId)?.sessionId ||
        sessions[0]?.sessionId ||
        "";
      select.value = preferredSession;
      this._renderLogging();
    } catch (error) {
      this._setMessage(this._friendlyError(error));
    }
  }

  _ensureHistorySessionOption(session) {
    const select = this.querySelector("[data-history-session]");
    if (!select || !session?.sessionId) return;
    let option = [...select.options].find(
      (entry) => entry.value === session.sessionId,
    );
    if (!option) {
      option = document.createElement("option");
      option.value = session.sessionId;
      const device = session.device ?? {};
      const deviceName =
        [device.manufacturer, device.model].filter(Boolean).join(" ") ||
        session.deviceId;
      const timestamp = session.startedAt
        ? new Date(session.startedAt).toLocaleString()
        : "nieuwe sessie";
      option.textContent = `${deviceName} · ${timestamp} · ${
        session.measurementCount ?? "actief"
      } metingen`;
      select.append(option);
    }
    select.value = session.sessionId;
  }

  _detachRuntime() {
    for (const unsubscribe of this._unsubscribers.splice(0)) unsubscribe();
  }

  disconnectedCallback() {
    this._detachRuntime();
    if (this._runtime && !this._disposed) {
      this._disposed = true;
      void this._runtime.shutdown().catch((error) => {
        this._setMessage(this._friendlyError(error));
      });
    }
  }

  _handleRuntimeEvent(event) {
    switch (event.type) {
      case "device-state": {
        const existing = this._deviceStates.get(event.deviceId) ?? {};
        this._deviceStates.set(event.deviceId, {
          ...existing,
          deviceId: event.deviceId,
          state: event.state,
        });
        this._currentDeviceId = event.deviceId;
        this._setMessage(STATE_LABELS[event.state] ?? event.state);
        break;
      }
      case "device-connected":
        this._deviceStates.set(event.device.deviceId, event.device);
        this._currentDeviceId = event.device.deviceId;
        this._setMessage(
          `${event.device.manufacturer} ${event.device.model} is verbonden.`,
        );
        break;
      case "device-disconnected": {
        const activeSession = this._activeLoggingSessions.get(event.deviceId);
        if (activeSession) {
          this._lastLoggingSessions.set(event.deviceId, activeSession);
          this._activeLoggingSessions.delete(event.deviceId);
        }
        this._deviceStates.delete(event.deviceId);
        for (const key of this._latestMeasurements.keys()) {
          if (key.startsWith(`${event.deviceId}\u0000`)) {
            this._latestMeasurements.delete(key);
          }
        }
        if (this._currentDeviceId === event.deviceId) {
          this._currentDeviceId =
            this._deviceStates.keys().next().value ?? null;
        }
        this._setMessage("Instrumentverbinding verbroken.");
        break;
      }
      case "device-error":
      case "measurement-error":
      case "history-error":
        this._setMessage(this._friendlyError(event.error));
        break;
      case "device-warning":
        this._setMessage(
          event.warning?.message ??
            event.warning?.code ??
            "Waarschuwing van instrument.",
        );
        break;
      case "measurement":
        for (const measurement of event.measurements ?? []) {
          this._latestMeasurements.set(
            `${measurement.deviceId}\u0000${
              measurement.channelId ?? "primary"
            }`,
            measurement,
          );
          this._measurementHistory.push(measurement);
          if (this._measurementHistory.length > 5000) {
            this._measurementHistory.splice(
              0,
              this._measurementHistory.length - 5000,
            );
          }
          this._currentDeviceId = measurement.deviceId;
        }
        break;
      default:
        break;
    }
    this._renderAll();
  }

  _renderLogging() {
    const start = this.querySelector("[data-log-start]");
    const stop = this.querySelector("[data-log-stop]");
    const exportButton = this.querySelector("[data-log-export]");
    const status = this.querySelector("[data-logging-status]");
    const device = this._currentDeviceId
      ? this._deviceStates.get(this._currentDeviceId)
      : null;
    const activeSession = this._activeLoggingSessions.get(
      this._currentDeviceId,
    );
    const lastSession = this._lastLoggingSessions.get(this._currentDeviceId);
    const active = Boolean(activeSession);
    start.disabled = !device || device.state !== "connected" || active;
    stop.disabled = !active;
    exportButton.disabled =
      !this.querySelector("[data-history-session]").value && !lastSession;
    status.textContent = active
      ? `Logging actief · ${activeSession.sessionId}`
      : lastSession
        ? "Logging gestopt · export beschikbaar"
        : "Logging gestopt";
  }

  _friendlyError(error) {
    if (!error) return "Er is een onbekende fout opgetreden.";
    if (error.code === "TRANSPORT_DEVICE_SELECTION_CANCELLED")
      return "Apparaatselectie geannuleerd.";
    if (error.code === "TRANSPORT_PERMISSION_DENIED")
      return "Geen toestemming voor apparaattoegang.";
    if (error.code?.includes("UNAVAILABLE"))
      return "Deze browser ondersteunt de gevraagde verbinding niet.";
    return error.message ?? error.code ?? "Verbinding mislukt.";
  }

  _setMessage(message) {
    const target = this.querySelector("[data-message]");
    if (target) target.textContent = message;
  }

  _renderStatus() {
    const badge = this.querySelector("[data-status]");
    const connect = this.querySelector("[data-connect]");
    const disconnect = this.querySelector("[data-disconnect]");
    const current = this._currentDeviceId
      ? this._deviceStates.get(this._currentDeviceId)
      : null;
    const state = current?.state ?? "disconnected";
    badge.lastChild.textContent =
      STATE_LABELS[state] ?? "Geen instrument verbonden";
    badge.dataset.state = state;
    connect.disabled = ["connecting", "initializing", "disconnecting"].includes(
      state,
    );
    disconnect.disabled = state !== "connected";
  }

  _renderDevices() {
    const list = this.querySelector("[data-devices]");
    const activeDevice = this.querySelector("[data-active-device]");
    list.replaceChildren();
    activeDevice.replaceChildren();

    if (!this._deviceStates.size) {
      this._currentDeviceId = null;
      activeDevice.disabled = true;
      const option = document.createElement("option");
      option.value = "";
      option.textContent = "Geen instrument verbonden";
      activeDevice.append(option);
      const item = document.createElement("li");
      item.className = "empty-state";
      item.textContent = "Geen instrument verbonden";
      list.append(item);
      return;
    }

    if (!this._deviceStates.has(this._currentDeviceId)) {
      this._currentDeviceId = [...this._deviceStates.keys()].at(-1);
    }
    activeDevice.disabled = false;
    for (const device of this._deviceStates.values()) {
      const option = document.createElement("option");
      option.value = device.deviceId;
      option.textContent =
        [device.manufacturer, device.model].filter(Boolean).join(" ") ||
        device.profileId ||
        device.deviceId;
      option.selected = device.deviceId === this._currentDeviceId;
      activeDevice.append(option);

      const item = document.createElement("li");
      const name = document.createElement("strong");
      name.textContent = option.textContent;
      const state = document.createElement("span");
      state.textContent =
        STATE_LABELS[device.state] ?? device.state ?? "Status onbekend";
      item.append(name, state);
      list.append(item);
    }
  }

  _renderMeasurement() {
    const reading = this.querySelector("[data-reading]");
    const measurement = this._currentDeviceId
      ? (this._latestMeasurements.get(
          `${this._currentDeviceId}\u0000primary`,
        ) ??
        [...this._latestMeasurements.entries()].find(([key]) =>
          key.startsWith(`${this._currentDeviceId}\u0000`),
        )?.[1])
      : null;
    const value = reading.querySelector(".reading-value");
    const unit = reading.querySelector(".reading-unit");
    const quality = this.querySelector("[data-quality]");
    const detail = this.querySelector("[data-detail]");
    if (!measurement) {
      value.textContent = "—";
      unit.textContent = "";
      quality.textContent = "Geen meetgegevens";
      detail.textContent = "Verbind een instrument om metingen te ontvangen.";
      return;
    }
    value.textContent =
      measurement.state === "overload"
        ? "OL"
        : measurement.state === "valid"
          ? String(measurement.value)
          : "—";
    unit.textContent = measurement.unit ?? "";
    const stateLabels = {
      overload: "Buiten bereik",
      "open-circuit": "Open kring",
      "short-circuit": "Kortsluiting",
      invalid: "Ongeldige meting",
      "warming-up": "Opwarmen",
      disconnected: "Niet verbonden",
      unavailable: "Niet beschikbaar",
      unknown: "Status onbekend",
    };
    quality.textContent =
      measurement.quality === "stale"
        ? "Verouderde meting"
        : (stateLabels[measurement.state] ??
          measurement.quality ??
          "Status onbekend");
    const metadata = measurement.metadata ?? {};
    detail.textContent = [
      measurement.function,
      measurement.quantity,
      measurement.receivedAt,
      metadata.batteryLow === true ? "Batterij laag" : null,
      metadata.hold === true ? "HOLD" : null,
      metadata.relative === true ? "REL" : null,
      metadata.peak ? `PEAK ${metadata.peak.toUpperCase()}` : null,
    ]
      .filter(Boolean)
      .join(" · ");
    this._renderChannels();
    this._renderGraph();
  }

  _renderChannels() {
    const list = this.querySelector("[data-channels]");
    list.replaceChildren();
    for (const [key, measurement] of this._latestMeasurements) {
      if (
        this._currentDeviceId &&
        !key.startsWith(`${this._currentDeviceId}\u0000`)
      ) {
        continue;
      }
      const item = document.createElement("li");
      item.textContent = `${measurement.channelId}: ${
        measurement.value ?? "OL"
      } ${measurement.unit ?? ""} · ${measurement.function ?? "onbekend"}`;
      list.append(item);
    }
  }

  _renderGraph() {
    const graph = this.querySelector("[data-graph]");
    const detail = this.querySelector("[data-graph-detail]");
    if (!graph || !detail) return;
    graph.replaceChildren();
    const windowMs = Number(this.querySelector("[data-graph-window]").value);
    const now = Date.now();
    const measurement = this._currentDeviceId
      ? (this._latestMeasurements.get(
          `${this._currentDeviceId}\u0000primary`,
        ) ??
        [...this._latestMeasurements.entries()].find(([key]) =>
          key.startsWith(`${this._currentDeviceId}\u0000`),
        )?.[1])
      : null;
    if (!measurement) {
      detail.textContent = "Verbind een instrument om een trend op te bouwen.";
      return;
    }
    const points = this._measurementHistory.filter(
      (entry) =>
        entry.deviceId === measurement.deviceId &&
        entry.channelId === measurement.channelId &&
        entry.unit === measurement.unit &&
        entry.quantity === measurement.quantity &&
        entry.state === "valid" &&
        Number.isFinite(entry.value) &&
        now - new Date(entry.receivedAt).valueOf() <= windowMs,
    );
    if (points.length < 2) {
      const empty = document.createElementNS(
        "http://www.w3.org/2000/svg",
        "text",
      );
      empty.setAttribute("x", "400");
      empty.setAttribute("y", "110");
      empty.setAttribute("text-anchor", "middle");
      empty.setAttribute("class", "graph-empty");
      empty.textContent = "Minimaal twee geldige meetpunten nodig";
      graph.append(empty);
      detail.textContent = `Kanaal ${measurement.channelId} · ${
        measurement.unit ?? "eenheid onbekend"
      } · ${points.length} punt(en)`;
      return;
    }
    const values = points.map((entry) => entry.value);
    const min = Math.min(...values);
    const max = Math.max(...values);
    const span = max - min || Math.max(Math.abs(max) * 0.02, 1);
    const start = Math.min(
      ...points.map((entry) => new Date(entry.receivedAt).valueOf()),
    );
    const end = Math.max(
      ...points.map((entry) => new Date(entry.receivedAt).valueOf()),
    );
    const duration = end - start || 1;
    const coordinates = points.map((entry) => {
      const x =
        48 + ((new Date(entry.receivedAt).valueOf() - start) / duration) * 704;
      const y = 184 - ((entry.value - min) / span) * 148;
      return `${x.toFixed(1)},${y.toFixed(1)}`;
    });
    const line = document.createElementNS(
      "http://www.w3.org/2000/svg",
      "polyline",
    );
    line.setAttribute("points", coordinates.join(" "));
    line.setAttribute("fill", "none");
    line.setAttribute("stroke", "currentColor");
    line.setAttribute("stroke-width", "3");
    line.setAttribute("stroke-linecap", "round");
    line.setAttribute("stroke-linejoin", "round");
    graph.append(line);
    detail.textContent = `${measurement.function ?? "Meting"} · ${
      measurement.unit
    } · min ${min} · max ${max} · ${points.length} punten`;
  }

  _renderAll() {
    this._renderStatus();
    this._renderDevices();
    this._renderMeasurement();
    this._renderLogging();
  }
}
