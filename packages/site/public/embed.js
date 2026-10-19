(function () {
  if (window.__cameraHistoryEmbed) return;
  window.__cameraHistoryEmbed = true;

  var ORIGIN = "https://camera.sengycraft.cz";
  var RESIZE = "camera-history:resize";
  var HELLO = "camera-history:hello";
  var FONT = "camera-history:font";

  function widgetFrames() {
    return Array.prototype.slice.call(document.querySelectorAll("iframe")).filter(function (frame) {
      try {
        return new URL(frame.src, window.location.href).origin === ORIGIN;
      } catch (error) {
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

  function sendFont(source) {
    if (!source || typeof source.postMessage !== "function") return;
    source.postMessage(
      {
        type: FONT,
        fontFamily: window.getComputedStyle(document.body).fontFamily,
        fontLinks: fontLinks(),
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
    } catch (error) {
      // Cross-origin frames report their height through postMessage.
    }
  }

  function wire(frame) {
    if (frame.__cameraHistoryWired) return;
    frame.__cameraHistoryWired = true;
    frame.addEventListener("load", function () {
      sameOriginMeasure(frame);
      sendFont(frame.contentWindow);
    });
    sameOriginMeasure(frame);
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
