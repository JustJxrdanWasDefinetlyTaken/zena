const config = {
	"max-vms": "10",
	"start_url": "https://jmw-v7.pages.dev/vm-homepage.html",
	"timeout": {
		"absolute": 900,
		"inactive": 120,
		"offline": 5,
		"warning": 60
	},
	"tagbase": "zena-vm"
};

const HYPERBEAM_API_BASE = "https://engine.hyperbeam.com/v0";
const MAX_ACTIVE_VMS = parseInt(config['max-vms'], 10);

function requireApiKey(env) {
	if (!env.HB_API_KEY || env.HB_API_KEY === "NULL-KEY") {
		return new Response(JSON.stringify({
			error: "ConfigurationError",
			message: "Missing Hyperbeam API key."
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

		if (request.method === "OPTIONS")
			return new Response(null, { status: 204, headers: corsHeaders });

		const apiKeyError = requireApiKey(env);
		if (apiKeyError)
			return apiKeyError;

		const HB_API_KEY = env.HB_API_KEY;
		const url = new URL(request.url);

		if (request.method === "GET" && url.pathname === "/start-vm") {
			try {
				const listResponse = await fetch(`${HYPERBEAM_API_BASE}/vm`, {
					headers: { Authorization: `Bearer ${HB_API_KEY}` }
				});
				const activeVMs = await listResponse.json();
				if (activeVMs.length >= MAX_ACTIVE_VMS) {
					return new Response(JSON.stringify({
						error: "TooManyVMs",
						message: "Too many VMs are active."
					}), { status: 503, headers: corsHeaders });
				}

				const tag = `${config.tagbase}-${Date.now()}`;
				const createResponse = await fetch(`${HYPERBEAM_API_BASE}/vm`, {
					method: 'POST',
					headers: {
						Authorization: `Bearer ${HB_API_KEY}`,
						'Content-Type': 'application/json'
					},
					body: JSON.stringify({
						start_url: config.start_url,
						tag,
						timeout: config.timeout
					})
				});

				const newVM = await createResponse.json();
				if (!createResponse.ok) {
					return new Response(JSON.stringify({
						error: "HyperbeamAPIError",
						message: "Failed to create VM.",
						details: newVM
					}), { status: createResponse.status, headers: corsHeaders });
				}

				return new Response(JSON.stringify(newVM), {
					headers: { ...corsHeaders, 'Content-Type': 'application/json' }
				});
			} catch (err) {
				return new Response(JSON.stringify({
					error: "InternalError",
					message: err.message
				}), { status: 500, headers: corsHeaders });
			}
		}

		if (request.method === "DELETE" && url.pathname.startsWith("/kill-vm/")) {
			const id = url.pathname.split("/").pop();
			if (!id) {
				return new Response(JSON.stringify({
					error: "BadRequest",
					message: "Missing Session ID."
				}), { status: 400, headers: corsHeaders });
			}

			const res = await fetch(`${HYPERBEAM_API_BASE}/vm/${id}`, {
				method: "DELETE",
				headers: { Authorization: `Bearer ${HB_API_KEY}` }
			});
			return new Response(JSON.stringify({ message: "VM killed." }), {
				status: 200,
				headers: corsHeaders
			});
		}

		return new Response("Not Found", { status: 404, headers: corsHeaders });
	}
};
