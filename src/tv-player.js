import {LitElement, css, html, repeat} from 'https://cdn.jsdelivr.net/gh/lit/dist@3/all/lit-all.min.js';
import Hls from 'https://cdn.jsdelivr.net/npm/hls.js@1.5.17/+esm';
import dashjs from 'https://cdn.jsdelivr.net/npm/dashjs@4.7.4/+esm';
import 'https://esm.run/@material/web/all.js';

export default class TvPlayer extends LitElement {
  static properties = {
    playlist: {},
    streams: {type:Object},
    streamFilter: {type:String},
    videoWidth: {type:Number},
    videHeight: {type:Number},
  };

  static styles = css`
    :host {
      display: block;
      height: 100%;
      --graphic-width: 80px;
      --graphic-height: 40px;
      font-family: system-ui;
      container-type: size;
    }

    .vertical {
      display: flex;
      flex-direction: column;
      height: 100%;
      width: 100%;
    }

    .horizontal {
      display: flex;
      width: 100%;
      height: 100%;
    }

    #header {
      flex: auto;
      overflow: auto;
    }

    #videoContainer {
      display: flex;
      flex: auto;
      overflow: hidden;
    }

    #video {
      height: 100%;
      width: 100%;
      object-position: top;
    }

    #youtube {
      display: none;
      flex: auto;
    }

    #icons {
      display: none;
    }

    #channels {
      display: flex;
      justify-content: center;
    }

    [channel] {
      border-bottom: 4px solid transparent;
    }

    [channel][selected] {
      border-bottom: 4px solid silver;
    }

    md-text-button {
      box-sizing: border-box;
      border-radius: 0;
    }

    md-text-button svg, 
    md-text-button img {
      width: var(--graphic-width);
      height: var(--graphic-height);
    }

    *:not(:defined) {
      /* prevents FOUC of web components */
      display: none;
    }

    .tvg-logo {
      width: 30px;
      height: 30px;
      object-fit: contain;
    }

    .tvg-logo.loadfail {
      visibility: hidden;
    }

    #sidePanel {
      overflow: hidden;
      background-color: white;
      flex: none;
      width: 0px;
      transition: width .1s ease-in-out;
    }

    #sidePanel[show] {
      width: 300px;
    }

    #streamList {
      width: 300px;
      overflow: hidden;
      flex: auto;
    }

    #sidePanel[show] #streams {
      display: initial;
    }

    #streams {
      display: none;
      overflow: auto;
    }

    .channel {
      display: grid;
      grid-template-columns: auto 1fr;
      gap: 1em;
      align-items: center;
      padding: 0.5em;
      border-bottom: 1px solid whitesmoke;
    }

    .channel:hover {
      background-color: silver;
      cursor: default;
    }

    .channel > div {
      overflow: hidden;
      text-overflow: ellipsis;
      white-space: nowrap;
    }

    @container (width < 700px) or (height < 700px) {
      #channels {
          display: none;
      }
    }

    #streamInfo {
      border-top: 1px solid silver;
      padding: 1em;
      font-family: monospace
    }
  `;

  constructor() {
    super();

    this.streams = {};

    this.CHANNELS = {
      // "bbcone": "BBCOneEast.uk",
      "bbcone": "https://vs-cmaf-pushb-uk-live.akamaized.net/x=4/i=urn:bbc:pips:service:bbc_one_east/pc_hd_abr_v2.mpd",
      "bbctwo": "https://vs-cmaf-push-uk.live.fastly.md.bbci.co.uk/x=4/i=urn:bbc:pips:service:bbc_two_hd/pc_hd_abr_v2.mpd",
      "bbcthree": "https://vs-cmaf-pushb-uk.live.fastly.md.bbci.co.uk/x=4/i=urn:bbc:pips:service:bbc_three_hd/iptv_hd_abr_v1.mpd",
      "bbcfour": "https://vs-cmaf-pushb-uk.live.fastly.md.bbci.co.uk/x=4/i=urn:bbc:pips:service:bbc_four_hd/iptv_hd_abr_v1.mpd",
      "bbcnews": "https://vs-cmaf-push-ww-live.akamaized.net/x=4/i=urn:bbc:pips:service:bbc_news_channel_hd/iptv_hd_abr_v1.mpd",
      "redbuttonone": "https://vs-cmaf-pushb-uk.live.cf.md.bbci.co.uk/x=4/i=urn:bbc:pips:service:red_button_one/iptv_hd_abr_v1.mpd",
    }
  }
  
