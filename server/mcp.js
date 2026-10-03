// The claude.ai connector's MCP endpoint (docs/CONNECTOR.md §3): Streamable
// HTTP in stateless mode, with JSON responses. Each request gets a fresh MCP
// server whose tools are the stdio server's own (mcp/tools.js), minus
// delete_item, calling the private API over loopback with the caller's own
// access token. So the API's allow-list decides what Claude can do, in one
// place, exactly as it does for every other client. The agent's connector
// also goes without settings and night mode (docs/AGENT.md §2), which its
// allow-list refuses anyway.
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { StreamableHTTPServerTransport } from '@modelcontextprotocol/sdk/server/streamableHttp.js';
import { createClient } from '../mcp/client.js';
import { INSTRUCTIONS, registerTools } from '../mcp/tools.js';

export const OMITTED = {
    chat: ['delete_item'],
    agent: ['delete_item', 'update_settings', 'start_night', 'cancel_night'],
};

// apiUrl: () => the private listener's address, e.g. http://127.0.0.1:3000
export function createMcpHandler({ apiUrl, now = () => new Date() }) {
    // connector: whose token this is, which decides the tools
    return async function handleMcp(req, res, connector = 'chat') {
        const server = new McpServer({ name: 'dashboard', version: '1.0.0' }, { instructions: INSTRUCTIONS });
        const call = createClient({
            baseUrl: apiUrl(),
            token: req.accessToken,
            unreachable: "The dashboard's server isn't answering itself, so try again in a minute.",
        });
        registerTools(server, call, now, { omit: OMITTED[connector] });
        const transport = new StreamableHTTPServerTransport({ sessionIdGenerator: undefined, enableJsonResponse: true });
        res.on('close', () => {
            transport.close();
            server.close();
        });
        await server.connect(transport);
        await transport.handleRequest(req, res, req.body);
    };
}
