import { CodeBlock } from "../CodeBlock";

export function ApiReferenceSection() {
  return (
    <section id="api-reference" className="scroll-mt-24 mb-16">
      <h2 className="text-3xl font-bold font-mono uppercase tracking-tight mb-6 text-primary">API Reference</h2>
      
      <div id="api-overview" className="scroll-mt-24 mb-10">
        <p className="text-muted-foreground mb-4">
          The public API provides system health, quote routing, and image storage services. No authentication keys are required. All responses use JSON unless otherwise specified.
        </p>
        <div className="bg-card border border-border/50 rounded-lg p-4 mb-8">
          <h4 className="font-bold text-foreground mb-2">Domains and Examples</h4>
          <p className="text-sm text-muted-foreground">
            The documentation snippets below use <code>app.example.com</code> or <code>api.example.com</code> as explicit domain placeholders to illustrate HTTP calls. In practice, you must query the exact host your frontend is running on. Upload requests enforce a strict Same-Origin Policy if the <code>Origin</code> header is present. Do not blindly copy-paste the example domains into your production code.
          </p>
        </div>
      </div>

      <div id="api-network" className="scroll-mt-24 mb-10">
        <h3 className="text-xl font-bold break-all mb-4">GET /network/solana?cluster=mainnet-beta</h3>
        <p className="text-sm text-muted-foreground mb-4">Read-only Solana/Raydium readiness check. The server calls only the configured Solana JSON-RPC methods needed to verify genesis and the pinned LaunchLab/CPMM program accounts; it is not a general RPC proxy. The endpoint accepts <code>devnet</code> or <code>mainnet-beta</code>. HTTP 200 means network and program verification passed; it does not authorize mainnet activation. HTTP 503 means that read verification failed. Responses use no-store and private RPC URLs and upstream details are never returned. Mainnet activation fails closed until <code>activationEligible</code> is true.</p>
        <CodeBlock language="javascript" code={`const response = await fetch('/network/solana?cluster=mainnet-beta');
const body = await response.json();
const readiness = body.readiness;
// readiness.connected: boolean
 // readiness.networkReady: boolean
 // readiness.activationEligible: boolean
// readiness.activation: "eligible" | "not-eligible"
// readiness.blockers: string[]
// readiness.quoteAsset: { native: "SOL", wrapped: "WSOL", ... }
 // HTTP success proves network reads only; activation requires the explicit gate
 if (!response.ok || !readiness.activationEligible) throw new Error(readiness.blockers[0]);`} />
      </div>
      <div id="api-health" className="scroll-mt-24 mb-10">
        <div className="flex items-center gap-3 mb-4">
          <span className="px-2 py-1 text-xs font-bold bg-blue-500/20 text-blue-400 rounded">GET</span>
          <h3 className="text-xl font-bold text-foreground m-0 break-all min-w-0">/api/healthz</h3>
        </div>
        <p className="text-muted-foreground mb-4 text-sm">
          Returns the current health status of the API server.
        </p>
        <CodeBlock 
          language="bash"
          code={`curl https://api.example.com/api/healthz`}
          className="mb-4"
        />
        <CodeBlock 
          language="json"
          code={`{\n  "status": "ok"\n}`}
        />
      </div>

      <div id="api-quotes" className="scroll-mt-24 mb-10">
        <div className="flex items-center gap-3 mb-4">
          <span className="px-2 py-1 text-xs font-bold bg-blue-500/20 text-blue-400 rounded">GET</span>
          <h3 className="text-xl font-bold text-foreground m-0 break-all min-w-0">/market-data/quotes</h3>
        </div>
        <p className="text-muted-foreground mb-4 text-sm">
           Fetches combined commodity reference quotes from external free-tier public providers. These feeds, including <code>priceUSD</code>, are informational references only and do not replace native SOL/WSOL as the launch quote asset or provide backing, collateral, or a price guarantee. Upstream providers are not guaranteed and some catalogue symbols may return an "unavailable" status. Results are cached in-process for 30 seconds (even failures are cached to prevent flooding). HTTP responses use Cache-Control: no-store. Provider failures are represented in a 200 response with an unavailable quote status. Use /market-data/quotes on this app’s origin, not /api/market-data/quotes; health and storage use the /api prefix.
        </p>
        
        <h4 className="font-bold text-foreground mt-6 mb-3 text-sm">Quote Field Reference (CommodityQuote)</h4>
        <div className="overflow-x-auto rounded-lg border border-border/50 mb-6">
          <table className="w-full text-sm text-left">
            <thead className="bg-muted/50 text-foreground font-mono">
              <tr>
                <th className="px-4 py-3 font-medium">Field</th>
                <th className="px-4 py-3 font-medium">Type</th>
                <th className="px-4 py-3 font-medium">Description</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border/50 text-muted-foreground">
              <tr><td className="px-4 py-3 text-foreground font-mono">symbol</td><td className="px-4 py-3">string</td><td className="px-4 py-3">The catalogue identifier (e.g. GLD, WTI)</td></tr>
              <tr><td className="px-4 py-3 text-foreground font-mono">priceUSD</td><td className="px-4 py-3">number | null</td><td className="px-4 py-3">Current unit price in USD, if available.</td></tr>
              <tr><td className="px-4 py-3 text-foreground font-mono">changePercent</td><td className="px-4 py-3">number | null</td><td className="px-4 py-3">Percentage change, if available.</td></tr>
              <tr><td className="px-4 py-3 text-foreground font-mono">changePeriod</td><td className="px-4 py-3">"previous business day" | null</td><td className="px-4 py-3">The timeline for the change percent.</td></tr>
              <tr><td className="px-4 py-3 text-foreground font-mono">status</td><td className="px-4 py-3">"current" | "daily" | "reference" | "unavailable"</td><td className="px-4 py-3">The freshness and availability state of the feed.</td></tr>
              <tr><td className="px-4 py-3 text-foreground font-mono">source</td><td className="px-4 py-3">string | null</td><td className="px-4 py-3">Human-readable provider name (e.g. Gold API).</td></tr>
              <tr><td className="px-4 py-3 text-foreground font-mono">sourceUrl</td><td className="px-4 py-3">string | null</td><td className="px-4 py-3">The URL to the data provider.</td></tr>
              <tr><td className="px-4 py-3 text-foreground font-mono">updatedAt</td><td className="px-4 py-3">string | null</td><td className="px-4 py-3">ISO-8601 or YYYY-MM-DD timestamp from the provider.</td></tr>
              <tr><td className="px-4 py-3 text-foreground font-mono">message</td><td className="px-4 py-3">string</td><td className="px-4 py-3">Contextual message or warning regarding the data.</td></tr>
            </tbody>
          </table>
        </div>

        <CodeBlock 
          language="bash"
          code={`curl https://app.example.com/market-data/quotes`}
          className="mb-4"
        />
        <CodeBlock 
          language="json"
          code={`{
  "quotes": {
    "GLD": {
      "symbol": "GLD",
      "priceUSD": 2345.60,
      "changePercent": null,
      "changePeriod": null,
      "status": "current",
      "source": "Gold API",
      "sourceUrl": "https://gold-api.com/",
      "updatedAt": "2024-05-20T12:00:00Z",
      "message": "Latest indicative provider quote. Precious metals: USD per troy oz..."
    },
    "EUR": {
      "symbol": "EUR",
      "priceUSD": 1.085,
      "changePercent": -0.12,
      "changePeriod": "previous business day",
      "status": "daily",
      "source": "Frankfurter / ECB",
      "sourceUrl": "https://frankfurter.dev/",
      "updatedAt": "2024-05-19",
      "message": "Daily reference rate dated 2024-05-19, not a real-time FX quote."
    },
    "CORN": {
      "symbol": "CORN",
      "priceUSD": null,
      "changePercent": null,
      "changePeriod": null,
      "status": "unavailable",
      "source": null,
      "sourceUrl": null,
      "updatedAt": null,
      "message": "Feed not connected"
    }
  },
  "fetchedAt": "2024-05-20T12:00:05.000Z",
  "refreshAfterMs": 30000
}`}
        />
      </div>

      <div id="api-upload" className="scroll-mt-24 mb-10">
        <div className="flex items-center gap-3 mb-4">
          <span className="px-2 py-1 text-xs font-bold bg-green-500/20 text-green-400 rounded">POST</span>
          <h3 className="text-xl font-bold text-foreground m-0 break-all min-w-0">/api/storage/token-images</h3>
        </div>
        <p className="text-muted-foreground mb-4 text-sm">
          Uploads a raw binary image for a token market. Required to be a direct file upload (no multipart wrapper).
          It employs a shared rate limit budget of <strong>60 uploads per 15 minutes</strong>, shared by all callers <strong>only per process</strong> (does not use IP headers). Maximum size is 4 MiB.
        </p>
        <CodeBlock 
          language="javascript"
          code={`// Example browser same-origin fetch
const fileInput = document.querySelector('input[type="file"]');
const file = fileInput.files[0];

const response = await fetch('/api/storage/token-images', {
  method: 'POST',
  headers: {
    'Content-Type': file.type // 'image/png', 'image/jpeg', or 'image/webp'
  },
  body: file // Raw bytes sent directly
});

const data = await response.json();
console.log(data.imageURL); // "/api/storage/token-images/<uuid>"`}
          className="mb-4"
        />
        
        <div className="space-y-4 mt-6">
          <h4 className="font-bold text-foreground text-sm">Success Response (200 OK)</h4>
          <CodeBlock language="json" code={`{\n  "imageURL": "/api/storage/token-images/123e4567-e89b-12d3-a456-426614174000"\n}`} />
          
          <h4 className="font-bold text-foreground text-sm">Error Responses</h4>
          <ul className="list-disc list-inside text-muted-foreground text-sm space-y-2">
            <li><strong>400 Bad Request:</strong> <code>&#123; "error": "Token image upload is empty." &#125;</code> or invalid magic bytes mismatch.</li>
            <li><strong>403 Forbidden:</strong> <code>&#123; "error": "Token image uploads require the same origin." &#125;</code></li>
            <li><strong>413 Payload Too Large:</strong> <code>&#123; "error": "Token image must be 4 MB or smaller." &#125;</code></li>
            <li><strong>415 Unsupported Media Type:</strong> <code>&#123; "error": "Token image must be PNG, JPEG, or WebP." &#125;</code></li>
            <li><strong>429 Too Many Requests:</strong> <code>&#123; "error": "The shared token image upload budget is exhausted. Please try again later." &#125;</code> (Includes a <code>Retry-After</code> header in seconds).</li>
            <li><strong>500 Internal Server Error:</strong> <code>&#123; "error": "Failed to save token image." &#125;</code></li>
          </ul>
        </div>
      </div>

      <div id="api-serve" className="scroll-mt-24 mb-10">
        <div className="flex items-center gap-3 mb-4">
          <span className="px-2 py-1 text-xs font-bold bg-blue-500/20 text-blue-400 rounded">GET</span>
          <h3 className="text-xl font-bold text-foreground m-0 break-all min-w-0">/api/storage/token-images/&#123;imageId&#125;</h3>
        </div>
        <p className="text-muted-foreground mb-4 text-sm">
          Retrieves previously uploaded raw image bytes by their UUID. 
          The server streams the image directly, applies the correct Content-Type (PNG/JPEG/WebP) based on object metadata, and attaches a rigid <code>X-Content-Type-Options: nosniff</code> security header.
        </p>
        <p className="text-muted-foreground mb-4 text-sm">
          <strong>Caching:</strong> Image responses use <code>public, max-age=31536000</code> (1 year). No authentication is required to view images.
        </p>
        <CodeBlock 
          language="bash"
          code={`curl -O -J https://api.example.com/api/storage/token-images/123e4567-e89b-12d3-a456-426614174000`}
        />
        <div className="mt-4">
          <ul className="list-disc list-inside text-muted-foreground text-sm space-y-2">
            <li><strong>404 Not Found:</strong> <code>&#123; "error": "Token image not found." &#125;</code> — returned for invalid UUID strings or missing objects.</li>
            <li><strong>500 Internal Server Error:</strong> <code>&#123; "error": "Failed to serve token image." &#125;</code></li>
          </ul>
        </div>
      </div>
    </section>
  );
}