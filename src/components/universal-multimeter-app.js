const template = document.createElement("template");

template.innerHTML = `
  <main class="app-shell">
    <header class="app-header">
      <div>
        <p class="eyebrow">MEETINSTRUMENTEN · UNIVERSELE INTERFACE</p>
        <h1>Universal Multimeter</h1>
        <p class="intro">
          Eén werkplek voor multimeters en andere meetinstrumenten.
        </p>
      </div>
      <span class="connection-badge" role="status" aria-live="polite">
        <span class="status-dot" aria-hidden="true"></span>
        Geen instrument verbonden
      </span>
    </header>

    <section class="welcome-card" aria-labelledby="welcome-title">
      <p class="eyebrow">APPLICATIEBASIS</p>
      <h2 id="welcome-title">De basis staat klaar</h2>
      <p>
        De applicatiestructuur is actief. Apparaatverbindingen, drivers,
        metingen en grafieken worden in volgende ontwikkelstappen toegevoegd.
      </p>
    </section>

    <footer class="app-footer">
      <span>Universal Multimeter Web Interface</span>
      <span>Foundation v0.1.0</span>
    </footer>
  </main>
`;

export class UniversalMultimeterApp extends HTMLElement {
  constructor() {
    super();
  }

  connectedCallback() {
    if (this.childElementCount === 0) {
      this.append(template.content.cloneNode(true));
    }
  }
}