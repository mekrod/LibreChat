import type { LCTool, LCToolRegistry } from '@librechat/agents';
import type { TMiniAppCustomizationRequest } from 'librechat-data-provider';

export const MINI_APP_LIST_FILES_TOOL_NAME = 'mini_app_list_files';
export const MINI_APP_READ_FILE_TOOL_NAME = 'mini_app_read_file';
export const MINI_APP_WRITE_FILE_TOOL_NAME = 'mini_app_write_file';
export const MINI_APP_DELETE_FILE_TOOL_NAME = 'mini_app_delete_file';
export const MINI_APP_UPDATE_METADATA_TOOL_NAME = 'mini_app_update_metadata';

export const MINI_APP_CODE_AGENT_TOOL_NAMES: ReadonlySet<string> = new Set([
  MINI_APP_LIST_FILES_TOOL_NAME,
  MINI_APP_READ_FILE_TOOL_NAME,
  MINI_APP_WRITE_FILE_TOOL_NAME,
  MINI_APP_DELETE_FILE_TOOL_NAME,
  MINI_APP_UPDATE_METADATA_TOOL_NAME,
]);

const PATH_PARAMETER = Object.freeze({
  type: 'string',
  description: 'Relative mini app source path, for example "src/App.jsx" or "src/styles.css".',
});

const MINI_APP_TOOL_DEFINITIONS: LCTool[] = Object.freeze([
  Object.freeze({
    name: MINI_APP_LIST_FILES_TOOL_NAME,
    description:
      'List the files in the selected saved LibreChat mini app. Use this first before editing.',
    parameters: Object.freeze({
      type: 'object',
      properties: {},
    }) as LCTool['parameters'],
  }) as LCTool,
  Object.freeze({
    name: MINI_APP_READ_FILE_TOOL_NAME,
    description:
      'Read one source file from the selected saved LibreChat mini app. Returns the current full file contents.',
    parameters: Object.freeze({
      type: 'object',
      properties: {
        path: PATH_PARAMETER,
      },
      required: ['path'],
    }) as LCTool['parameters'],
  }) as LCTool,
  Object.freeze({
    name: MINI_APP_WRITE_FILE_TOOL_NAME,
    description:
      'Create or replace one source file in the selected saved LibreChat mini app. Provide complete file contents; this updates the saved app in place.',
    parameters: Object.freeze({
      type: 'object',
      properties: {
        path: PATH_PARAMETER,
        content: {
          type: 'string',
          description: 'Complete replacement contents for the file.',
        },
      },
      required: ['path', 'content'],
    }) as LCTool['parameters'],
  }) as LCTool,
  Object.freeze({
    name: MINI_APP_DELETE_FILE_TOOL_NAME,
    description:
      'Delete one source file from the selected saved LibreChat mini app. Use only when removing a feature or obsolete file.',
    parameters: Object.freeze({
      type: 'object',
      properties: {
        path: PATH_PARAMETER,
      },
      required: ['path'],
    }) as LCTool['parameters'],
  }) as LCTool,
  Object.freeze({
    name: MINI_APP_UPDATE_METADATA_TOOL_NAME,
    description:
      'Update title, description, or entry file for the selected saved LibreChat mini app after source edits.',
    parameters: Object.freeze({
      type: 'object',
      properties: {
        title: {
          type: 'string',
          description: 'Optional new app title.',
        },
        description: {
          type: 'string',
          description: 'Optional new app description.',
        },
        entryFile: PATH_PARAMETER,
      },
    }) as LCTool['parameters'],
  }) as LCTool,
]) as LCTool[];

export function isMiniAppCodeAgentToolName(name: string): boolean {
  return MINI_APP_CODE_AGENT_TOOL_NAMES.has(name);
}

export function getMiniAppCustomization(
  body: Record<string, unknown> | undefined,
): TMiniAppCustomizationRequest | null {
  const raw = body?.miniAppCustomization;
  if (!raw || typeof raw !== 'object') {
    return null;
  }
  const customization = raw as Partial<TMiniAppCustomizationRequest>;
  if (customization.enabled !== true || typeof customization.miniAppId !== 'string') {
    return null;
  }
  if (!customization.miniAppId.trim()) {
    return null;
  }
  return {
    enabled: true,
    miniAppId: customization.miniAppId,
    miniAppTitle: customization.miniAppTitle,
    miniAppDescription: customization.miniAppDescription,
    action: customization.action === 'erase_feature' ? 'erase_feature' : 'add_feature',
  };
}

export function registerMiniAppCodeAgentTools(params: {
  toolRegistry: LCToolRegistry | undefined;
  toolDefinitions: LCTool[] | undefined;
}): { toolDefinitions: LCTool[]; registered: string[] } {
  const { toolRegistry, toolDefinitions } = params;
  const inputDefinitions = toolDefinitions ?? [];
  const registered: string[] = [];
  const newDefs: LCTool[] = [];

  for (const def of MINI_APP_TOOL_DEFINITIONS) {
    const inRegistry = toolRegistry?.has(def.name) === true;
    const inDefinitions = inputDefinitions.some((existing) => existing.name === def.name);
    if (inRegistry || inDefinitions) {
      continue;
    }
    toolRegistry?.set(def.name, def);
    newDefs.push(def);
    registered.push(def.name);
  }

  return {
    toolDefinitions: newDefs.length > 0 ? [...inputDefinitions, ...newDefs] : inputDefinitions,
    registered,
  };
}
