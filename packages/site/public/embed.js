(function () {
  if (window.__cameraHistoryEmbed) return;
  window.__cameraHistoryEmbed = true;
  window.__cameraHistoryEmbedVersion = "20261019b";

  var script = document.currentScript;
  var ORIGIN = "https://camera.sengycraft.cz";
  try {
    if (script && script.src) ORIGIN = new URL(script.src).origin;
  } catch {
    // Keep the production origin when the script URL cannot be parsed.
  }

  var RESIZE = "camera-history:resize";
  var HELLO = "camera-history:hello";
  var FONT = "camera-history:font";
  var SCRIPT_OK = "camera-history:script-ok";
  var CONTEXT = "camera-history:context";
  var REQUEST_CONTEXT = "camera-history:request-context";

  function widgetFrames() {
    return Array.prototype.slice.call(document.querySelectorAll("iframe")).filter(function (frame) {
      try {
        return new URL(frame.src, window.location.href).origin === ORIGIN;
      } catch {
        return false;
      }
    });
  }

  function isPreview(frame) {
    return frame.getAttribute("data-camera-history-preview") === "1";
  }

  function safeSegment(value) {
    return String(value || "").replace(/[^A-Za-z0-9_-]/g, "-");
  }

  function derivedId(frame) {
    try {
      var url = new URL(frame.src, window.location.href);
      var parts = url.pathname.split("/").filter(Boolean).map(safeSegment);
      if (parts[0] === "widget" && parts.length >= 3) {
        return "camera-history-widget-" + parts[1] + "-" + parts[2];
      }
      if (parts[0] === "group" && parts.length >= 3) {
        return "camera-history-group-" + parts[1] + "-" + parts[2];
      }
    } catch {
      // Fall back to a generic id below.
    }
    return "camera-history-embed";
  }

  function ensureFrameId(frame) {
    if (frame.id) return frame.id;
    var base = derivedId(frame);
    var id = base;
    var suffix = 2;
    while (document.getElementById(id) && document.getElementById(id) !== frame) {
      id = base + "-" + suffix;
      suffix += 1;
    }
    frame.id = id;
    return id;
  }

  function parentUrl() {
    return window.location.origin + window.location.pathname + window.location.search;
  }

  function sharedState() {
    var params = new URLSearchParams(window.location.search);
    var date = params.get("ch_date");
    var hour = params.get("ch_hour");
    var camera = params.get("ch_camera");
    var target = params.get("ch_target");
    if (!/^\d{4}-\d{2}-\d{2}$/.test(date || "")) date = null;
    if (!/^\d{1,2}$/.test(hour || "") || Number(hour) < 0 || Number(hour) > 23) hour = null;
    if (!date && hour === null && !camera) return null;
    return { target: target || null, date: date, hour: hour, camera: camera || null };
  }

  function hashTarget() {
    try {
      return decodeURIComponent(window.location.hash.slice(1));
    } catch {
      return window.location.hash.slice(1);
    }
  }

  function applySharedState(frame) {
    var state = sharedState();
    if (!state) return;
    var id = ensureFrameId(frame);
    var hash = hashTarget();
    if (state.target ? state.target !== id : hash !== id) return;
    if (frame.__cameraHistoryStateApplied) return;
    frame.__cameraHistoryStateApplied = true;
    try {
      var url = new URL(frame.src, window.location.href);
      if (state.date) url.searchParams.set("date", state.date);
      if (state.hour !== null) url.searchParams.set("hour", state.hour);
      if (state.camera) url.searchParams.set("camera", state.camera);
      if (url.toString() !== frame.src) frame.src = url.toString();
    } catch {
      // Leave the frame source untouched when it cannot be parsed.
    }
  }

  function scrollToFrame(frame) {
    if (hashTarget() !== frame.id) return;
    try {
      frame.scrollIntoView({ block: "start", behavior: "auto" });
    } catch {
      frame.scrollIntoView();
    }
  }

  function fontLinks() {
    return Array.prototype.slice
      .call(document.querySelectorAll('link[rel="stylesheet"]'))
      .map(function (link) {
        return link.href;
      })
      .filter(function (href) {
        return /fonts\.googleapis\.com|fonts\.google\.com/.test(href);
      });
  }

  function isOpaque(color) {
    return Boolean(color) && color !== "rgba(0, 0, 0, 0)" && color !== "transparent";
  }

  function pageBackgroundColor(frame) {
    var el = frame ? frame.parentElement : null;
    while (el) {
      var background = window.getComputedStyle(el).backgroundColor;
      if (isOpaque(background)) return background;
      el = el.parentElement;
    }
    var body = window.getComputedStyle(document.body).backgroundColor;
    if (isOpaque(body)) return body;
    var html = window.getComputedStyle(document.documentElement).backgroundColor;
    if (isOpaque(html)) return html;
    return "";
  }

  function frameFor(source) {
    var frames = widgetFrames();
    for (var i = 0; i < frames.length; i += 1) {
      if (frames[i].contentWindow === source) return frames[i];
    }
    return null;
  }

  function frameOrigin(frame) {
    try {
      return new URL(frame.src, window.location.href).origin;
    } catch {
      return "*";
    }
  }

  function sendContext(source, frame) {
    if (!source || !frame || isPreview(frame)) return;
    var targetOrigin =
      source === frame.contentWindow ? frameOrigin(frame) : window.location.origin;
    source.postMessage(
      {
        type: CONTEXT,
        parentUrl: parentUrl(),
        iframeId: ensureFrameId(frame),
      },
      targetOrigin,
    );
  }

  function sendFont(source, frame) {
    if (!source || typeof source.postMessage !== "function") return;
    var target = frame || frameFor(source);
    source.postMessage({ type: SCRIPT_OK }, "*");
    source.postMessage(
      {
        type: FONT,
        fontFamily: window.getComputedStyle(document.body).fontFamily,
        fontLinks: fontLinks(),
        backgroundColor: pageBackgroundColor(target),
      },
      "*",
    );
    sendContext(source, target);
  }

  function sameOriginMeasure(frame) {
    try {
      var doc = frame.contentDocument;
      if (doc && doc.body) {
        frame.style.height = Math.ceil(doc.body.getBoundingClientRect().height) + 2 + "px";
        sendFont(frame.contentWindow, frame);
      }
    } catch {
      // Cross-origin frames report their height through postMessage.
    }
  }

  function wire(frame) {
    if (frame.__cameraHistoryWired) return;
    frame.__cameraHistoryWired = true;
    if (!isPreview(frame)) {
      ensureFrameId(frame);
      applySharedState(frame);
      scrollToFrame(frame);
    }
    frame.addEventListener("load", function () {
      sameOriginMeasure(frame);
      sendFont(frame.contentWindow, frame);
      if (!isPreview(frame)) scrollToFrame(frame);
    });
    sameOriginMeasure(frame);
    // The frame may have loaded before this script was injected, or the widget
    // may still be booting; keep offering the font/measurement for a while.
    [0, 500, 1500, 3000].forEach(function (delay) {
      window.setTimeout(function () {
        sendFont(frame.contentWindow, frame);
      }, delay);
    });
  }

  window.addEventListener("message", function (event) {
    if (event.origin !== ORIGIN) return;
    var data = event.data || {};

    if (data.type === HELLO) {
      sendFont(event.source, frameFor(event.source));
      return;
    }

    if (data.type === REQUEST_CONTEXT) {
      sendContext(event.source, frameFor(event.source));
      return;
    }

    if (data.type !== RESIZE || typeof data.height !== "number") return;
    var height = Math.max(240, Math.round(data.height));
    widgetFrames().forEach(function (frame) {
      if (frame.contentWindow === event.source) {
        frame.style.height = height + "px";
      }
    });
  });

  window.addEventListener("hashchange", function () {
    widgetFrames().forEach(function (frame) {
      if (!isPreview(frame)) scrollToFrame(frame);
    });
  });

  function scan() {
    widgetFrames().forEach(wire);
  }

  scan();
  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", scan);
  }
  window.addEventListener("load", scan);

  if (typeof MutationObserver !== "undefined") {
    new MutationObserver(scan).observe(document.documentElement, {
      childList: true,
      subtree: true,
    });
  }
})();
