import {LitElement, css, html, repeat} from 'https://cdn.jsdelivr.net/gh/lit/dist@3.1.3/all/lit-all.min.js';
import 'https://esm.run/@material/web/all.js';

export default class MyElement extends LitElement {
  static properties = {
    name: {},
  };

  static styles = css`
    :host {
      display: block;
    }
  `;

  constructor() {
    super();
  }
  
  async firstUpdated() {
    super.firstUpdated()
  }

  render() {
    return html`
      Hello ${this.name}
    `;
  }
}
customElements.define('my-element', MyElement);
