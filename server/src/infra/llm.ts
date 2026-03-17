import { ChatGoogle } from "@langchain/google";
import { env } from "../config/env.js";

export const llm = new ChatGoogle({
    model: "gemini-2.5-flash",
    apiKey: env.GOOGLE_API_KEY,
    temperature: 0.3,
});
