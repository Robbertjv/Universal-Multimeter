import appTemplate from "./app-template.html?raw";
import { createFluke187Runtime } from "../app-runtime.js";

const template = document.createElement("template");
template.innerHTML = appTemplate;


function formatValue(record) {
  if (record.state === "overload") return "OL";
  if (record.state !== "valid" || record.value === null) return "—";
  return `${record.value} ${record.unit}`;
}

function describeError(error) {
  const code = error?.code ?? error?.cause?.code;
  const messages = {
    TRANSPORT_SERIAL_UNAVAILABLE:
      "Web Serial is niet beschikbaar. Gebruik een ondersteunde Chromium-browser via HTTPS of localhost.",
    TRANSPORT_PERMISSION_DENIED:
      "Toegang tot de seriële poort is geweigerd.",
    TRANSPORT_DEVICE_SELECTION_CANCELLED:
      "Selectie van de seriële poort is geannuleerd.",
    DEVICE_CONNECT_FAILED:
      "Verbinden is mislukt. Controleer de adapter en probeer opnieuw.",
  };
  return (
    messages[code] ??
    error?.message ??
    "Er is een onbekende verbindingsfout opgetreden."
  );
}

export class UniversalMultimeterApp extends HTMLElement {
  constructor() {
    super();
    this._runtime = null;
    this._deviceId = null;
    this._unsubscribers = [];
    this._measurementSubscription = null;
    this._busy = false;
  }

  connectedCallback() {
    if (this.childElementCount !== 0) return;
    this.append(template.content.cloneNode(true));
    this._connectButton = this.querySelector('[data-action="connect"]');
    this._disconnectButton = this.querySelector('[data-action="disconnect"]');
    this._message = this.querySelector('[data-role="message"]');
    this._connectionLabel = this.querySelector(
      '[data-role="connection-label"]',
    );
    this._measurementValue = this.querySelector(
      '[data-role="measurement-value"]',
    );
    this._measurementState = this.querySelector(
      '[data-role="measurement-state"]',
    );
    this._measurementMeta = this.querySelector(
      '[data-role="measurement-meta"]',
    );
    this._identity = this.querySelector('[data-role="identity"]');
    this._connectButton.addEventListener("click", () =>
      void this._connect(),
    );
    this._disconnectButton.addEventListener("click", () =>
      void this._disconnect(),
    );

    this._runtime = createFluke187Runtime();
    const { deviceManager, measurementEngine } = this._runtime;
    this._unsubscribers.push(
      deviceManager.on("device-state", (event) =>
        this._renderDeviceState(event.state),
      ),
      deviceManager.on("device-error", (event) =>
        this._setMessage(describeError(event.error), true),
      ),
      deviceManager.on("device-identification", (event) => {
        this._identity.textContent =
          event.identification?.reported ?? "Fluke 187";
      }),
      deviceManager.on("device-warning", (event) =>
        this._setMessage(
          `Instrumentwaarschuwing: ${event.warning?.code ?? "onbekend"}`,
          true,
        ),
      ),
      deviceManager.on("device-disconnected", () => {
        this._deviceId = null;
        this._renderDeviceState("disconnected");
      }),
    );
    this._measurementSubscription = measurementEngine.subscribe((event) => {
      for (const record of event.measurements ?? []) {
        this._renderMeasurement(record);
      }
    });
  }

  disconnectedCallback() {
    for (const unsubscribe of this._unsubscribers.splice(0)) {
      unsubscribe();
    }
    if (this._measurementSubscription !== null) {
      this._runtime?.measurementEngine.unsubscribe(
        this._measurementSubscription,
      );
      this._measurementSubscription = null;
    }
    if (this._deviceId) {
      void this._runtime?.deviceManager.disconnect(
        this._deviceId,
        "view-removed",
      );
    }
  }

  _setMessage(message, isError = false) {
    this._message.textContent = message;
    this._message.classList.toggle("error", isError);
  }

  _renderDeviceState(state) {
    const labels = {
      connecting: "Verbinden…",
      initializing: "Instrument initialiseren…",
      connected: "Fluke 187 verbonden",
      disconnecting: "Verbinding verbreken…",
      disconnected: "Geen instrument verbonden",
      error: "Verbindingsfout",
    };
    this._connectionLabel.textContent = labels[state] ?? state;
    const connected = state === "connected";
    this._connectButton.disabled = this._busy || connected;
    this._disconnectButton.disabled = this._busy || !connected;
  }

  _renderMeasurement(record) {
    this._measurementValue.textContent = formatValue(record);
    this._measurementState.textContent =
      record.state === "overload"
        ? "Overbelasting"
        : record.quality === "stale"
          ? "Verouderd"
          : record.state;
    this._measurementMeta.textContent = [
      `Kanaal: ${record.channelId}`,
      `ontvangen: ${new Date(record.receivedAt).toLocaleTimeString()}`,
    ].join(" · ");
  }

  async _connect() {
    if (this._busy || this._deviceId) return;
    this._busy = true;
    this._renderDeviceState("connecting");
    this._setMessage(
      "Selecteer de seriële poort van de Fluke IR-adapter in de browser…",
    );
    try {
      // Called directly from the user's click gesture for Web Serial permission.
      const device = await this._runtime.deviceManager.connect(
        "fluke.187.ir-serial",
      );
      this._deviceId = device.deviceId;
      this._setMessage(
        "Verbonden. De driver vraagt nu periodiek de actuele meting op.",
      );
      this._identity.textContent =
        "Fluke 187 · 9600 baud · 8N1 · alleen-lezen ID/QM-commando's";
    } catch (error) {
      this._setMessage(describeError(error), true);
      this._renderDeviceState("disconnected");
    } finally {
      this._busy = false;
      this._renderDeviceState(
        this._deviceId ? "connected" : "disconnected",
      );
    }
  }

  async _disconnect() {
    if (this._busy || !this._deviceId) return;
    this._busy = true;
    this._renderDeviceState("disconnecting");
    try {
      await this._runtime.deviceManager.disconnect(this._deviceId);
      this._deviceId = null;
      this._setMessage("Instrument veilig losgekoppeld.");
      this._identity.textContent = "";
      this._measurementValue.textContent = "—";
      this._measurementState.textContent = "Geen verbinding";
      this._measurementMeta.textContent =
        "Wacht op een meetwaarde van het instrument.";
    } catch (error) {
      this._setMessage(describeError(error), true);
    } finally {
      this._busy = false;
      this._renderDeviceState(
        this._deviceId ? "connected" : "disconnected",
      );
    }
  }
}
