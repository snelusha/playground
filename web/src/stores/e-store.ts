import { create } from "zustand";

import { useFileStore } from "@/stores/file-store";

export type EState = {
    content: string | null;
    language: string | null;
};

export const useEStore = create<EState>(() => {
    return {
        content: "",
        // content: selectedFile?.content ?? null,
        language: "ballerina",
    };
});
