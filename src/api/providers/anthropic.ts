import { Anthropic } from "@anthropic-ai/sdk"
import { ApiHandler, ApiHandlerMessageResponse } from "../index"
import {
	anthropicDefaultModelId,
	AnthropicModelId,
	anthropicModels,
	ApiHandlerOptions,
	ModelInfo,
} from "../../shared/api"

export class AnthropicHandler implements ApiHandler {
	private options: ApiHandlerOptions
	private client: Anthropic
	private cachedMessages: Anthropic.Messages.MessageParam[] = []

	constructor(options: ApiHandlerOptions) {
		this.options = options
		this.client = new Anthropic({
			apiKey: this.options.apiKey,
			baseURL: this.options.anthropicBaseUrl || undefined,
		})
	}

	async createMessage(
		systemPrompt: string,
		messages: Anthropic.Messages.MessageParam[],
		tools: Anthropic.Messages.Tool[]
	): Promise<ApiHandlerMessageResponse> {
		const modelId = this.getModel().id
		const newMessages = this.getNewMessages(messages)

		switch (modelId) {
			case "claude-3-5-sonnet-20240620":
			case "claude-3-opus-20240229":
			case "claude-3-haiku-20240307": {
				const message = await this.client.beta.promptCaching.messages.create(
					{
						model: modelId,
						max_tokens: this.getModel().info.maxTokens,
						temperature: 0.2,
						system: [{ text: systemPrompt, type: "text", cache_control: { type: "ephemeral" } }],
						messages: this.prepareCachedMessages(newMessages),
						tools,
						tool_choice: { type: "auto" },
					},
					this.getPromptCachingHeaders(modelId)
				)

				this.updateCachedMessages(newMessages)
				return { message }
			}
			default: {
				const message = await this.client.messages.create({
					model: modelId,
					max_tokens: this.getModel().info.maxTokens,
					temperature: 0.2,
					system: [{ text: systemPrompt, type: "text" }],
					messages: newMessages,
					tools,
					tool_choice: { type: "auto" },
				})

				this.updateCachedMessages(newMessages)
				return { message }
			}
		}
	}

	private getNewMessages(messages: Anthropic.Messages.MessageParam[]): Anthropic.Messages.MessageParam[] {
		const lastCachedIndex = this.cachedMessages.length - 1
		return messages.slice(lastCachedIndex + 1)
	}

	private prepareCachedMessages(newMessages: Anthropic.Messages.MessageParam[]): Anthropic.Messages.MessageParam[] {
		const preparedMessages = [...this.cachedMessages, ...newMessages]

		if (preparedMessages.length > 0) {
			const lastUserMsgIndex = preparedMessages.map((msg) => msg.role).lastIndexOf("user")
			if (lastUserMsgIndex !== -1) {
				preparedMessages[lastUserMsgIndex] = this.makeMessageEphemeral(preparedMessages[lastUserMsgIndex])
			}
		}

		return preparedMessages
	}

	private makeMessageEphemeral(message: Anthropic.Messages.MessageParam): Anthropic.Messages.MessageParam {
		return {
			...message,
			content: Array.isArray(message.content)
				? message.content.map((content) => ({ ...content, cache_control: { type: "ephemeral" } }))
				: [{ type: "text", text: message.content, cache_control: { type: "ephemeral" } }],
		}
	}

	private updateCachedMessages(newMessages: Anthropic.Messages.MessageParam[]) {
		this.cachedMessages = [...this.cachedMessages, ...newMessages]
	}

	private getPromptCachingHeaders(modelId: string): { headers: { "anthropic-beta": string } } | undefined {
		switch (modelId) {
			case "claude-3-5-sonnet-20240620":
			case "claude-3-haiku-20240307":
				return {
					headers: { "anthropic-beta": "prompt-caching-2024-07-31" },
				}
			default:
				return undefined
		}
	}

	getModel(): { id: AnthropicModelId; info: ModelInfo } {
		const modelId = this.options.apiModelId
		if (modelId && modelId in anthropicModels) {
			const id = modelId as AnthropicModelId
			return { id, info: anthropicModels[id] }
		}
		return { id: anthropicDefaultModelId, info: anthropicModels[anthropicDefaultModelId] }
	}
}
