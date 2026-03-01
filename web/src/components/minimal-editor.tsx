import * as React from "react";

import { createHighlighter, type HighlighterGeneric } from "shiki";

import { cn } from "@/lib/utils";

interface MinimalEditorProps {
    value?: string;
    onChange?: (value: string) => void;
    language?: string;
    className?: string;
}

export function MinimalEditor({
    value = "",
    onChange,
    language = "ballerina",
    className,
}: MinimalEditorProps) {
    const [highlighted, setHighlighted] = React.useState("");
    const highlighterRef = React.useRef<HighlighterGeneric<any, any> | null>(
        null,
    );
    const textareaRef = React.useRef<HTMLTextAreaElement>(null);
    const preRef = React.useRef<HTMLPreElement>(null);

    const renderHighlight = React.useCallback(
        (code: string, hl?: HighlighterGeneric<any, any> | null) => {
            const instance = hl || highlighterRef.current;
            if (!instance) return;

            try {
                const html = instance.codeToHtml(code || " ", {
                    lang: language,
                    theme: "github-light",
                });
                const inner = html
                    .replace(/^<pre[^>]*><code[^>]*>/, "")
                    .replace(/<\/code><\/pre>$/, "");
                setHighlighted(inner);
            } catch (e) {
                setHighlighted(code);
            }
        },
        [language],
    );

    React.useEffect(() => {
        let isMounted = true;

        async function initShiki() {
            try {
                const hl = await createHighlighter({
                    themes: ["github-light"],
                    langs: ["ballerina", "toml"],
                });

                if (isMounted) {
                    highlighterRef.current = hl;
                    renderHighlight(value, hl);
                }
            } catch {}
        }

        initShiki();
        return () => {
            isMounted = false;
        };
    }, []);

    React.useEffect(() => {
        renderHighlight(value);
    }, [value, language, renderHighlight]);

    const syncScroll = () => {
        if (textareaRef.current && preRef.current) {
            preRef.current.scrollTop = textareaRef.current.scrollTop;
            preRef.current.scrollLeft = textareaRef.current.scrollLeft;
        }
    };

    const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
        if (e.key === "Tab") {
            e.preventDefault();
            const target = e.currentTarget;
            const { selectionStart, selectionEnd } = target;

            const newValue =
                value.slice(0, selectionStart) +
                "  " +
                value.slice(selectionEnd);
            onChange?.(newValue);

            setTimeout(() => {
                if (textareaRef.current) {
                    textareaRef.current.setSelectionRange(
                        selectionStart + 2,
                        selectionStart + 2,
                    );
                }
            }, 0);
        }
    };

    const sharedClasses =
        "p-4 leading-[22.5px] font-sans whitespace-pre overflow-auto absolute inset-0 box-border [tab-size:2]";

    return (
        <div
            className={cn(
                "text-[13px] relative flex overflow-hidden h-full min-h-37.5",
                className,
            )}
        >
            <div className="relative grow">
                <pre
                    ref={preRef}
                    aria-hidden="true"
                    className={cn(
                        sharedClasses,
                        "z-10 pointer-events-none scrollbar-hide",
                    )}
                    dangerouslySetInnerHTML={{ __html: highlighted + "\n" }}
                />
                <textarea
                    ref={textareaRef}
                    value={value}
                    onChange={(e) => onChange?.(e.target.value)}
                    onScroll={syncScroll}
                    onKeyDown={handleKeyDown}
                    spellCheck={false}
                    autoCapitalize="off"
                    autoComplete="off"
                    autoCorrect="off"
                    className={cn(
                        sharedClasses,
                        "z-20 bg-transparent text-transparent caret-blue-500 outline-none resize-none scrollbar-hide",
                    )}
                />
            </div>
        </div>
    );
}
