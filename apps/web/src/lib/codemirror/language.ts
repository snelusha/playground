import { StreamLanguage } from "@codemirror/language";
import { toml } from "@codemirror/legacy-modes/mode/toml";

import { ballerinaLanguage } from "@/lib/codemirror/ballerina-language";

const tomlLanguage = StreamLanguage.define(toml);

export type EditorLanguage = "ballerina" | "toml" | "text";

export function languageSupportFor(lang: EditorLanguage) {
	switch (lang) {
		case "ballerina":
			return ballerinaLanguage;
		case "toml":
			return tomlLanguage;
		case "text":
			return [];
	}
}