  async firstUpdated() {
    super.firstUpdated()

    const youtube = this.renderRoot.querySelector("#youtube");

    window.addEventListener('dragover', e => {
      e.preventDefault();
    }, true);

    window.addEventListener("drop", e => {
      const url = e.dataTransfer.getData("text/uri-list");
      if (url == null) return;

      e.preventDefault();

      this.setUrl(url);
    }, true);

    this.streams = await this.getStreams();

    const video = this.renderRoot.querySelector("#video");

    video.addEventListener("resize", e => {
      this.videoWidth = video.videoWidth
      this.videoHeight = video.videoHeight

      const meta = this.getVideoMeta();

      this.videoFrameRate = meta.frameRate;
    });

    this.hls = new Hls();
    this.hls.on(Hls.Events.MANIFEST_PARSED, () => video.play());

    this.dashPlayer = dashjs.MediaPlayer().create();

    window.addEventListener("keydown", e => {
      const video = this.renderRoot.querySelector("#video");

      if (e.composedPath()[0].tagName == "INPUT") return;

      switch(e.key) {
        case "f":
          document.fullscreen ? document.exitFullscreen() : video.requestFullscreen();
          break;
      }
    });
  }

  getVideoMeta() {
    if (this.dashPlayer.isReady()) {
      return this.getDashPlayerVideoMeta();
    }

    return this.getHlsPlayerVideoMeta();
  }

  getDashPlayerVideoMeta() {
    const player = this.dashPlayer;
    const streamInfo = player.getActiveStream().getStreamInfo();
    const dashMetrics = player.getDashMetrics();
    const dashAdapter = player.getDashAdapter();

    const periodIdx = streamInfo.index;
    const repSwitch = dashMetrics.getCurrentRepresentationSwitch('video', true);
    const bufferLevel = dashMetrics.getCurrentBufferLevel('video', true);
    const bitrate = repSwitch ? Math.round(dashAdapter.getBandwidthForRepresentation(repSwitch.to, periodIdx) / 1000) : NaN;
    const adaptation = dashAdapter.getAdaptationForType(periodIdx, 'video', streamInfo);
    const currentRep = adaptation.Representation_asArray.find(function (rep) {
      return rep.id === repSwitch.to
    })
    const frameRate = currentRep.frameRate;
    const resolution = currentRep.width + 'x' + currentRep.height;

    return { frameRate, resolution, bitrate };
  }

  getHlsPlayerVideoMeta() {
    const frameRate = "unknown", resolution = "unknown", bitrate = "unknown";
    return { frameRate, resolution, bitrate };
  }

  watch(e) {
    const button = e.target;
    if (!(button instanceof customElements.get("md-text-button"))) return;

    const channel = button.getAttribute("channel");

    const id = this.CHANNELS[channel];

    let url;
    if (id.startsWith("https://"))
      url = id;
    else
      url = this.streams[id].url;

    const video = this.renderRoot.querySelector('#video');

    this.setUrl(url);

    for(let b of this.renderRoot.querySelectorAll("[channel]")) {
      b.removeAttribute("selected");
    }

    button.setAttribute("selected","");
  }

  watchUrl() {
    const video = this.renderRoot.getElementById('video');
    const youtube = this.renderRoot.getElementById('youtube');

    const fieldUrl  = this.renderRoot.getElementById('url');

    const url = fieldUrl.value;

    youtube.setAttribute("src", "");

    try { this.dashPlayer.reset() } catch {}

    this.hls.detachMedia(video);

    if (url === "") {
      const video = this.renderRoot.getElementById("video");
      video.pause();
      video.removeAttribute('src');
      video.load();
      return;
    }

    video.style.display = "";
    youtube.style.display = "none";

    if (url.startsWith("https://www.youtube.com/")) {
      video.style.display = "none";
      youtube.style.display = "block";
      const yturl = new URL(url);
      const v = yturl.searchParams.get("v");
      youtube.setAttribute("src", `https://www.youtube.com/embed/${v}?autoplay=1`);
    }
    else if (url.endsWith(".mpd")) {
      this.dashPlayer.initialize(video, url, true);
    } else {
      this.hls.loadSource(url);
      this.hls.attachMedia(video);
    }
  }

