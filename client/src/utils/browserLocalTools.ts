import { AgentCapabilities, Constants, dataService, Tools } from 'librechat-data-provider';
import type { TMessage, TSubmission, ToolCallResponse, ToolId } from 'librechat-data-provider';
import type { BrowserLocalChatMessage, Gemma4Mobile } from './browserLocalGemma';

type BrowserLocalToolCall = {
  tool: string;
  args: Record<string, unknown>;
};

type BrowserLocalToolResult = {
  tool: string;
  args: Record<string, unknown>;
  result: unknown;
  attachments?: unknown[];
  error?: string;
};

type BrowserLocalToolLifecycle = {
  tool: string;
  args: Record<string, unknown>;
};

type BrowserLocalToolLifecycleEnd = BrowserLocalToolLifecycle & {
  result: BrowserLocalToolResult;
  toolCallId?: string;
};

type BrowserLocalSkillContext = {
  text: string;
  allowedTools: Set<string>;
};

type MCPToolInfo = {
  name: string;
  pluginKey: string;
  description: string;
};

const maxPlannedToolCalls = 3;

function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}

function stringifyToolValue(value: unknown): string {
  if (typeof value === 'string') {
    return value;
  }

  try {
    return JSON.stringify(value, null, 2);
  } catch {
    return String(value);
  }
}

function getSourceSnippet(item: Record<string, unknown>): string {
  if (typeof item.snippet === 'string') {
    return item.snippet;
  }
  if (typeof item.content === 'string') {
    return item.content;
  }
  if (typeof item.text === 'string') {
    return item.text;
  }
  return '';
}

function formatSourceList(value: unknown): string | null {
  if (!isRecord(value)) {
    return null;
  }

  const lines: string[] = [];
  for (const key of ['organic', 'topStories', 'sources']) {
    const items = value[key];
    if (!Array.isArray(items)) {
      continue;
    }
    for (const item of items) {
      if (!isRecord(item)) {
        continue;
      }
      const title = typeof item.title === 'string' ? item.title : item.source;
      const link = typeof item.link === 'string' ? item.link : item.url;
      const snippet = getSourceSnippet(item);
      const highlights = Array.isArray(item.highlights)
        ? item.highlights.filter((entry): entry is string => typeof entry === 'string')
        : [];
      lines.push(
        [
          title ? `Title: ${title}` : null,
          link ? `URL: ${link}` : null,
          snippet ? `Snippet: ${snippet}` : null,
          highlights.length ? `Highlights: ${highlights.join(' ')}` : null,
        ]
          .filter(Boolean)
          .join('\n'),
      );
    }
  }

  return lines.length > 0 ? lines.join('\n\n') : null;
}

function formatToolAttachments(attachments: unknown[] | undefined): string {
  if (!attachments || attachments.length === 0) {
    return '';
  }

  const formatted = attachments.map((attachment) => {
    if (!isRecord(attachment)) {
      return stringifyToolValue(attachment);
    }
    if (attachment[Tools.web_search]) {
      return `Web search sources and scraped highlights:\n${
        formatSourceList(attachment[Tools.web_search]) ??
        stringifyToolValue(attachment[Tools.web_search])
      }`;
    }
    if (attachment[Tools.file_search]) {
      return `File search sources:\n${
        formatSourceList(attachment[Tools.file_search]) ??
        stringifyToolValue(attachment[Tools.file_search])
      }`;
    }
    return stringifyToolValue(attachment);
  });

  return `\nAttachments:\n${formatted.join('\n\n')}`;
}

function getToolAttachmentError(tool: string, attachments: unknown[] | undefined): string | null {
  for (const attachment of attachments ?? []) {
    if (!isRecord(attachment)) {
      continue;
    }
    const value = attachment[tool];
    if (isRecord(value) && typeof value.error === 'string' && value.error.length > 0) {
      return value.error;
    }
  }
  return null;
}

function extractJsonObject(text: string): Record<string, unknown> | null {
  const fenced = /```(?:json)?\s*([\s\S]*?)```/i.exec(text);
  const source = fenced?.[1] ?? text;
  const start = source.indexOf('{');
  const end = source.lastIndexOf('}');
  if (start < 0 || end <= start) {
    return null;
  }

  try {
    const parsed = JSON.parse(source.slice(start, end + 1));
    return isRecord(parsed) ? parsed : null;
  } catch {
    return null;
  }
}

