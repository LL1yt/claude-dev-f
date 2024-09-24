import { Anthropic } from "@anthropic-ai/sdk"
import { ApiConfiguration, ModelInfo } from "../shared/api"
import { AnthropicHandler } from "./anthropic"
import { OpenAiHandler } from "./openai"

export interface ApiHandlerMessageResponse {
	message: Anthropic.Messages.Message
	userCredits?: number
}

export interface ApiHandler {
	createMessage(
		systemPrompt: string,
		messages: Anthropic.Messages.MessageParam[],
		tools: Anthropic.Messages.Tool[]
	): Promise<ApiHandlerMessageResponse>

	getModel(): { id: string; info: ModelInfo }
}

export function buildApiHandler(configuration: ApiConfiguration): ApiHandler {
	const { apiProvider, ...options } = configuration
	switch (apiProvider) {
		case "anthropic":
			return new AnthropicHandler(options)
		case "openai":
			return new OpenAiHandler(options)
		case "ollama":
		default:
			return new AnthropicHandler(options)
	}
}