  clearUrl() {
    const video = this.renderRoot.getElementById('video');
    const youtube = this.renderRoot.getElementById('youtube');
    video.style.display = "";
    youtube.style.display = "none";
    youtube.setAttribute("src", "");
    this.setUrl("");
  }

  async getStreams() {
    const streamList = await this.getStreamList(this.playlist);
    let streams = Object.assign({}, 
      streamList
    );

    // remove dupes, and sort
    var collator = new Intl.Collator('en', {numeric: true, sensitivity: 'base'});

    streams = Object.fromEntries(
      Object.entries(streams).sort((a,b) => collator.compare(a[1].desc, b[1].desc))
    );

    return streams;
  }

  async getStreamList(url) {
    const m3u = await (await fetch(url)).text();

    m3u.split("\n");

    const d = m3u.split("\n");

    const streams = {};

    let getUrl = false;
    let tvgId;

    const regexBbcRedButton = new RegExp('urn:bbc:pips:service:uk_sport_stream_');

    for (let n = 0; n < d.length; n++) {
      let e = d[n];

      if (!getUrl) {
        if (!e.startsWith("#EXTINF:")) continue;
      } else {
        if (e.startsWith("#EXT")) continue;

        if (regexBbcRedButton.test(e)) {
          e = e.replace("/x=3/", "/x=4/");
        }

        e = e.trim();

        streams[tvgId].url = e;

        getUrl = false;

        continue;
      }

      const desc = e.match(/([^,]+)$/)[1].replace(" \[Geo-blocked\]", "");
      tvgId = e.match(/tvg-id="(.*?)"/)[1] || desc;
      const logo = e.match(/tvg-logo="(.*?)"/)[1];

      if (streams[tvgId] === undefined) {
        streams[tvgId] = {
          id: tvgId,
          desc: desc,
          logo: logo,
        }

        getUrl = true;
      }
    }

    return streams;
  }

  setUrl(url) {
    const fieldUrl  = this.renderRoot.getElementById('url');

    fieldUrl.value = url;

    this.watchUrl();
  }

  streamChange(e) {
    const channel = e.target.closest(".channel");
    const stream = this.streams[channel.getAttribute("stream")];
    this.setUrl(stream.url);
  }

  toggleSidePanel(e) {
    const sidePanel = this.renderRoot.querySelector("#sidePanel");
    if (e.target.selected)
      sidePanel.setAttribute("show", "");
    else
      sidePanel.removeAttribute("show");
  }

  streamFilterInput(e) {
    let filter = e.target.value;
    if (filter.length == 0) filter = null;
    this.streamFilter = filter;

    this.renderRoot.querySelector("#streams").scrollTo(0,0);
  }

  getFilteredStreamList(streamList) {
    let streams = Object.entries(streamList);

    if (this.streamFilter != null) {
        streams = streams.filter(([streamId, stream]) => stream.desc.toUpperCase().includes(this.streamFilter.toUpperCase()))
    }

    return streams.map(([streamId, stream]) => stream);
  }

  getStreamInfo() {
    return html`resolution: ${this.videoWidth}x${this.videoHeight}
<br>
framerate: ${this.videoFrameRate}`;
  }

  keydownUrl(e) {
    switch(e.key) {
      case "Enter":
        this.watchUrl();
        break;
    }
  }

