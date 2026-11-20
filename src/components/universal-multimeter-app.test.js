import { describe, expect, it } from "vitest";
import { UniversalMultimeterApp } from "./universal-multimeter-app.js";

describe("UniversalMultimeterApp", () => {
  it("renders the initial application shell and disconnected state", () => {
    customElements.define(
      "test-universal-multimeter-app",
      UniversalMultimeterApp,
    );
    const app = document.createElement("test-universal-multimeter-app");

    document.body.append(app);

    expect(app.textContent).toContain("Universal Multimeter");
    expect(app.textContent).toContain("Geen instrument verbonden");
    expect(app.querySelector('[role="status"]')).not.toBeNull();
  });
});
