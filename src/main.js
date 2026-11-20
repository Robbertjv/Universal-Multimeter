import "./styles.css";
import { UniversalMultimeterApp } from "./components/universal-multimeter-app.js";

if (!customElements.get("universal-multimeter-app")) {
  customElements.define("universal-multimeter-app", UniversalMultimeterApp);
}
