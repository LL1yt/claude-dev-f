import * as vscode from "vscode"

export function logApiRequest(provider: string, modelId: string, requestData: any, responseData: any) {
	const timestamp = new Date().toISOString()
	const logMessage = `
[${timestamp}] API Request to ${provider} (${modelId})
Request:
${JSON.stringify(requestData, null, 2)}

Response:
${JSON.stringify(responseData, null, 2)}
`

	// Log to output channel
	const outputChannel = vscode.window.createOutputChannel("Claude Dev API Logs")
	outputChannel.appendLine(logMessage)
	outputChannel.show()

	// You can also log to a file if needed
	// vscode.workspace.fs.writeFile(vscode.Uri.file('path/to/logfile.log'), Buffer.from(logMessage));
}
