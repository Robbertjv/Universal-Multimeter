import { describe, expect, it } from "vitest";
import { UniversalMultimeterApp } from "./universal-multimeter-app.js";

describe("UniversalMultimeterApp", () => {
  it("renders the initial application shell and disconnected state", () => {
    customElements.define("test-universal-multimeter-app", UniversalMultimeterApp);
    const app = document.createElement("test-universal-multimeter-app");

    document.body.append(app);

    expect(app.shadowRoot.textContent).toContain("Universal Multimeter");
    expect(app.shadowRoot.textContent).toContain("Geen instrument verbonden");
    expect(app.shadowRoot.querySelector('[role="status"]')).not.toBeNull();
  });
});