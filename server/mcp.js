// The claude.ai connector's MCP endpoint (docs/CONNECTOR.md §3): Streamable
// HTTP in stateless mode, with JSON responses. Each request gets a fresh MCP
// server whose tools are the stdio server's own (mcp/tools.js), minus
// delete_item, calling the private API over loopback with the caller's own
// access token. So the API's allow-list decides what Claude can do, in one
// place, exactly as it does for every other client.
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { StreamableHTTPServerTransport } from '@modelcontextprotocol/sdk/server/streamableHttp.js';
import { createClient } from '../mcp/client.js';
import { INSTRUCTIONS, registerTools } from '../mcp/tools.js';

// apiUrl: () => the private listener's address, e.g. http://127.0.0.1:3000
export function createMcpHandler({ apiUrl, now = () => new Date() }) {
    // connector: whose token this is; the agent's tools arrive with
    // suggestions (phase 8, PR 3), so until then it has none
    return async function handleMcp(req, res, connector = 'chat') {
        const server = new McpServer({ name: 'dashboard', version: '1.0.0' }, { instructions: INSTRUCTIONS });
        const call = createClient({
            baseUrl: apiUrl(),
            token: req.accessToken,
            unreachable: "The dashboard's server isn't answering itself, so try again in a minute.",
        });
        if (connector === 'chat') registerTools(server, call, now, { omit: ['delete_item'] });
        const transport = new StreamableHTTPServerTransport({ sessionIdGenerator: undefined, enableJsonResponse: true });
        res.on('close', () => {
            transport.close();
            server.close();
        });
        await server.connect(transport);
        await transport.handleRequest(req, res, req.body);
    };
}
