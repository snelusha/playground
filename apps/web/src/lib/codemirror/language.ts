import { StreamLanguage } from "@codemirror/language";
import { toml } from "@codemirror/legacy-modes/mode/toml";

import { ballerinaLanguage } from "./ballerina-language";

const tomlLanguage = StreamLanguage.define(toml);

export type EditorLanguageId = "ballerina" | "toml" | "text";

export function languageSupportFor(id: EditorLanguageId) {
	switch (id) {
		case "ballerina":
			return ballerinaLanguage;
		case "toml":
			return tomlLanguage;
		default:
			return [];
	}
}
