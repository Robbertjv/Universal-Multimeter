import { describe, expect, it } from "vitest";
import { createFluke187Runtime } from "../app-runtime.js";
import { UniversalMultimeterApp } from "./universal-multimeter-app.js";

describe("Fluke 187 application runtime", () => {
  it("registers the Fluke profile, driver and Web Serial transport", () => {
    const runtime = createFluke187Runtime({ serial: {} });
    expect(runtime.deviceManager.listDeviceProfiles()).toMatchObject([
      { profileId: "fluke.187.ir-serial", driverId: "fluke.187", transportId: "web.serial" },
    ]);
  });
});

describe("UniversalMultimeterApp", () => {
  it("renders a Fluke connection control and initial measurement state", () => {
    const tag = "test-universal-multimeter-app";
    if (!customElements.get(tag)) customElements.define(tag, UniversalMultimeterApp);
    const app = document.createElement(tag);
    document.body.append(app);
    expect(app.textContent).toContain("Fluke 187");
    expect(app.querySelector('[data-action="connect"]')).not.toBeNull();
    expect(app.querySelector('[data-role="measurement-value"]').textContent).toBe("—");
    app.remove();
  });
});
