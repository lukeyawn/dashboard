#!/usr/bin/env node
// The dashboard's MCP server for Claude Desktop and Claude Code (DESIGN §5).
// Runs over stdio on the laptop and talks to the dashboard's API:
//   DASHBOARD_URL=https://dashboard.<tailnet>.ts.net DASHBOARD_TOKEN=<API_TOKEN> node mcp/index.js
// See mcp/README.md for adding it to Claude.
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { createClient } from './client.js';
import { registerTools } from './tools.js';

const { DASHBOARD_URL, DASHBOARD_TOKEN } = process.env;
if (!DASHBOARD_URL || !DASHBOARD_TOKEN) {
    // stdout belongs to the MCP protocol, so messages go to stderr
    console.error('Set DASHBOARD_URL and DASHBOARD_TOKEN. See mcp/README.md.');
    process.exit(1);
}

const server = new McpServer({ name: 'dashboard', version: '1.0.0' });
registerTools(server, createClient({ baseUrl: DASHBOARD_URL, token: DASHBOARD_TOKEN }));
await server.connect(new StdioServerTransport());