function parsePlannedToolCalls(text: string, allowedTools: Set<string>): BrowserLocalToolCall[] {
  const parsed = extractJsonObject(text);
  const calls = Array.isArray(parsed?.calls) ? parsed.calls : [];

  return calls
    .filter(isRecord)
    .map((call) => ({
      tool: typeof call.tool === 'string' ? call.tool : '',
      args: isRecord(call.args) ? call.args : {},
    }))
    .filter((call) => allowedTools.has(call.tool))
    .slice(0, maxPlannedToolCalls);
}

function getUserQuery(submission: TSubmission): string {
  return submission.userMessage.text || submission.conversation?.title || '';
}

function getManualSkillNames(submission: TSubmission): string[] {
  return [
    ...new Set([
      ...(submission.manualSkills ?? []),
      ...(submission.userMessage.manualSkills ?? []),
    ]),
  ];
}

function getFileIds(messages: TMessage[], userMessage: TMessage): string[] {
  const ids = new Set<string>();
  for (const message of [...messages, userMessage]) {
    for (const file of message.files ?? []) {
      if (typeof file.file_id === 'string' && file.file_id.length > 0) {
        ids.add(file.file_id);
      }
    }
  }
  return [...ids];
}

function isEnabled(value: unknown): boolean {
  return value === true || (typeof value === 'string' && value.length > 0);
}

function isResolvedSkill<T>(skill: T | null): skill is T {
  return skill != null;
}

function formatSkillInstruction({
  name,
  description,
  body,
}: {
  name: string;
  description: string;
  body: string;
}): string {
  return `Skill: ${name}
Description: ${description}
Instructions:
${body}`;
}

async function resolveSkillByName(name: string) {
  const response = await dataService.listSkills({ search: name, limit: 20 });
  const summary = response.skills.find(
    (skill) => skill.name === name || skill.displayTitle === name,
  );
  if (!summary) {
    return null;
  }
  return dataService.getSkill(summary._id);
}

async function resolveBrowserLocalSkillContext(
  submission: TSubmission,
): Promise<BrowserLocalSkillContext | null> {
  const manualSkillNames = getManualSkillNames(submission);
  const skillsEnabled = isEnabled(submission.ephemeralAgent?.[AgentCapabilities.skills]);
  if (!skillsEnabled && manualSkillNames.length === 0) {
    return null;
  }

  try {
    const manualSkills = (await Promise.all(manualSkillNames.map(resolveSkillByName))).filter(
      isResolvedSkill,
    );
    const alwaysApplyResponse = skillsEnabled
      ? await dataService.listSkills({ limit: 50 })
      : { skills: [] };
    const manualIds = new Set(manualSkills.map((skill) => skill._id));
    const alwaysApplySummaries = alwaysApplyResponse.skills.filter(
      (skill) => skill.alwaysApply === true && !manualIds.has(skill._id),
    );
    const alwaysApplySkills = await Promise.all(
      alwaysApplySummaries.map((skill) => dataService.getSkill(skill._id)),
    );
    const skills = [...manualSkills, ...alwaysApplySkills];
    if (skills.length === 0) {
      return null;
    }

    const allowedTools = new Set<string>();
    const instructions = skills.map((skill) => {
      for (const tool of skill.allowedTools ?? []) {
        allowedTools.add(tool);
      }
      return formatSkillInstruction(skill);
    });

    return {
      allowedTools,
      text: `Use these LibreChat skill instructions for this turn.\n\n${instructions.join('\n\n---\n\n')}`,
    };
  } catch {
    return null;
  }
}

