import { afterEach, describe, expect, it } from "vitest";
import { bootstrapApplication } from "./app/bootstrap.js";
import { createApplicationRuntime } from "./app/application-runtime.js";
import {
  createMockDriver,
  MOCK_DRIVER_DESCRIPTOR,
} from "./core/mock-driver.js";
import {
  MockTransport,
  MOCK_TRANSPORT_DESCRIPTOR,
} from "./core/mock-transport.js";

const mockProfile = {
  profileId: "test.mock",
  manufacturer: "Test",
  model: "Mock meter",
  driverId: "mock.multimeter",
  transportId: "mock.bytes",
};

let mountedApp;

afterEach(async () => {
  mountedApp?.remove();
  mountedApp = undefined;
  await Promise.resolve();
});

describe("production application bootstrap", () => {
  it("composes and injects the runtime, then connects and renders normalized measurements", async () => {
    let transport;
    let driver;
    const documentRef = document.implementation.createHTMLDocument();
    const appElement = documentRef.createElement("universal-multimeter-app");
    documentRef.body.append(appElement);

    // Use the real composition root with deterministic mock hardware. This
    // exercises the same bootstrap path as src/main.js without browser prompts.
    const { app, runtime } = bootstrapApplication({
      documentRef,
      runtimeFactory: () =>
        createApplicationRuntime({
          registerBuiltInInstruments: false,
          registerBuiltInTransports: false,
          profiles: [mockProfile],
          transports: [
            {
              descriptor: MOCK_TRANSPORT_DESCRIPTOR,
              factory: () => (transport = new MockTransport()),
            },
          ],
          drivers: [
            {
              descriptor: MOCK_DRIVER_DESCRIPTOR,
              factory: (dependencies) =>
                (driver = createMockDriver(dependencies)),
            },
          ],
          idFactory: () => "bootstrap-test-device",
        }),
    });
    mountedApp = app;

    expect(app).toBe(appElement);
    expect(app.querySelector("[data-profile]").value).toBe("test.mock");
    expect(runtime.listProfiles()).toEqual([
      expect.objectContaining(mockProfile),
    ]);

    // Connecting is only attempted after the actual UI click.
    app.querySelector("[data-connect]").click();
    await vi.waitFor(() => {
      expect(runtime.listConnectedDevices()).toHaveLength(1);
    });

    expect(transport.state).toBe("connected");
    expect(driver.state).toBe("running");

    driver.publish("measurement", {
      quantity: "voltage",
      function: "voltage.dc",
      value: 12.4,
      unit: "V",
      state: "valid",
      quality: "good",
      channelId: "primary",
    });

    expect(app.querySelector(".reading-value").textContent).toBe("12.4");
    expect(app.querySelector(".reading-unit").textContent).toBe("V");

    app.remove();
    mountedApp = undefined;
    await vi.waitFor(() => expect(runtime.isDisposed).toBe(true));
    expect(runtime.listConnectedDevices()).toEqual([]);
  });
});
