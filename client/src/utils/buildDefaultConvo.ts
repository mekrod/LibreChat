import {
  parseConvo,
  EModelEndpoint,
  isAgentsEndpoint,
  isEphemeralAgentId,
  isAssistantsEndpoint,
} from 'librechat-data-provider';
import type { TConversation, EndpointSchemaKey } from 'librechat-data-provider';
import { clearModelForNonEphemeralAgent } from './endpoints';
import { getLocalStorageItems } from './localStorage';
import { browserLocalEndpoint, browserLocalModel } from './browserLocal';

const buildDefaultConvo = ({
  models,
  conversation,
  endpoint = null,
  lastConversationSetup,
  defaultParamsEndpoint,
}: {
  models: string[];
  conversation: TConversation;
  endpoint?: EModelEndpoint | string | null;
  lastConversationSetup: TConversation | null;
  defaultParamsEndpoint?: string | null;
}): TConversation => {
  const { lastSelectedModel, lastSelectedTools } = getLocalStorageItems();
  const endpointType = lastConversationSetup?.endpointType ?? conversation.endpointType;

  if (!endpoint) {
    return {
      ...conversation,
      endpointType,
      endpoint: endpoint as EModelEndpoint | null,
    };
  }

  const availableModels = endpoint === browserLocalEndpoint ? [browserLocalModel] : models;
  const model = lastConversationSetup?.model ?? lastSelectedModel?.[endpoint] ?? '';

  if (endpoint === browserLocalEndpoint) {
    return {
      ...conversation,
      endpoint: endpoint as EModelEndpoint,
      endpointType: undefined,
      assistant_id: undefined,
      agent_id: undefined,
      model: browserLocalModel,
      spec: null,
      iconURL: null,
      modelLabel: null,
      tools: lastConversationSetup?.tools ?? lastSelectedTools ?? conversation.tools,
    };
  }

  let possibleModels: string[];

  if (availableModels.includes(model)) {
    possibleModels = [model, ...availableModels];
  } else {
    possibleModels = [...availableModels];
  }

  const convo = parseConvo({
    endpoint: endpoint as EndpointSchemaKey,
    endpointType: endpointType as EndpointSchemaKey,
    conversation: lastConversationSetup,
    possibleValues: {
      models: possibleModels,
    },
    defaultParamsEndpoint,
  });

  const defaultConvo = {
    ...conversation,
    ...convo,
    endpointType,
    endpoint: endpoint as EModelEndpoint,
  };

  // Ensures assistant_id is always defined
  const assistantId = convo?.assistant_id ?? conversation?.assistant_id ?? '';
  const defaultAssistantId = lastConversationSetup?.assistant_id ?? '';
  if (isAssistantsEndpoint(endpoint) && !defaultAssistantId && assistantId) {
    defaultConvo.assistant_id = assistantId;
  }

  // Ensures agent_id is always defined
  const agentId = convo?.agent_id ?? '';
  const defaultAgentId = lastConversationSetup?.agent_id ?? '';
  if (
    isAgentsEndpoint(endpoint) &&
    agentId &&
    (!defaultAgentId || isEphemeralAgentId(defaultAgentId))
  ) {
    defaultConvo.agent_id = agentId;
  }

  // Clear model for non-ephemeral agents - agents use their configured model internally
  clearModelForNonEphemeralAgent(defaultConvo);

  defaultConvo.tools = lastConversationSetup?.tools ?? lastSelectedTools ?? defaultConvo.tools;

  return defaultConvo;
};

export default buildDefaultConvo;
