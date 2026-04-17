Bun.serve({
	fetch(req, server) {
		server.upgrade(req);
	},
	websocket: {
		message(ws, message) {
			const data = JSON.parse(message.toString());
			if (data.method === "initialize") {
				ws.send(
					JSON.stringify({
						jsonrpc: "2.0",
						id: 1,
						result: {
							capabilities: {
								textDocumentSync: {
									openClose: true,
									change: 2,
								},
								completionProvider: {
									triggerCharacters: [".", ":", ">", '"', "'", "/", "@"],
									resolveProvider: false,
								},
								hoverProvider: true,
								signatureHelpProvider: {
									triggerCharacters: ["(", ","],
									retriggerCharacters: [")"],
								},
								definitionProvider: true,
								declarationProvider: true,
								typeDefinitionProvider: true,
								implementationProvider: true,
								referencesProvider: true,
								documentFormattingProvider: true,
								renameProvider: true,
								diagnosticProvider: {
									interFileDependencies: false,
									workspaceDiagnostics: false,
								},
							},
							serverInfo: {
								name: "sithi",
								version: "1.0.0",
							},
						},
					}),
				);
			} else {
				console.log(data);
			}
		},
		open(ws) {
			console.log("WebSocket connection opened");
		},
		close(ws, code, message) {
			console.log(`WebSocket connection closed: ${code} - ${message}`);
		},
		drain(ws) {},
	},
});
