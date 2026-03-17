export interface Citation {
    index: number
    source: "community" | "medical"
    documentId: string
    title?: string
    type?: "post" | "reply"
    // reply-specific (only present when type === "reply")
    snippet?: string
    parentPostId?: string
}

