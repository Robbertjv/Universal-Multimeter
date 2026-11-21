import { createApplicationRuntime } from "./application-runtime.js";
import { UniversalMultimeterApp } from "../components/universal-multimeter-app.js";

/**
 * Register the application element, compose its runtime and inject the runtime
 * before the browser starts handling user interaction.
 */
export function bootstrapApplication({
  documentRef = globalThis.document,
  runtimeFactory = createApplicationRuntime,
} = {}) {
  if (!documentRef) {
    throw new Error("A document is required to bootstrap the application.");
  }

  const registry =
    documentRef.defaultView?.customElements ?? globalThis.customElements;
  if (!registry.get("universal-multimeter-app")) {
    registry.define("universal-multimeter-app", UniversalMultimeterApp);
  }

  const app = documentRef.querySelector("universal-multimeter-app");
  if (!app) {
    throw new Error("The <universal-multimeter-app> root element was not found.");
  }

  const runtime = runtimeFactory();
  app.setRuntime(runtime);

  return Object.freeze({ app, runtime });
}
