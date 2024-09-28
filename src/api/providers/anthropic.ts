import { Anthropic } from "@anthropic-ai/sdk"
import { ApiHandler, ApiHandlerMessageResponse } from "../index"
import {
	anthropicDefaultModelId,
	AnthropicModelId,
	anthropicModels,
	ApiHandlerOptions,
	ModelInfo,
} from "../../shared/api"
import * as vscode from "vscode"
import { logApiRequest } from "../../utils/logging"

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

		if (this.options.showConfirmationDialog) {
			// Prepare request data for confirmation
			const requestData = this.prepareRequestData(systemPrompt, newMessages, tools, modelId)

			// Show confirmation dialog
			const confirmed = await this.showConfirmationDialog(requestData)

			if (!confirmed) {
				throw new Error("API request cancelled by user")
			}
		}

		// Prepare the request data for logging
		const requestData = {
			model: modelId,
			max_tokens: this.getModel().info.maxTokens,
			temperature: 0.2,
			system: systemPrompt,
			messages: this.prepareCachedMessages(newMessages),
			tools,
			tool_choice: { type: "auto" } as const,
		}

		let message: Anthropic.Messages.Message

		// Proceed with the API request
		switch (modelId) {
			case "claude-3-5-sonnet-20240620":
			case "claude-3-opus-20240229":
			case "claude-3-haiku-20240307": {
				message = await this.client.beta.promptCaching.messages.create(
					{
						...requestData,
						system: [{ text: systemPrompt, type: "text", cache_control: { type: "ephemeral" } }],
					},
					this.getPromptCachingHeaders(modelId)
				)
				break
			}
			default: {
				message = await this.client.messages.create({
					...requestData,
					system: [{ text: systemPrompt, type: "text" }],
				})
				break
			}
		}

		// Log the API request and response
		logApiRequest("Anthropic", modelId, requestData, message)

		this.updateCachedMessages(newMessages)
		return { message }
	}

	private prepareRequestData(
		systemPrompt: string,
		messages: Anthropic.Messages.MessageParam[],
		tools: Anthropic.Messages.Tool[],
		modelId: string
	) {
		// Estimate token count (this is a simplified estimation, you may need a more accurate method)
		const estimatedTokens = this.estimateTokenCount(systemPrompt, messages, tools)

		return {
			modelId,
			estimatedTokens,
			systemPromptPreview: systemPrompt.slice(0, 100) + (systemPrompt.length > 100 ? "..." : ""),
			messageCount: messages.length,
			toolCount: tools.length,
		}
	}

	private estimateTokenCount(
		systemPrompt: string,
		messages: Anthropic.Messages.MessageParam[],
		tools: Anthropic.Messages.Tool[]
	): number {
		// This is a very rough estimation. You may want to use a more accurate tokenizer.
		const estimateTokens = (text: string) => text.split(/\s+/).length

		let totalTokens = estimateTokens(systemPrompt)

		for (const message of messages) {
			if (typeof message.content === "string") {
				totalTokens += estimateTokens(message.content)
			} else if (Array.isArray(message.content)) {
				for (const content of message.content) {
					if (content.type === "text") {
						totalTokens += estimateTokens(content.text)
					}
				}
			}
		}

		for (const tool of tools) {
			totalTokens += estimateTokens(JSON.stringify(tool))
		}

		return totalTokens
	}

	private async showConfirmationDialog(requestData: any): Promise<boolean> {
		const result = await vscode.window.showInformationMessage(
			`Sending request to ${requestData.modelId}:\n` +
				`Estimated tokens: ${requestData.estimatedTokens}\n` +
				`System prompt: ${requestData.systemPromptPreview}\n` +
				`Messages: ${requestData.messageCount}, Tools: ${requestData.toolCount}`,
			{ modal: true },
			"Proceed",
			"Cancel"
		)

		return result === "Proceed"
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
