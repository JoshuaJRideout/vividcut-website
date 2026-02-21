/**
 * VividCut Suggestion Worker
 *
 * Receives anonymous suggestions from the iOS app and forwards them
 * to your email via Cloudflare Email Routing.
 */

import { EmailMessage } from "cloudflare:email";

const MAX_TEXT_LENGTH = 1111;

function buildRawEmail(from, to, subject, body) {
    const msgId = `<${crypto.randomUUID()}@vividcut.app>`;
    const lines = [
        `From: VividCut App <${from}>`,
        `To: <${to}>`,
        `Subject: ${subject}`,
        `Message-ID: ${msgId}`,
        `MIME-Version: 1.0`,
        `Content-Type: text/plain; charset=utf-8`,
        `Date: ${new Date().toUTCString()}`,
        ``,
        body,
    ];
    return lines.join("\r\n");
}

export default {
    async fetch(request, env) {
        if (request.method === "OPTIONS") {
            return new Response(null, { status: 204, headers: corsHeaders() });
        }

        if (request.method !== "POST") {
            return jsonResponse({ error: "Method not allowed" }, 405);
        }

        try {
            const body = await request.json();
            const text = (body.text || "").trim();

            if (!text) {
                return jsonResponse({ error: "Suggestion text is required" }, 400);
            }
            if (text.length > MAX_TEXT_LENGTH) {
                return jsonResponse(
                    { error: `Suggestion must be ${MAX_TEXT_LENGTH} characters or less` },
                    400
                );
            }

            const destination = env.DESTINATION_EMAIL;
            if (!destination) {
                console.error("DESTINATION_EMAIL secret is not set");
                return jsonResponse({ error: "Server misconfigured" }, 500);
            }

            console.log("Sending to destination:", destination);

            const rawEmail = buildRawEmail(
                "noreply@vividcut.app",
                destination,
                "New App Suggestion",
                `New anonymous suggestion from VividCut:\n\n${text}\n\n---\nSent at: ${new Date().toISOString()}`
            );

            const email = new EmailMessage("noreply@vividcut.app", destination, rawEmail);
            await env.EMAIL.send(email);

            return jsonResponse({ success: true });
        } catch (err) {
            console.error("Worker error:", err.message, err.stack);
            return jsonResponse({ error: "Failed to send suggestion: " + err.message }, 500);
        }
    },
};

function jsonResponse(data, status = 200) {
    return new Response(JSON.stringify(data), {
        status,
        headers: { "Content-Type": "application/json", ...corsHeaders() },
    });
}

function corsHeaders() {
    return {
        "Access-Control-Allow-Origin": "*",
        "Access-Control-Allow-Methods": "POST, OPTIONS",
        "Access-Control-Allow-Headers": "Content-Type",
    };
}