async function callBrowserLocalTool({
  tool,
  args,
  messageId,
  conversationId,
}: {
  tool: string;
  args: Record<string, unknown>;
  messageId: string;
  conversationId: string;
}): Promise<BrowserLocalToolResult> {
  try {
    const toolArgs = { ...args };
    if (tool === Tools.execute_code && typeof toolArgs.lang === 'string') {
      if (toolArgs.lang === 'python') {
        toolArgs.lang = 'py';
      } else if (toolArgs.lang === 'javascript') {
        toolArgs.lang = 'js';
      } else if (toolArgs.lang === 'typescript') {
        toolArgs.lang = 'ts';
      }
    }
    const response = (await dataService.callTool({
      toolId: tool as ToolId,
      toolParams: {
        ...toolArgs,
        browserLocal: true,
        messageId,
        conversationId,
      } as Record<string, unknown> & {
        messageId: string;
        conversationId: string;
      },
    })) as ToolCallResponse;
    const attachmentError = getToolAttachmentError(tool, response.attachments);

    return {
      tool,
      args: toolArgs,
      result: response.result,
      attachments: response.attachments,
      error: attachmentError ?? undefined,
    };
  } catch (error) {
    return {
      tool,
      args,
      result: null,
      error: error instanceof Error ? error.message : String(error),
    };
  }
}

async function getAvailableMCPTools(serverNames: string[] = []): Promise<MCPToolInfo[]> {
  if (serverNames.length === 0) {
    return [];
  }

  try {
    const response = await dataService.getMCPTools();
    const selected = new Set(serverNames);
    return Object.entries(response.servers ?? {})
      .filter(([serverName]) => selected.has(serverName))
      .flatMap(([, server]) => server.tools ?? [])
      .map((tool) => ({
        name: tool.name,
        pluginKey: tool.pluginKey,
        description: tool.description,
      }));
  } catch {
    return [];
  }
}

function getSkillMCPTools(allowedTools: Set<string>): MCPToolInfo[] {
  return [...allowedTools]
    .filter((tool) => tool.includes(Constants.mcp_delimiter))
    .map((tool) => {
      const [, name = tool] = tool.split(Constants.mcp_delimiter);
      return {
        name,
        pluginKey: tool,
        description: `MCP tool ${tool}`,
      };
    });
}

function mergeMCPTools(tools: MCPToolInfo[]): MCPToolInfo[] {
  const seen = new Set<string>();
  const result: MCPToolInfo[] = [];
  for (const tool of tools) {
    if (seen.has(tool.pluginKey)) {
      continue;
    }
    seen.add(tool.pluginKey);
    result.push(tool);
  }
  return result;
}

function buildPlanningPrompt({
  userQuery,
  mcpTools,
  executeCode,
}: {
  userQuery: string;
  mcpTools: MCPToolInfo[];
  executeCode: boolean;
}): BrowserLocalChatMessage {
  const tools: string[] = [];
  if (executeCode) {
    tools.push(
      `- ${Tools.execute_code}: run code in a sandbox. Args: {"lang":"py|js|ts|bash|...","code":"complete code"}`,
    );
  }
  for (const tool of mcpTools.slice(0, 20)) {
    tools.push(`- ${tool.pluginKey}: ${tool.description || tool.name}`);
  }

  return {
    role: 'user',
    content: `Tool planning instructions for the browser-local model:
You are deciding whether to call tools before answering.
Return only valid JSON in this exact shape:
{"calls":[{"tool":"tool_name","args":{}}]}

Use at most ${maxPlannedToolCalls} calls. If no tool is needed, return {"calls":[]}.

Available tools:
${tools.join('\n')}

User request:
${userQuery}`,
  };
}

async function planToolCalls({
  model,
  signal,
  messages,
  executeCode,
  mcpTools,
  userQuery,
}: {
  model: Gemma4Mobile;
  signal: AbortSignal;
  messages: BrowserLocalChatMessage[];
  executeCode: boolean;
  mcpTools: MCPToolInfo[];
  userQuery: string;
}): Promise<BrowserLocalToolCall[]> {
  if (!executeCode && mcpTools.length === 0) {
    return [];
  }

  const planningPrompt = buildPlanningPrompt({ userQuery, mcpTools, executeCode });
  const allowedTools = new Set([
    ...(executeCode ? [Tools.execute_code] : []),
    ...mcpTools.map((tool) => tool.pluginKey),
  ]);
  const text = await model.complete([...messages, planningPrompt], {
    maxNewTokens: 700,
    signal,
  });
  model.reset();
  return parsePlannedToolCalls(text, allowedTools);
}

