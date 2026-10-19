(function () {
  if (window.__cameraHistoryEmbed) return;
  window.__cameraHistoryEmbed = true;
  window.__cameraHistoryEmbedVersion = "20261019";

  var ORIGIN = "https://camera.sengycraft.cz";
  var RESIZE = "camera-history:resize";
  var HELLO = "camera-history:hello";
  var FONT = "camera-history:font";
  var SCRIPT_OK = "camera-history:script-ok";

  function widgetFrames() {
    return Array.prototype.slice.call(document.querySelectorAll("iframe")).filter(function (frame) {
      try {
        return new URL(frame.src, window.location.href).origin === ORIGIN;
      } catch {
        return false;
      }
    });
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

  function sendFont(source, frame) {
    if (!source || typeof source.postMessage !== "function") return;
    source.postMessage({ type: SCRIPT_OK }, "*");
    source.postMessage(
      {
        type: FONT,
        fontFamily: window.getComputedStyle(document.body).fontFamily,
        fontLinks: fontLinks(),
        backgroundColor: pageBackgroundColor(frame || frameFor(source)),
      },
      "*",
    );
  }

  function sameOriginMeasure(frame) {
    try {
      var doc = frame.contentDocument;
      if (doc && doc.body) {
        frame.style.height = Math.ceil(doc.body.getBoundingClientRect().height) + 2 + "px";
        sendFont(frame.contentWindow);
      }
    } catch {
      // Cross-origin frames report their height through postMessage.
    }
  }

  function wire(frame) {
    if (frame.__cameraHistoryWired) return;
    frame.__cameraHistoryWired = true;
    frame.addEventListener("load", function () {
      sameOriginMeasure(frame);
      sendFont(frame.contentWindow, frame);
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
      sendFont(event.source);
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
