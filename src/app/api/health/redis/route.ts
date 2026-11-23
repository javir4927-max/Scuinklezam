import { NextResponse } from "next/server";
import { redis } from "@/lib/roomStore";

export const dynamic = "force-dynamic";
export const revalidate = 0;

function escapeHtml(str: string): string {
  return str
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;");
}

function sanitizeError(msg?: string): string | undefined {
  if (!msg) return undefined;
  return msg
    .replace(/https?:\/\/[^\s"'`]+/gi, "[REDACTED_URL]")
    .replace(/bearer\s+[a-zA-Z0-9_\-\.]+/gi, "bearer [REDACTED_TOKEN]")
    .replace(/token[=:][^\s&"']+/gi, "token=[REDACTED]");
}

function renderHealthHtml(data: {
  configured: boolean;
  ok: boolean;
  latencyMs: number | null;
  error?: string;
  checkedAt: string;
}): string {
  const { configured, ok, latencyMs, error, checkedAt } = data;

  let statusColor = "#10B981";
  let statusBg = "rgba(16, 185, 129, 0.12)";
  let statusBorder = "rgba(16, 185, 129, 0.35)";
  let statusTitle = "Sistema Operativo";
  let statusDesc = "Upstash Redis conectado y respondiendo correctamente";
  let statusPill = "ONLINE";

  if (!configured) {
    statusColor = "#F59E0B";
    statusBg = "rgba(245, 158, 11, 0.12)";
    statusBorder = "rgba(245, 158, 11, 0.35)";
    statusTitle = "Modo Memoria Local";
    statusDesc = "Variables de Upstash no configuradas";
    statusPill = "LOCAL";
  } else if (!ok) {
    statusColor = "#F43F5E";
    statusBg = "rgba(244, 63, 94, 0.12)";
    statusBorder = "rgba(244, 63, 94, 0.35)";
    statusTitle = "Error de Conexión / Cuota";
    statusDesc = "Redis no pudo responder al ping";
    statusPill = "CAÍDO";
  }

  let latencyRating = "Sin datos";
  let latencyRatingColor = "rgba(255, 255, 255, 0.5)";
  if (latencyMs !== null) {
    if (latencyMs < 150) {
      latencyRating = "Excelente";
      latencyRatingColor = "#10B981";
    } else if (latencyMs < 400) {
      latencyRating = "Normal";
      latencyRatingColor = "#FACC15";
    } else {
      latencyRating = "Alta";
      latencyRatingColor = "#F43F5E";
    }
  }

  const engineName = configured ? "Upstash Redis" : "RAM Temporal";
  const engineDesc = configured ? "Base de datos cloud" : "Almacén en memoria";
  const isQuotaHint = Boolean(error && /limit|suspended|exceeded|quota/i.test(error));

  return `<!DOCTYPE html>
<html lang="es">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0, maximum-scale=1.0, user-scalable=no" />
  <title>Estado de Servidor · Scuinklezam</title>
  <link rel="preconnect" href="https://fonts.googleapis.com" />
  <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin />
  <link href="https://fonts.googleapis.com/css2?family=Outfit:wght@700;800;900&family=Plus+Jakarta+Sans:wght@400;500;600;700;800&family=JetBrains+Mono:wght@700&display=swap" rel="stylesheet" />
  <link rel="icon" href="data:image/svg+xml,<svg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 24 24' fill='%2310B981'><path d='M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm-1 14.5v-9l6 4.5-6 4.5z'/></svg>" />
  <style>
    * { box-sizing: border-box; margin: 0; padding: 0; }
    body {
      background-color: #060D09;
      background-image: radial-gradient(circle at 50% 0%, rgba(16, 185, 129, 0.22), transparent 60%);
      background-attachment: fixed;
      color: #FFFFFF;
      font-family: 'Plus Jakarta Sans', -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
      min-height: 100vh;
      display: flex;
      flex-direction: column;
      align-items: center;
      justify-content: center;
      padding: 24px 16px;
    }
    @keyframes pulse {
      0%, 100% { opacity: 1; transform: scale(1); }
      50% { opacity: 0.45; transform: scale(0.9); }
    }
    @keyframes ping {
      0% { transform: scale(0.95); opacity: 0.8; }
      70%, 100% { transform: scale(2.2); opacity: 0; }
    }
    .pulse-dot {
      position: relative;
      width: 12px;
      height: 12px;
      border-radius: 50%;
      flex-shrink: 0;
    }
    .pulse-dot::after {
      content: '';
      position: absolute;
      inset: -2px;
      border-radius: 50%;
      background: inherit;
      animation: ping 2s cubic-bezier(0, 0, 0.2, 1) infinite;
    }
    .card {
      width: 100%;
      max-width: 540px;
      border-radius: 24px;
      background: rgba(16, 34, 24, 0.85);
      backdrop-filter: blur(16px);
      -webkit-backdrop-filter: blur(16px);
      border: 1px solid rgba(74, 222, 128, 0.18);
      box-shadow: 0 25px 50px -12px rgba(0, 0, 0, 0.75), 0 0 35px rgba(16, 185, 129, 0.1);
      padding: 32px 28px;
    }
    .banner {
      border-radius: 18px;
      padding: 16px 20px;
      display: flex;
      align-items: center;
      gap: 14px;
      transition: all 0.25s ease;
      margin-top: 22px;
    }
    .metrics-grid {
      display: grid;
      grid-template-columns: repeat(3, 1fr);
      gap: 12px;
      margin-top: 18px;
    }
    @media (max-width: 480px) {
      .metrics-grid {
        grid-template-columns: 1fr;
      }
      .card {
        padding: 24px 20px;
      }
    }
    .metric-box {
      background: rgba(0, 0, 0, 0.45);
      border: 1px solid rgba(255, 255, 255, 0.07);
      border-radius: 14px;
      padding: 12px 14px;
      display: flex;
      flex-direction: column;
      gap: 4px;
      text-align: left;
    }
    .metric-label {
      font-size: 10px;
      font-weight: 800;
      letter-spacing: 0.08em;
      text-transform: uppercase;
      color: rgba(255, 255, 255, 0.45);
    }
    .metric-value {
      font-family: 'Outfit', sans-serif;
      font-size: 18px;
      font-weight: 800;
      color: #FFFFFF;
      letter-spacing: -0.02em;
    }
    .metric-sub {
      font-size: 11px;
      font-weight: 600;
    }
    .btn {
      display: inline-flex;
      align-items: center;
      justify-content: center;
      gap: 8px;
      font-size: 13px;
      font-weight: 700;
      border-radius: 12px;
      padding: 10px 18px;
      cursor: pointer;
      border: none;
      transition: all 0.2s ease;
      text-decoration: none;
      font-family: inherit;
    }
    .btn-primary {
      background: linear-gradient(135deg, #10B981, #059669);
      color: #060D09;
      box-shadow: 0 4px 14px rgba(16, 185, 129, 0.3);
    }
    .btn-primary:hover:not(:disabled) {
      filter: brightness(1.1);
      transform: translateY(-1px);
    }
    .btn-primary:disabled {
      opacity: 0.6;
      cursor: not-allowed;
    }
    .btn-secondary {
      background: rgba(255, 255, 255, 0.07);
      border: 1px solid rgba(255, 255, 255, 0.12);
      color: #E4E4E7;
    }
    .btn-secondary:hover {
      background: rgba(255, 255, 255, 0.12);
      color: #FFFFFF;
    }
    .error-box {
      margin-top: 18px;
      background: rgba(244, 63, 94, 0.08);
      border: 1px solid rgba(244, 63, 94, 0.25);
      border-radius: 14px;
      padding: 14px;
      text-align: left;
    }
    .error-text {
      font-family: 'JetBrains Mono', monospace;
      font-size: 11px;
      color: #FDA4AF;
      line-height: 1.5;
      word-break: break-all;
    }
    .quota-hint {
      margin-top: 8px;
      padding-top: 8px;
      border-top: 1px solid rgba(244, 63, 94, 0.2);
      font-size: 12px;
      color: #FCD34D;
      display: flex;
      align-items: center;
      gap: 6px;
    }
  </style>
</head>
<body>
  <div class="card">
    <!-- Brand Header -->
    <div style="text-align:center;">
      <div style="display:inline-flex;align-items:center;justify-content:center;gap:10px;margin-bottom:6px;">
        <div style="width:38px;height:38px;border-radius:11px;background:linear-gradient(135deg,#10B981,#84CC16);display:flex;align-items:center;justify-content:center;box-shadow:0 0 18px rgba(16,185,129,0.45);">
          <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="#060D09" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round">
            <path d="M9 18V5l12-2v13"></path>
            <circle cx="6" cy="18" r="3"></circle>
            <circle cx="18" cy="16" r="3"></circle>
          </svg>
        </div>
        <span style="font-family:'Outfit',sans-serif;font-weight:900;font-size:26px;letter-spacing:-0.5px;color:#FFFFFF;">
          Scuinkle<span style="background:linear-gradient(135deg,#10B981,#84CC16);-webkit-background-clip:text;-webkit-text-fill-color:transparent;">zam</span>
        </span>
      </div>
      <div style="color:rgba(255,255,255,0.55);font-size:13px;font-weight:500;">
        Estado del Servidor · Base de Datos
      </div>
    </div>

    <!-- Main Status Banner -->
    <div id="status-banner" class="banner" style="background:${statusBg};border:1px solid ${statusBorder};">
      <div id="status-dot" class="pulse-dot" style="background:${statusColor};"></div>
      <div style="flex:1;text-align:left;">
        <div id="status-title" style="font-family:'Outfit',sans-serif;font-size:16px;font-weight:800;color:${statusColor};letter-spacing:-0.01em;">
          ${statusTitle}
        </div>
        <div id="status-desc" style="font-size:12px;color:rgba(255,255,255,0.7);margin-top:2px;">
          ${statusDesc}
        </div>
      </div>
    </div>

    <!-- 3 Metrics Grid -->
    <div class="metrics-grid">
      <div class="metric-box">
        <span class="metric-label">ESTADO</span>
        <span id="metric-status" class="metric-value" style="color:${statusColor};">${statusPill}</span>
        <span id="metric-status-desc" class="metric-sub" style="color:rgba(255,255,255,0.5);">${ok ? "Ping exitoso" : configured ? "Fallo de ping" : "RAM Local"}</span>
      </div>
      <div class="metric-box">
        <span class="metric-label">LATENCIA</span>
        <span id="metric-latency" class="metric-value">${latencyMs !== null ? `${latencyMs} ms` : "—"}</span>
        <span id="metric-latency-desc" class="metric-sub" style="color:${latencyRatingColor};">${latencyRating}</span>
      </div>
      <div class="metric-box">
        <span class="metric-label">MOTOR</span>
        <span id="metric-engine" class="metric-value" style="font-size:16px;">${engineName}</span>
        <span id="metric-engine-desc" class="metric-sub" style="color:rgba(255,255,255,0.5);">${engineDesc}</span>
      </div>
    </div>

    <!-- Error Block (Conditional) -->
    <div id="error-container" style="display:${error ? "block" : "none"};">
      <div class="error-box">
        <div style="font-size:11px;font-weight:700;color:#FB7185;text-transform:uppercase;margin-bottom:6px;letter-spacing:0.05em;">
          Detalle del Error
        </div>
        <div id="error-message" class="error-text">${error ? escapeHtml(error) : ""}</div>
        <div id="quota-hint" class="quota-hint" style="display:${isQuotaHint ? "flex" : "none"};">
          <span>💡</span>
          <span>Pista: revisa el límite de cuota o ancho de banda en Upstash Console.</span>
        </div>
      </div>
    </div>

    <!-- Action Buttons -->
    <div style="display:flex;align-items:center;justify-content:center;gap:10px;margin-top:24px;flex-wrap:wrap;">
      <button id="btn-recheck" class="btn btn-primary" onclick="recheckHealth()">
        <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round">
          <polyline points="23 4 23 10 17 10"></polyline>
          <polyline points="1 20 1 14 7 14"></polyline>
          <path d="M3.51 9a9 9 0 0 1 14.85-3.36L23 10M1 14l4.64 4.36A9 9 0 0 0 20.49 15"></path>
        </svg>
        <span>Volver a comprobar</span>
      </button>
      <a id="btn-json" href="/api/health/redis?format=json" class="btn btn-secondary" target="_blank" rel="noopener noreferrer">
        <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
          <polyline points="16 18 22 12 16 6"></polyline>
          <polyline points="8 6 2 12 8 18"></polyline>
        </svg>
        <span>Ver JSON</span>
      </a>
    </div>

    <!-- Footer link & last check time -->
    <div style="margin-top:20px;text-align:center;">
      <a href="/" style="color:rgba(255,255,255,0.45);text-decoration:none;font-size:12px;font-weight:600;transition:color 0.2s;" onmouseover="this.style.color='#10B981'" onmouseout="this.style.color='rgba(255,255,255,0.45)'">
        ← Volver a Scuinklezam
      </a>
      <div id="last-check" style="color:rgba(255,255,255,0.3);font-size:11px;margin-top:10px;font-family:'JetBrains Mono',monospace;">
        Último chequeo: ${new Date(checkedAt).toLocaleTimeString()}
      </div>
    </div>
  </div>

  <script>
    function escapeHtmlClient(str) {
      if (!str) return '';
      return String(str)
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&#039;');
    }

    async function recheckHealth() {
      const btn = document.getElementById('btn-recheck');
      const originalText = btn.innerHTML;
      btn.disabled = true;
      btn.innerHTML = '<span style="display:inline-block;animation:pulse 1s infinite;">Comprobando...</span>';

      try {
        const res = await fetch('/api/health/redis?format=json&t=' + Date.now(), { cache: 'no-store' });
        const data = await res.json();

        const banner = document.getElementById('status-banner');
        const dot = document.getElementById('status-dot');
        const title = document.getElementById('status-title');
        const desc = document.getElementById('status-desc');
        const metricStatus = document.getElementById('metric-status');
        const metricStatusDesc = document.getElementById('metric-status-desc');
        const metricLatency = document.getElementById('metric-latency');
        const metricLatencyDesc = document.getElementById('metric-latency-desc');
        const metricEngine = document.getElementById('metric-engine');
        const metricEngineDesc = document.getElementById('metric-engine-desc');
        const errorContainer = document.getElementById('error-container');
        const errorMessage = document.getElementById('error-message');
        const quotaHint = document.getElementById('quota-hint');
        const lastCheck = document.getElementById('last-check');

        let statusColor = '#10B981';
        let statusBg = 'rgba(16, 185, 129, 0.12)';
        let statusBorder = 'rgba(16, 185, 129, 0.35)';
        let statusTitle = 'Sistema Operativo';
        let statusDesc = 'Upstash Redis conectado y respondiendo correctamente';
        let statusPill = 'ONLINE';
        let statusSub = 'Ping exitoso';

        if (!data.configured) {
          statusColor = '#F59E0B';
          statusBg = 'rgba(245, 158, 11, 0.12)';
          statusBorder = 'rgba(245, 158, 11, 0.35)';
          statusTitle = 'Modo Memoria Local';
          statusDesc = 'Variables de Upstash no configuradas';
          statusPill = 'LOCAL';
          statusSub = 'RAM Local';
        } else if (!data.ok) {
          statusColor = '#F43F5E';
          statusBg = 'rgba(244, 63, 94, 0.12)';
          statusBorder = 'rgba(244, 63, 94, 0.35)';
          statusTitle = 'Error de Conexión / Cuota';
          statusDesc = 'Redis no pudo responder al ping';
          statusPill = 'CAÍDO';
          statusSub = 'Fallo de ping';
        }

        banner.style.background = statusBg;
        banner.style.borderColor = statusBorder;
        dot.style.background = statusColor;
        title.style.color = statusColor;
        title.textContent = statusTitle;
        desc.textContent = statusDesc;

        metricStatus.textContent = statusPill;
        metricStatus.style.color = statusColor;
        metricStatusDesc.textContent = statusSub;

        let latencyRating = 'Sin datos';
        let latencyRatingColor = 'rgba(255, 255, 255, 0.5)';
        if (data.latencyMs !== null && data.latencyMs !== undefined) {
          metricLatency.textContent = data.latencyMs + ' ms';
          if (data.latencyMs < 150) {
            latencyRating = 'Excelente';
            latencyRatingColor = '#10B981';
          } else if (data.latencyMs < 400) {
            latencyRating = 'Normal';
            latencyRatingColor = '#FACC15';
          } else {
            latencyRating = 'Alta';
            latencyRatingColor = '#F43F5E';
          }
        } else {
          metricLatency.textContent = '—';
        }
        metricLatencyDesc.textContent = latencyRating;
        metricLatencyDesc.style.color = latencyRatingColor;

        metricEngine.textContent = data.configured ? 'Upstash Redis' : 'RAM Temporal';
        metricEngineDesc.textContent = data.configured ? 'Base de datos cloud' : 'Almacén en memoria';

        if (data.error) {
          errorContainer.style.display = 'block';
          errorMessage.innerHTML = escapeHtmlClient(data.error);
          const isQuota = /limit|suspended|exceeded|quota/i.test(data.error);
          quotaHint.style.display = isQuota ? 'flex' : 'none';
        } else {
          errorContainer.style.display = 'none';
          errorMessage.textContent = '';
          quotaHint.style.display = 'none';
        }

        const now = data.checkedAt ? new Date(data.checkedAt) : new Date();
        lastCheck.textContent = 'Último chequeo: ' + now.toLocaleTimeString();
      } catch (err) {
        console.error('Error rechecking health:', err);
      } finally {
        btn.disabled = false;
        btn.innerHTML = originalText;
      }
    }
  </script>
</body>
</html>`;
}

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const forceJson = searchParams.get("format") === "json";
  const wantsHtml = !forceJson && (request.headers.get("accept") || "").includes("text/html");

  const headers = {
    "Cache-Control": "no-store, no-cache, must-revalidate, max-age=0",
    Pragma: "no-cache",
  };

  const checkedAt = new Date().toISOString();

  if (!redis) {
    const error = "Redis client is not configured (UPSTASH_REDIS_REST_URL or KV_REST_API_URL missing)";
    if (!wantsHtml) {
      return NextResponse.json(
        {
          configured: false,
          ok: false,
          latencyMs: null,
          error,
          checkedAt,
        },
        { status: 503, headers }
      );
    }

    return new NextResponse(
      renderHealthHtml({
        configured: false,
        ok: false,
        latencyMs: null,
        error,
        checkedAt,
      }),
      {
        status: 200,
        headers: {
          ...headers,
          "Content-Type": "text/html; charset=utf-8",
        },
      }
    );
  }

  const start = performance.now();
  try {
    const pong = await redis.ping();
    const latencyMs = Math.round(performance.now() - start);
    const ok = pong === "PONG" || pong === "OK" || Boolean(pong);

    if (!wantsHtml) {
      return NextResponse.json(
        {
          configured: true,
          ok,
          latencyMs,
          response: pong,
          checkedAt,
        },
        { status: 200, headers }
      );
    }

    return new NextResponse(
      renderHealthHtml({
        configured: true,
        ok,
        latencyMs,
        checkedAt,
      }),
      {
        status: 200,
        headers: {
          ...headers,
          "Content-Type": "text/html; charset=utf-8",
        },
      }
    );
  } catch (rawError: any) {
    const latencyMs = Math.round(performance.now() - start);
    const sanitized = sanitizeError(rawError?.message || "Redis ping failed") || "Redis ping failed";

    if (!wantsHtml) {
      return NextResponse.json(
        {
          configured: true,
          ok: false,
          latencyMs,
          error: sanitized,
          checkedAt,
        },
        { status: 500, headers }
      );
    }

    return new NextResponse(
      renderHealthHtml({
        configured: true,
        ok: false,
        latencyMs,
        error: sanitized,
        checkedAt,
      }),
      {
        status: 200,
        headers: {
          ...headers,
          "Content-Type": "text/html; charset=utf-8",
        },
      }
    );
  }
}