export function formatBrowserLocalToolResults(results: BrowserLocalToolResult[]): string {
  if (results.length === 0) {
    return '';
  }

  return results
    .map((result, index) => {
      const status = result.error ? `ERROR: ${result.error}` : stringifyToolValue(result.result);
      const attachments = result.error ? '' : formatToolAttachments(result.attachments);
      return `Tool result ${index + 1}: ${result.tool}\nArgs: ${stringifyToolValue(
        result.args,
      )}\nOutput:\n${status}${attachments}`;
    })
    .join('\n\n---\n\n');
}

export async function runBrowserLocalTools({
  model,
  signal,
  messages,
  submission,
  responseId,
  conversationId,
  onStatus,
  onToolStart,
  onToolEnd,
}: {
  model: Gemma4Mobile;
  signal: AbortSignal;
  messages: BrowserLocalChatMessage[];
  submission: TSubmission;
  responseId: string;
  conversationId: string;
  onStatus: (status: string) => void;
  onToolStart?: (tool: BrowserLocalToolLifecycle) => string | undefined;
  onToolEnd?: (tool: BrowserLocalToolLifecycleEnd) => void;
}): Promise<BrowserLocalToolResult[]> {
  const agent = submission.ephemeralAgent;
  const userQuery = getUserQuery(submission);
  const results: BrowserLocalToolResult[] = [];
  const fileIds = getFileIds(submission.messages, submission.userMessage);
  const skillContext = await resolveBrowserLocalSkillContext(submission);
  if (skillContext) {
    results.push({
      tool: AgentCapabilities.skills,
      args: {},
      result: skillContext.text,
    });
  }
  const skillAllowedTools = skillContext?.allowedTools ?? new Set<string>();

  if (
    (agent?.[Tools.web_search] === true || skillAllowedTools.has(Tools.web_search)) &&
    userQuery
  ) {
    const args = { query: userQuery };
    const toolCallId = onToolStart?.({ tool: Tools.web_search, args });
    if (!toolCallId) {
      onStatus('Searching the web...');
    }
    const result = await callBrowserLocalTool({
      tool: Tools.web_search,
      args,
      messageId: responseId,
      conversationId,
    });
    onToolEnd?.({ tool: Tools.web_search, args, result, toolCallId });
    results.push(result);
  }

  if (
    (agent?.[Tools.file_search] === true || skillAllowedTools.has(Tools.file_search)) &&
    userQuery
  ) {
    const args = { query: userQuery, files: fileIds };
    const toolCallId = onToolStart?.({ tool: Tools.file_search, args });
    if (!toolCallId) {
      onStatus('Searching attached files...');
    }
    const result = await callBrowserLocalTool({
      tool: Tools.file_search,
      args,
      messageId: responseId,
      conversationId,
    });
    onToolEnd?.({ tool: Tools.file_search, args, result, toolCallId });
    results.push(result);
  }

  const mcpServerNames = Array.isArray(agent?.mcp) ? agent.mcp : [];
  const mcpTools = mergeMCPTools([
    ...(await getAvailableMCPTools(mcpServerNames)),
    ...getSkillMCPTools(skillAllowedTools),
  ]);
  const plannedCalls = await planToolCalls({
    model,
    signal,
    messages,
    userQuery,
    mcpTools,
    executeCode: agent?.[Tools.execute_code] === true || skillAllowedTools.has(Tools.execute_code),
  });

  for (const call of plannedCalls) {
    if (signal.aborted) {
      break;
    }
    const toolCallId = onToolStart?.({ tool: call.tool, args: call.args });
    if (!toolCallId) {
      onStatus(`Running ${call.tool}...`);
    }
    const result = await callBrowserLocalTool({
      tool: call.tool,
      args: call.args,
      messageId: responseId,
      conversationId,
    });
    onToolEnd?.({ tool: call.tool, args: call.args, result, toolCallId });
    results.push(result);
  }

  if (mcpServerNames.length > 0 && mcpTools.length === 0) {
    results.push({
      tool: `${Constants.mcp_all}${Constants.mcp_delimiter}${mcpServerNames.join(',')}`,
      args: {},
      result: 'No callable MCP tools were available for the selected MCP server(s).',
    });
  }

  return results;
}
