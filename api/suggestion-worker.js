/**
 * VividCut Suggestion Worker
 * 
 * Receives anonymous suggestions from the iOS app and forwards them
 * to suggestions@vividcut.app via the MailChannels API.
 * 
 * DEPLOYMENT:
 * 1. Install Wrangler: npm install -g wrangler
 * 2. Authenticate: wrangler login
 * 3. Create worker: wrangler init suggestion-worker
 * 4. Copy this code into src/index.js
 * 5. Deploy: wrangler deploy
 * 
 * DNS SETUP (required for MailChannels):
 * Add a TXT record to your domain:
 *   Name: _mailchannels
 *   Content: v=mc1 cfid=YOUR_WORKER_SUBDOMAIN.workers.dev
 * 
 * Also add an SPF record if not already present:
 *   Name: @
 *   Content: v=spf1 include:relay.mailchannels.net -all
 * 
 * CUSTOM DOMAIN (optional):
 * Route this worker to api.vividcut.app/suggest via Cloudflare dashboard
 * Workers > Routes > Add Route: api.vividcut.app/suggest*
 */

const MAX_TEXT_LENGTH = 500;

export default {
    async fetch(request, env) {
        // Handle CORS preflight
        if (request.method === "OPTIONS") {
            return new Response(null, {
                status: 204,
                headers: corsHeaders(),
            });
        }

        // Only accept POST
        if (request.method !== "POST") {
            return jsonResponse({ error: "Method not allowed" }, 405);
        }

        try {
            const body = await request.json();
            const text = (body.text || "").trim();

            // Validate
            if (!text) {
                return jsonResponse({ error: "Suggestion text is required" }, 400);
            }
            if (text.length > MAX_TEXT_LENGTH) {
                return jsonResponse(
                    { error: `Suggestion must be ${MAX_TEXT_LENGTH} characters or less` },
                    400
                );
            }

            // Send email via MailChannels
            const emailRequest = new Request("https://api.mailchannels.net/tx/v1/send", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({
                    personalizations: [
                        {
                            to: [{ email: "suggestions@vividcut.app", name: "VividCut Suggestions" }],
                        },
                    ],
                    from: {
                        email: "noreply@vividcut.app",
                        name: "VividCut App",
                    },
                    subject: "New App Suggestion",
                    content: [
                        {
                            type: "text/plain",
                            value: `New anonymous suggestion from VividCut:\n\n${text}\n\n---\nSent at: ${new Date().toISOString()}`,
                        },
                    ],
                }),
            });

            const emailResponse = await fetch(emailRequest);

            if (!emailResponse.ok) {
                const errText = await emailResponse.text();
                console.error("MailChannels error:", errText);
                return jsonResponse({ error: "Failed to send suggestion" }, 502);
            }

            return jsonResponse({ success: true });
        } catch (err) {
            console.error("Worker error:", err);
            return jsonResponse({ error: "Invalid request" }, 400);
        }
    },
};

function jsonResponse(data, status = 200) {
    return new Response(JSON.stringify(data), {
        status,
        headers: {
            "Content-Type": "application/json",
            ...corsHeaders(),
        },
    });
}

function corsHeaders() {
    return {
        "Access-Control-Allow-Origin": "*",
        "Access-Control-Allow-Methods": "POST, OPTIONS",
        "Access-Control-Allow-Headers": "Content-Type",
    };
}
