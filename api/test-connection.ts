import { handleTestConnection } from "./_lib/handlers";
import { wrap } from "./_lib/vercel";

export default wrap((body) => handleTestConnection(body, { timeoutMs: Number(process.env.PROVIDER_TIMEOUT_MS) || 25000 }));
