package main

import (
	"ballerina-lang-go/projects"
	"strings"
)

func jsDiagnostics(diagResult projects.DiagnosticResult) map[string]any {
	diagnosticsPayload := make([]any, 0, len(diagResult.Diagnostics()))

	for _, d := range diagResult.Diagnostics() {
		entry := map[string]any{
			"severity": strings.ToLower(d.DiagnosticInfo().Severity().String()),
			"code":     d.DiagnosticInfo().Code(),
			"message":  d.Message(),
		}

		location := d.Location()
		if location != nil {
			lineRange := location.LineRange()
			entry["filePath"] = lineRange.FileName()
			entry["startLine"] = lineRange.StartLine().Line()
			entry["startCol"] = lineRange.StartLine().Offset()
			entry["endLine"] = lineRange.EndLine().Line()
			entry["endCol"] = lineRange.EndLine().Offset()
		}

		diagnosticsPayload = append(diagnosticsPayload, entry)
	}

	return map[string]any{
		"diagnostics": diagnosticsPayload,
		"hasErrors":   diagResult.HasErrors(),
	}
}
