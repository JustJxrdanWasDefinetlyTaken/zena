const config = {
	"max-vms": "10", // set this to the amount of vms your api key says its allowed to create. changing this to be higher than your api key will not work
	"start_url": "chrome://newtab", // url to open when the vm starts

	"timeout": {
		"main": 900, // time until the vm is terminated in seconds
		"afk": 120, // if the user is afk for this time, the vm will be terminated
		"offline": 5, // if the vm is offline for this time, the vm will be terminated
		"warning": 60 // show a warning when this much time is left
	},

	"dark": true, // dark mode

	"tagbase": "zena-vm", // base tag for the vm (a timestamp will also be added). this will be used to identify the vm
	"mobile": true, // mobile support

	"search_engine": "google", // search engine to use. allowed values: duckduckgo, google, startpage, ecosia, brave

	"quality": "smooth", // quality of the vm. allowed values: smooth, blocky or sharp. smooth is recommended as sharp uses triple the bandwidth
};

const HYPERBEAM_API_BASE = "https://engine.hyperbeam.com/v0";
const MAX_ACTIVE_VMS = parseInt(config['max-vms'] || "10", 10);

const log = {
	info: console.log,
	warn: console.warn,
	error: console.error,
	success: console.log
};

function requireApiKey(env) {
	if (!env.HB_API_KEY || env.HB_API_KEY === "NULL-KEY") { // DO NOT SET THIS LINE TO YOUR KEY!!! use enviroment variables please i beg
		log.error("API Key Checker: HB_API_KEY is not configured.");
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

		const apiKeyErrorResponse = requireApiKey(env);
		if (apiKeyErrorResponse) {
			return new Response(apiKeyErrorResponse.body, { status: apiKeyErrorResponse.status, headers: { ...corsHeaders, ...apiKeyErrorResponse.headers } });
		}

		const HB_API_KEY = env.HB_API_KEY;
		const url = new URL(request.url);

		if (request.method === "GET" && url.pathname === "/start-vm") {
			try {
				log.info("Checking active Hyperbeam VMs...");
				const listResponse = await fetch(`${HYPERBEAM_API_BASE}/vm`, {
					headers: { Authorization: `Bearer ${HB_API_KEY}` },
				});

				if (!listResponse.ok) {
					const errorData = await listResponse.json().catch(() => ({ message: "Failed to parse error from Hyperbeam" }));
					log.error(`Hyperbeam API error (list VMs): ${listResponse.status}`, errorData);
					return new Response(JSON.stringify({
						error: "HyperbeamAPIError",
						message: "Failed to list VMs from Hyperbeam.",
						details: errorData
					}), { status: listResponse.status, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
				}
				const activeVMs = await listResponse.json();
				log.info(`Found ${activeVMs.length} active Hyperbeam VM(s).`);

				if (activeVMs.length >= MAX_ACTIVE_VMS) {
					log.warn(`Hyperbeam VM limit reached (${MAX_ACTIVE_VMS}). Denying request.`);
					return new Response(JSON.stringify({
						error: "TooManyVMs",
						message: "Too many VMs are active right now. Check back later.",
					}), { status: 503, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
				}

				log.info("Limit not reached. Attempting to create a new Hyperbeam VM...");
				const tag = url.searchParams.get("tag") || `${config.tagbase || 'zena-vm'}-${Date.now()}`;

				const vmConfig = {
					start_url: config.start_url || "https://www.google.com",
					timeout: {
						absolute: config.timeout?.main || 900,
						inactive: config.timeout?.afk || 120,
						offline: config.timeout?.offline || 5,
						warning: config.timeout?.warning || 60
					},
					webgl: true, // why not
					dark: typeof config.dark === 'boolean' ? config.dark : true,
					tag: tag,
					touch_gestures: {
						swipe: typeof config.mobile === 'boolean' ? config.mobile : true,
						pinch: typeof config.mobile === 'boolean' ? config.mobile : true,
					},
					search_engine: config.search_engine || "google",
					quality: {
						mode: config.quality || "smooth",
					},
					/* extension: {
						field: "https://above.gay/zena-ext.zip" // zena's official utility extension
					} */
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
					const errorData = await createResponse.json().catch(() => ({ message: "Failed to parse error from Hyperbeam" }));
					log.error(`Hyperbeam API error (create VM): ${createResponse.status}`, errorData);
					return new Response(JSON.stringify({
						error: "HyperbeamAPIError",
						message: "Failed to create VM with Hyperbeam.",
						details: errorData
					}), { status: createResponse.status, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
				}

				const newComputerInstance = await createResponse.json();
				log.success(`New Hyperbeam VM created successfully: ${newComputerInstance.session_id} (Tag: ${tag})`);
				return new Response(JSON.stringify(newComputerInstance), {
					headers: { ...corsHeaders, 'Content-Type': 'application/json' },
				});
			} catch (error) {
				log.error("Error in /start-vm handler:", error.message, error.stack);
				return new Response(JSON.stringify({
					error: "InternalServerError",
					message: "An unexpected error occurred.",
					details: error.message,
				}), { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
			}
		} else if (request.method === "DELETE" && url.pathname.startsWith("/kill-vm/")) {
			const parts = url.pathname.split('/');
			const sessionId = parts[parts.length - 1];

			if (!sessionId || sessionId.trim() === "") {
				log.warn("/kill-vm: sessionId parameter is missing or empty.");
				return new Response(JSON.stringify({
					error: "BadRequest",
					message: "A valid Session ID is required in the path.",
				}), { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
			}
			try {
				const deleteUrl = `${HYPERBEAM_API_BASE}/vm/${sessionId}`;
				log.info(`Attempting to terminate Hyperbeam VM with ID: ${sessionId} at ${deleteUrl}`);

				const deleteResponse = await fetch(deleteUrl, {
					method: 'DELETE',
					headers: { Authorization: `Bearer ${HB_API_KEY}` },
				});

				if (deleteResponse.status === 204 || deleteResponse.status === 200) {
					log.success(`Hyperbeam VM ${sessionId} terminated successfully via API.`);
					return new Response(JSON.stringify({
						message: `Virtual machine ${sessionId} exited successfully.`,
					}), { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
				} else if (deleteResponse.status === 404) {
					const errorData = await deleteResponse.json().catch(() => ({ message: "VM not found" }));
					log.warn(`Hyperbeam VM ${sessionId} not found (404).`, errorData);
					return new Response(JSON.stringify({
						error: "VMNotFound",
						message: `Virtual machine ${sessionId} not found.`,
						details: errorData
					}), { status: 404, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
				} else {
					const errorData = await deleteResponse.json().catch(() => ({ message: "Failed to parse error from Hyperbeam" }));
					log.error(`Hyperbeam API error (delete VM): ${deleteResponse.status}`, errorData);
					return new Response(JSON.stringify({
						error: "HyperbeamAPIError",
						message: `Failed to terminate VM ${sessionId} via Hyperbeam.`,
						details: errorData
					}), { status: deleteResponse.status, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
				}
			} catch (error) {
				log.error(`Error terminating Hyperbeam VM ${sessionId}:`, error.message, error.stack);
				return new Response(JSON.stringify({
					error: "InternalServerError",
					message: "An unexpected error occurred while processing the terminate VM request.",
					details: error.message,
				}), { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
			}
		}

		return new Response("Not Found", { status: 404, headers: corsHeaders });
	},
};