  render() {
    /*
    return html`
<md-chip-set style="background-color:white">
  <md-input-chip label="Ping Qiang" style="--md-input-chip-icon-size:0; --md-input-chip-icon-label-spacex:0; --md-input-chip-with-trailing-icon-trailing-space:0" >
  </md-input-chip>
</md-chip-set>`;
*/

    return html`
  <div id="icons">
    <svg id="iplayer-nav-icon-bbcfour-active" viewBox="0 0 76 32">
      <path fill="#7831eb" d="M0 0h76v32H0z"></path>
      <path d="M15 10.262h8.323v2.234h-5.636v3.071h4.973V17.8h-4.973v4.938H15V10.263zM30.461 10c.942 0 1.794.151 2.556.454a5.46 5.46 0 0 1 1.954 1.3c.541.564.957 1.245 1.248 2.042s.437 1.696.437 2.696c0 .989-.146 1.885-.437 2.687s-.706 1.489-1.248 2.059-1.192 1.006-1.954 1.309-1.614.453-2.556.453-1.795-.151-2.557-.453-1.413-.739-1.954-1.309-.957-1.257-1.248-2.059-.436-1.698-.436-2.687c0-1 .145-1.899.436-2.696s.706-1.477 1.248-2.042 1.192-.997 1.954-1.3S29.518 10 30.461 10zm0 10.662c.709 0 1.32-.165 1.832-.497s.901-.805 1.169-1.422.401-1.367.401-2.251-.134-1.634-.401-2.251-.657-1.088-1.169-1.413-1.123-.489-1.832-.489-1.321.163-1.833.489-.901.797-1.169 1.413-.401 1.367-.401 2.251.133 1.635.401 2.251.657 1.091 1.169 1.422 1.123.497 1.833.497zM43.548 23c-1.116 0-2.074-.212-2.87-.637s-1.407-1.038-1.832-1.841-.637-1.768-.637-2.897v-7.364h2.687v7.66c0 .884.23 1.562.689 2.033s1.114.706 1.963.706 1.504-.235 1.963-.706.689-1.149.689-2.033v-7.66h2.687v7.364c0 1.128-.212 2.094-.637 2.897s-1.039 1.416-1.841 1.841-1.756.637-2.862.637zm9.894-4.798v4.537H50.79V10.263h4.554c1.64 0 2.9.343 3.778 1.029s1.318 1.67 1.318 2.949c0 .826-.195 1.53-.584 2.112s-.946 1.03-1.666 1.344l1.553 2.486 1.536 2.556h-3.088l-2.6-4.537H53.444zm0-2.112h1.745c.826 0 1.454-.148 1.884-.445s.646-.765.646-1.405-.213-1.111-.637-1.413-1.05-.453-1.876-.453h-1.763v3.717z" fill="#fff" fill-rule="nonzero"></path>
    </svg>
    <svg id="iplayer-nav-icon-bbcnews-active" viewBox="0 0 76 32">
      <path fill="#eb0000" d="M0 0h76v32H0z"></path>
      <path d="m21.097 22.738-2.757-4.371-2.757-4.249v8.62H13V10.261h2.722l2.783 4.232 2.731 4.301v-8.533h2.583v12.477h-2.722zm5.025-12.476h8.585v2.234h-5.898V15.2h5.235v2.233h-5.235v3.071h6.23v2.233h-8.917zm20.032 12.476-1.16-4.223-1.108-4.223-1.082 4.223-1.152 4.223h-2.844l-1.71-6.177-1.553-6.299h2.932l.925 4.851 1.029 4.764 2.216-9.091h2.617l1.073 4.458 1.126 4.441 1.012-4.677.907-4.746h2.879l-1.553 6.3-1.71 6.177h-2.844zM57.042 23a9.21 9.21 0 0 1-2.033-.227 7.78 7.78 0 0 1-1.928-.715V19.65c1.245.756 2.565 1.134 3.961 1.134.791 0 1.393-.134 1.806-.401a1.26 1.26 0 0 0 .62-1.117c0-.361-.102-.643-.305-.846s-.474-.366-.811-.489-.715-.236-1.134-.34a12.98 12.98 0 0 1-1.815-.558c-.523-.209-.966-.456-1.326-.742s-.634-.628-.82-1.029-.279-.881-.279-1.44c0-.791.201-1.472.602-2.042s.968-1.009 1.701-1.318S56.885 10 57.897 10a8.48 8.48 0 0 1 1.954.227 7.94 7.94 0 0 1 1.728.611v2.373a6.613 6.613 0 0 0-1.736-.733 7.43 7.43 0 0 0-1.946-.262c-.71 0-1.259.122-1.649.366s-.585.593-.585 1.047c0 .326.093.585.279.777s.451.349.794.471a13.15 13.15 0 0 0 1.213.358l1.658.497a5.38 5.38 0 0 1 1.352.689 2.87 2.87 0 0 1 .907 1.064c.215.431.323.96.323 1.588 0 .826-.204 1.533-.611 2.12s-.995 1.036-1.763 1.344-1.693.462-2.775.462z" fill="#fff" fill-rule="nonzero"></path>
    </svg>
    <svg id="iplayer-nav-icon-bbcone-active" viewBox="0 0 76 32">
      <path fill="#e8504b" d="M0 0h76v32H0z"></path>
      <path d="M31.953 13.795c-.291-.796-.707-1.477-1.248-2.042s-1.193-.997-1.955-1.3S27.137 10 26.194 10s-1.794.151-2.556.454a5.46 5.46 0 0 0-1.954 1.3c-.541.564-.957 1.245-1.248 2.042S20 15.492 20 16.492c0 .989.146 1.885.436 2.688s.707 1.489 1.248 2.059 1.192 1.006 1.954 1.309 1.614.453 2.556.453 1.794-.151 2.556-.453 1.414-.739 1.955-1.309.956-1.256 1.248-2.059.436-1.698.436-2.687c0-1-.146-1.899-.436-2.696zm-2.757 4.947c-.268.617-.657 1.091-1.169 1.422s-1.123.497-1.833.497-1.32-.165-1.832-.497-.902-.805-1.169-1.422-.402-1.367-.402-2.251.134-1.634.402-2.251.657-1.088 1.169-1.413 1.122-.489 1.832-.489 1.32.163 1.833.489.901.797 1.169 1.413.401 1.367.401 2.251-.134 1.635-.401 2.251zm12.989 3.996-2.757-4.372-2.757-4.249v8.62h-2.583V10.262h2.723l2.783 4.232 2.731 4.301v-8.533h2.582v12.477h-2.722zm4.91-12.477h8.585v2.234h-5.898V15.2h5.235v2.234h-5.235v3.071h6.23v2.234h-8.917V10.261z" fill="#fff" fill-rule="nonzero"></path>
    </svg>
    <svg id="iplayer-nav-icon-bbcthree-active" viewBox="0 0 76 32">
      <path fill="#89FF00" d="M0 0h76v32H0z"></path>
      <path d="M10 10.2h10.56v2.343h-3.934V22.7h-2.693V12.543H10V10.2Zm20.297 12.5v-5.367H24.86V22.7h-2.692V10.2h2.692v4.79h5.437V10.2h2.693v12.5h-2.693Zm7.57-4.545V22.7H35.21V10.2h4.562c1.644 0 2.906.344 3.785 1.031.88.688 1.32 1.673 1.32 2.955 0 .828-.195 1.533-.585 2.115-.39.583-.947 1.032-1.67 1.347a220.78 220.78 0 0 1 1.556 2.491 146.86 146.86 0 0 1 1.539 2.561h-3.095a124.906 124.906 0 0 0-2.605-4.545h-2.15Zm0-2.116h1.748c.827 0 1.457-.149 1.888-.446.431-.297.647-.766.647-1.407s-.213-1.113-.638-1.416c-.426-.303-1.052-.455-1.88-.455h-1.765v3.724ZM47.08 10.2h8.601v2.238h-5.909v2.71h5.245v2.237h-5.245v3.077h6.241V22.7H47.08V10.2Zm10.576 0h8.602v2.238H60.35v2.71h5.245v2.237H60.35v3.077h6.241V22.7h-8.934V10.2Z" fill="#000"></path>
    </svg>
    <svg id="iplayer-nav-icon-bbctwo-active" viewBox="0 0 76 32">
      <path fill="#10a88d" d="M0 0h76v32H0z"></path>
      <path d="M17 10.262h10.54V12.6h-3.926v10.138h-2.687V12.6H17v-2.338zm22.405 12.477-1.16-4.223-1.108-4.223-1.082 4.223-1.152 4.223h-2.844l-1.71-6.177-1.553-6.299h2.932l.925 4.851 1.03 4.764 2.216-9.091h2.617l1.073 4.459 1.125 4.441 1.012-4.676.908-4.746h2.879l-1.553 6.299-1.71 6.177h-2.845zm18.532-8.943c-.291-.796-.706-1.477-1.248-2.042s-1.193-.997-1.955-1.3S53.121 10 52.179 10s-1.794.151-2.557.454-1.413.736-1.954 1.3-.957 1.245-1.247 2.042-.437 1.696-.437 2.696c0 .989.146 1.885.437 2.688s.706 1.489 1.247 2.059 1.192 1.006 1.954 1.309 1.614.453 2.557.453 1.794-.151 2.556-.453a5.41 5.41 0 0 0 1.955-1.309c.541-.57.957-1.256 1.248-2.059s.436-1.698.436-2.687c0-1-.146-1.899-.436-2.696zm-2.757 4.947c-.268.617-.658 1.091-1.169 1.422s-1.123.497-1.832.497-1.321-.165-1.832-.497-.901-.805-1.169-1.422-.401-1.367-.401-2.251.133-1.634.401-2.251.657-1.088 1.169-1.413 1.123-.489 1.832-.489 1.32.163 1.832.489.901.797 1.169 1.413.401 1.367.401 2.251-.134 1.635-.401 2.251z" fill="#fff" fill-rule="nonzero"></path>
    </svg>
  </div>

  <div class="vertical">
    <div class="horizontal" id="header">
      <div class="vertical" id="sidePanel">
        <div id="streamList">
          <div class="vertical">
            <md-filled-text-field id="streamFilter" placeholder="Filter" @input="${this.streamFilterInput}"></md-filled-text-field>
            <div id="streams" @click="${this.streamChange}">
            ${repeat(
              this.getFilteredStreamList(this.streams),
              (stream) => stream.id,
              (stream, index) => html`
              <div class="channel" stream="${stream.id}">
                <img class="tvg-logo" loading="lazy" slot="start" src="${stream.logo}" onerror="this.classList.add('loadfail');"></img>
                <div>${stream.desc}</div>
              </div>
            `
          )}
            </div>
          </div>
        </div>
        <div id="streamInfo">
          ${this.getStreamInfo()}
        </div>
      </div>
      <div id="videoContainer">
        <iframe id="youtube" frameborder="0" allowfullscreen allow="autoplay"></iframe>
        <video id="video" controls></video>
      </div>
    </div>

    <div style="display:flex;align-items:center;column-gap:1em;justify-content:center;margin:1em 3em">
      <md-switch @change="${this.toggleSidePanel}"></md-switch>
      <md-filled-text-field id="url" placeholder="url" style="flex:auto" @keydown="${this.keydownUrl}"></md-filled-text-field>
      <md-filled-button @click="${this.watchUrl}">Go</md-filled-button>
      <md-filled-button @click="${this.clearUrl}">Clear</md-filled-button>
    </div>

    <div id="channels" @click="${this.watch}">
      <md-text-button channel="bbcone">
        <svg>
          <use href="#iplayer-nav-icon-bbcone-active"></use>
        </svg>
      </md-text-button>

      <md-text-button channel="bbctwo">
        <svg>
          <use href="#iplayer-nav-icon-bbctwo-active"></use>
        </svg>
      </md-text-button>

      <md-text-button channel="bbcthree">
        <svg>
          <use href="#iplayer-nav-icon-bbcthree-active"></use>
        </svg>
      </md-text-button>

      <md-text-button channel="bbcfour">
        <svg>
          <use href="#iplayer-nav-icon-bbcfour-active"></use>
        </svg>
      </md-text-button>

      <md-text-button channel="bbcnews">
        <svg>
          <use href="#iplayer-nav-icon-bbcnews-active"></use>
        </svg>
      </md-text-button>

      <md-text-button channel="redbuttonone">
        <img src="https://upload.wikimedia.org/wikipedia/commons/a/a3/BBC_Red_Button_2021.svg"
          style="padding:5px;height:calc(var(--graphic-height)-2.5px);background-color:white" />
      </md-text-button>
    </div>
  </div>
  `;
  }
}
customElements.define('tv-player', TvPlayer);
