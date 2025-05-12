const g = () => "xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx".replace(/[xy]/g, (e) => {
  const o = Math.random() * 16 | 0;
  return (e === "x" ? o : o & 3 | 8).toString(16);
}), h = typeof window < "u", E = () => {
  if (!h) return {};
  const e = {};
  if (navigator) {
    e.userAgent = navigator.userAgent, e.language = navigator.language, e.platform = navigator.platform, e.doNotTrack = navigator.doNotTrack;
    const o = navigator.userAgentData;
    o && (e.browser = o.brands.map((n) => `${n.brand} ${n.version}`).join(", "), e.mobile = o.mobile);
  }
  window && window.screen && (e.screenWidth = window.screen.width, e.screenHeight = window.screen.height, e.screenColorDepth = window.screen.colorDepth, e.viewportWidth = window.innerWidth, e.viewportHeight = window.innerHeight, e.devicePixelRatio = window.devicePixelRatio), window && window.location && (e.url = window.location.href, e.path = window.location.pathname, e.hostname = window.location.hostname, e.protocol = window.location.protocol, e.referrer = document.referrer, e.pageTitle = document.title), e.touchscreen = "ontouchstart" in window;
  try {
    e.darkMode = window.matchMedia("(prefers-color-scheme: dark)").matches;
  } catch {
  }
  if (e.online = navigator.onLine, navigator && "connection" in navigator) {
    const o = navigator.connection;
    o && (e.connectionType = o.effectiveType, e.downlink = o.downlink, e.rtt = o.rtt, e.saveData = o.saveData);
  }
  try {
    e.timezone = Intl.DateTimeFormat().resolvedOptions().timeZone;
  } catch {
  }
  return e.sessionStart = Date.now(), e;
}, w = (e) => {
  const o = {};
  for (const n in e) {
    const t = e[n];
    typeof t != "function" && typeof t != "object" && (o[n] = t);
  }
  return o;
}, L = (e) => {
  if (!(!window.performance || !window.performance.getEntriesByType)) {
    if (document.readyState === "complete" ? _(e) : window.addEventListener("load", () => _(e)), PerformanceObserver)
      try {
        new PerformanceObserver((n) => {
          const t = n.getEntries();
          for (const r of t)
            r.entryType === "navigation" && e.log("page_performance", {
              type: "navigation",
              data: w(r)
            });
        }).observe({ entryTypes: ["navigation"] });
      } catch {
      }
    if (PerformanceObserver)
      try {
        new PerformanceObserver((n) => {
          const t = n.getEntries(), r = [];
          for (const c of t)
            c.entryType === "resource" && r.length < 10 && r.push(w(c));
          r.length > 0 && e.log("resource_performance", {
            type: "resources",
            count: r.length,
            data: r
          });
        }).observe({ entryTypes: ["resource"] });
      } catch {
      }
  }
}, _ = (e) => {
  const o = window.performance.getEntriesByType && window.performance.getEntriesByType("navigation")[0];
  if (o)
    e.log("page_performance", {
      type: "page_load",
      data: w(o)
    });
  else {
    const t = window.performance.timing;
    if (t) {
      const r = {
        loadTime: t.loadEventEnd - t.navigationStart,
        domReadyTime: t.domComplete - t.domLoading,
        ttfb: t.responseStart - t.requestStart,
        domContentLoaded: t.domContentLoadedEventEnd - t.navigationStart,
        domInteractive: t.domInteractive - t.navigationStart
      };
      e.log("page_performance", {
        type: "page_load",
        data: r
      });
    }
  }
  const n = window.performance.getEntriesByType && window.performance.getEntriesByType("paint");
  if (n && n.length) {
    const t = {};
    for (const r of n)
      r.name === "first-paint" ? t.firstPaint = r.startTime : r.name === "first-contentful-paint" && (t.firstContentfulPaint = r.startTime);
    e.log("paint_performance", {
      type: "paint_metrics",
      data: t
    });
  }
}, O = (e) => {
  window.addEventListener("error", (o) => {
    var n, t;
    e.log("js_error", {
      message: o.message,
      filename: o.filename,
      lineno: o.lineno,
      colno: o.colno,
      stack: ((t = (n = o.error) == null ? void 0 : n.stack) == null ? void 0 : t.substring(0, 2e3)) || "Not available"
    });
  }), window.addEventListener("unhandledrejection", (o) => {
    var t;
    const n = o.reason;
    e.log("promise_error", {
      message: (n == null ? void 0 : n.message) || String(n),
      stack: ((t = n == null ? void 0 : n.stack) == null ? void 0 : t.substring(0, 2e3)) || "Not available"
    });
  });
}, I = (e) => {
  const o = {
    error: console.error,
    warn: console.warn
  };
  console.error = function(...n) {
    e.log("console_error", {
      message: n.map((t) => String(t)).join(" "),
      timestamp: Date.now()
    }), o.error.apply(console, n);
  }, console.warn = function(...n) {
    e.log("console_warn", {
      message: n.map((t) => String(t)).join(" "),
      timestamp: Date.now()
    }), o.warn.apply(console, n);
  };
}, D = (e) => {
  if (!window.XMLHttpRequest) return;
  const o = XMLHttpRequest.prototype.open, n = XMLHttpRequest.prototype.send;
  if (XMLHttpRequest.prototype.open = function(t, r, c, s, l) {
    return this._orwelMethod = t, this._orwelUrl = r, this._orwelStartTime = Date.now(), o.apply(this, arguments);
  }, XMLHttpRequest.prototype.send = function(...t) {
    return this.addEventListener("load", function() {
      const r = Date.now() - (this._orwelStartTime || 0);
      e.log("network_request", {
        url: String(this._orwelUrl || ""),
        method: this._orwelMethod || "unknown",
        status: this.status,
        duration: r,
        success: this.status >= 200 && this.status < 300
      });
    }), this.addEventListener("error", function() {
      const r = Date.now() - (this._orwelStartTime || 0);
      e.log("network_error", {
        url: String(this._orwelUrl || ""),
        method: this._orwelMethod || "unknown",
        duration: r
      });
    }), n.apply(this, t);
  }, window.fetch) {
    const t = window.fetch;
    window.fetch = function(r, c) {
      const s = Date.now(), l = (c == null ? void 0 : c.method) || "GET", f = typeof r == "string" ? r : r instanceof URL ? r.toString() : "url" in r ? String(r.url) : "";
      return t.apply(window, [r, c]).then((d) => {
        const u = Date.now() - s;
        return e.log("network_request", {
          url: f,
          method: l,
          status: d.status,
          duration: u,
          success: d.ok
        }), d;
      }).catch((d) => {
        const u = Date.now() - s;
        throw e.log("network_error", {
          url: f,
          method: l,
          duration: u,
          message: d.message
        }), d;
      });
    };
  }
}, M = (e) => {
  if (performance && performance.memory) {
    const o = () => {
      const n = performance.memory;
      e.log("memory_usage", {
        totalJSHeapSize: n.totalJSHeapSize,
        usedJSHeapSize: n.usedJSHeapSize,
        jsHeapSizeLimit: n.jsHeapSizeLimit
      });
    };
    setInterval(o, 3e4), o();
  }
}, P = (e, o = {}) => {
  const t = { ...{
    performance: !0,
    errors: !0,
    console: !0,
    network: !0,
    memory: !0
  }, ...o };
  t.performance && L(e), t.errors && O(e), t.console && I(e), t.network && D(e), t.memory && M(e);
};
function x() {
  const e = "__orwel_queue__", o = "__orwel_log__", n = "__orwel_visitor__";
  let t = {}, r = {}, c = !1;
  const s = [], l = [], f = () => {
    try {
      const i = localStorage.getItem(e);
      i && s.push(...JSON.parse(i));
    } catch {
    }
  }, d = () => {
    try {
      localStorage.setItem(e, JSON.stringify(s));
    } catch {
    }
  }, u = () => {
    try {
      const i = localStorage.getItem(n);
      i && (r = JSON.parse(i)), r.id || (r.id = g(), y());
    } catch {
    }
  }, y = () => {
    try {
      localStorage.setItem(n, JSON.stringify(r));
    } catch {
    }
  }, T = () => {
    try {
      const i = localStorage.getItem(o);
      i && l.push(...JSON.parse(i));
    } catch {
    }
  }, v = () => {
    try {
      localStorage.setItem(o, JSON.stringify(l));
    } catch {
    }
  }, m = async () => {
    for (; s.length > 0; ) {
      const i = s.shift();
      i && await k(i);
    }
    return d(), await b(), Promise.resolve();
  }, k = async (i) => {
    try {
      const p = {
        ...i,
        visitor: r,
        timestamp: Date.now()
      };
      await fetch("https://api.orwel.io/ingest", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "X-Orwel-Key": t.apiKey
        },
        body: JSON.stringify(p),
        keepalive: !0
      });
    } catch {
      s.push(i), d();
    }
  }, b = async () => {
    if (l.length === 0) return;
    const i = {
      type: "log_batch",
      logs: [...l]
    };
    try {
      const p = {
        ...i,
        visitor: r,
        timestamp: Date.now()
      };
      await fetch("https://api.orwel.io/ingest", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "X-Orwel-Key": t.apiKey
        },
        body: JSON.stringify(p),
        keepalive: !0
      }), l.length = 0, v();
    } catch {
      console.warn("[Orwel SDK] Failed to flush logs");
    }
  };
  return {
    init: (i) => {
      t = i, f(), T(), u(), window.addEventListener("beforeunload", m), window.addEventListener("visibilitychange", () => {
        document.visibilityState === "hidden" && m();
      }), i.autoMonitor && S.monitor();
    },
    identify: (i = {}) => {
      const a = { ...E(), ...i };
      return !r.id && !a.id ? a.id = g() : r.id && !a.id && (a.id = r.id), r = { ...r, ...a }, y(), s.push({ type: "identify", traits: a }), d(), { success: !0, visitorId: r.id || "" };
    },
    track: (i, p = {}) => {
      const a = g();
      return s.push({ type: "track", code: i, properties: p, eventId: a }), d(), { success: !0, eventId: a };
    },
    log: (i, p = {}) => {
      const a = g();
      return l.push({
        type: i,
        data: p,
        timestamp: Date.now(),
        logId: a
      }), v(), { success: !0, logId: a };
    },
    monitor: (i = {}) => {
      c || (P(S, i), c = !0);
    },
    flush: async () => {
      const i = s.length + l.length;
      return await m(), { success: !0, count: i };
    }
  };
}
const S = x();
function H() {
  return {
    init: () => {
    },
    identify: () => ({ success: !0, visitorId: "" }),
    track: () => ({ success: !0, eventId: "" }),
    log: () => ({ success: !0, logId: "" }),
    monitor: () => {
    },
    flush: () => Promise.resolve({ success: !0, count: 0 })
  };
}
const N = h ? x() : H();
h && (window.orwel = N);
export {
  N as orwel
};
