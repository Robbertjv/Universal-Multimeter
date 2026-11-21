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

    <section class="device-list-panel" aria-labelledby="devices-title">
      <h2 id="devices-title">Verbonden instrumenten</h2>
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
      option.textContent = `${profile.manufacturer} ${profile.model} · ${profile.supportLevel ?? "status onbekend"}`;
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
    ];
    for (const type of eventTypes) {
      this._unsubscribers.push(this._runtime.on(type, (event) => this._handleRuntimeEvent(event)));
    }
    for (const device of this._runtime.listConnectedDevices()) {
      this._deviceStates.set(device.deviceId, device);
      this._currentDeviceId ??= device.deviceId;
    }
    for (const measurement of this._runtime.getSnapshot()) {
      this._latestMeasurements.set(measurement.deviceId, measurement);
    }
    this._renderAll();
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
        this._setMessage(`${event.device.manufacturer} ${event.device.model} is verbonden.`);
        break;
      case "device-disconnected":
        this._deviceStates.delete(event.deviceId);
        this._latestMeasurements.delete(event.deviceId);
        if (this._currentDeviceId === event.deviceId) {
          this._currentDeviceId = this._deviceStates.keys().next().value ?? null;
        }
        this._setMessage("Instrumentverbinding verbroken.");
        break;
      case "device-error":
      case "measurement-error":
        this._setMessage(this._friendlyError(event.error));
        break;
      case "device-warning":
        this._setMessage(event.warning?.message ?? event.warning?.code ?? "Waarschuwing van instrument.");
        break;
      case "measurement":
        for (const measurement of event.measurements ?? []) {
          this._latestMeasurements.set(measurement.deviceId, measurement);
          this._currentDeviceId = measurement.deviceId;
        }
        break;
      default:
        break;
    }
    this._renderAll();
  }

  _friendlyError(error) {
    if (!error) return "Er is een onbekende fout opgetreden.";
    if (error.code === "TRANSPORT_DEVICE_SELECTION_CANCELLED") return "Apparaatselectie geannuleerd.";
    if (error.code === "TRANSPORT_PERMISSION_DENIED") return "Geen toestemming voor apparaattoegang.";
    if (error.code?.includes("UNAVAILABLE")) return "Deze browser ondersteunt de gevraagde verbinding niet.";
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
    badge.lastChild.textContent = STATE_LABELS[state] ?? "Geen instrument verbonden";
    badge.dataset.state = state;
    connect.disabled = ["connecting", "initializing", "connected", "disconnecting"].includes(state);
    disconnect.disabled = state !== "connected";
  }

  _renderDevices() {
    const list = this.querySelector("[data-devices]");
    list.replaceChildren();
    if (!this._deviceStates.size) {
      const item = document.createElement("li");
      item.className = "empty-state";
      item.textContent = "Geen instrument verbonden";
      list.append(item);
      return;
    }
    for (const device of this._deviceStates.values()) {
      const item = document.createElement("li");
      const name = document.createElement("strong");
      name.textContent = [device.manufacturer, device.model].filter(Boolean).join(" ") || device.profileId || device.deviceId;
      const state = document.createElement("span");
      state.textContent = STATE_LABELS[device.state] ?? device.state ?? "Status onbekend";
      item.append(name, state);
      list.append(item);
    }
  }

  _renderMeasurement() {
    const reading = this.querySelector("[data-reading]");
    const measurement = this._currentDeviceId
      ? this._latestMeasurements.get(this._currentDeviceId)
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
    value.textContent = measurement.value === null ? "OL" : String(measurement.value);
    unit.textContent = measurement.unit ?? "";
    quality.textContent = measurement.quality === "stale"
      ? "Verouderde meting"
      : measurement.state === "overload"
        ? "Buiten bereik"
        : measurement.quality ?? "Status onbekend";
    detail.textContent = [measurement.function, measurement.quantity, measurement.receivedAt]
      .filter(Boolean).join(" · ");
  }

  _renderAll() {
    this._renderStatus();
    this._renderDevices();
    this._renderMeasurement();
  }
}
