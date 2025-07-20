const config = {
	"max-vms": "10",
	"start_url": "https://jmw-v7.pages.dev/vm-homepage.html",
	"timeout": {
		"main": 900,
		"afk": 120,
		"offline": 5,
		"warning": 60
	},
	"dark": true,
	"tagbase": "zena-vm",
	"mobile": true,
	"search_engine": "google",
	"quality": "smooth"
};

const HYPERBEAM_API_BASE = "https://engine.hyperbeam.com/v0";
const MAX_ACTIVE_VMS = parseInt(config['max-vms'] || "10", 10);

function requireApiKey(env) {
	if (!env.HB_API_KEY || env.HB_API_KEY === "NULL-KEY") {
		return new Response(JSON.stringify({
			error: "ConfigurationError",
			message: "Hyperbeam API key is not configured on the server.",
		}), { status: 500, headers: { 'Content-Type': 'application/json' } });
	}
	return null;
}

export default {
	async fetch(request, env, ctx) {
		const corsHeaders = {
			"Access-Control-Allow-Origin": "*",
			"Access-Control-Allow-Methods": "GET, POST, DELETE, OPTIONS",
			"Access-Control-Allow-Headers": "Content-Type, Authorization"
		};

		if (request.method === "OPTIONS") {
			return new Response(null, { status: 204, headers: corsHeaders });
		}

		const apiKeyError = requireApiKey(env);
		if (apiKeyError) {
			return new Response(apiKeyError.body, { status: apiKeyError.status, headers: { ...corsHeaders, ...apiKeyError.headers } });
		}

		const HB_API_KEY = env.HB_API_KEY;
		const url = new URL(request.url);

		if (request.method === "GET" && url.pathname === "/start-vm") {
			try {
				const listResponse = await fetch(`${HYPERBEAM_API_BASE}/vm`, {
					headers: { Authorization: `Bearer ${HB_API_KEY}` },
				});
				if (!listResponse.ok) {
					const errorData = await listResponse.json().catch(() => ({}));
					return new Response(JSON.stringify({
						error: "HyperbeamAPIError",
						message: "Failed to list VMs from Hyperbeam.",
						details: errorData
					}), { status: listResponse.status, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
				}
				const activeVMs = await listResponse.json();
				if (activeVMs.length >= MAX_ACTIVE_VMS) {
					return new Response(JSON.stringify({
						error: "TooManyVMs",
						message: "Too many VMs are active right now. Check back later.",
					}), { status: 503, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
				}

				const tag = url.searchParams.get("tag") || `${config.tagbase}-${Date.now()}`;
				const vmConfig = {
					start_url: config.start_url,
					timeout: {
						absolute: config.timeout.main,
						inactive: config.timeout.afk,
						offline: config.timeout.offline,
						warning: config.timeout.warning
					},
					webgl: true,
					dark: config.dark,
					tag,
					touch_gestures: {
						swipe: config.mobile,
						pinch: config.mobile
					},
					search_engine: config.search_engine,
					quality: {
						mode: config.quality
					}
				};

				const createResponse = await fetch(`${HYPERBEAM_API_BASE}/vm`, {
					method: 'POST',
					headers: {
						Authorization: `Bearer ${HB_API_KEY}`,
						'Content-Type': 'application/json',
					},
					body: JSON.stringify(vmConfig),
				});

				if (!createResponse.ok) {
					const errorData = await createResponse.json().catch(() => ({}));
					return new Response(JSON.stringify({
						error: "HyperbeamAPIError",
						message: "Failed to create VM with Hyperbeam.",
						details: errorData
					}), { status: createResponse.status, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
				}

				const newVM = await createResponse.json();
				return new Response(JSON.stringify(newVM), {
					headers: { ...corsHeaders, 'Content-Type': 'application/json' },
				});
			} catch (error) {
				return new Response(JSON.stringify({
					error: "InternalServerError",
					message: "An unexpected error occurred.",
					details: error.message,
				}), { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
			}
		}

		if (request.method === "DELETE" && url.pathname.startsWith("/kill-vm/")) {
			const sessionId = url.pathname.split("/").pop();
			if (!sessionId) {
				return new Response(JSON.stringify({
					error: "BadRequest",
					message: "A valid Session ID is required in the path.",
				}), { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
			}
			try {
				const deleteResponse = await fetch(`${HYPERBEAM_API_BASE}/vm/${sessionId}`, {
					method: 'DELETE',
					headers: { Authorization: `Bearer ${HB_API_KEY}` },
				});
				if (deleteResponse.status === 204 || deleteResponse.status === 200) {
					return new Response(JSON.stringify({
						message: `Virtual machine ${sessionId} exited successfully.`,
					}), { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
				} else {
					const errorData = await deleteResponse.json().catch(() => ({}));
					return new Response(JSON.stringify({
						error: "HyperbeamAPIError",
						message: `Failed to terminate VM ${sessionId} via Hyperbeam.`,
						details: errorData
					}), { status: deleteResponse.status, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
				}
			} catch (error) {
				return new Response(JSON.stringify({
					error: "InternalServerError",
					message: "An unexpected error occurred.",
					details: error.message,
				}), { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
			}
		}

		return new Response("Not Found", { status: 404, headers: corsHeaders });
	}
};
