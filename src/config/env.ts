import { z } from "zod";

if (process.env.NODE_ENV !== "production") {
    await import ("dotenv/config");
}

const envSchema = z.object({
    NODE_ENV: z
        .enum(["development", "production", "test"])
        .default("development")
    ,
    PORT: z
        .string()
        .default("3000")
        .transform((val: string) => {
            const parsed = Number(val);
            if (Number.isNaN(parsed)) {
                throw new Error("PORT must be a number");
            }
            return parsed;
        })
    ,
    GOOGLE_API_KEY: z.string().min(1, "GOOGLE_API_KEY is required"),
    PINECONE_API_KEY: z.string().min(1, "PINECONE_API_KEY is required"),
    PINECONE_INDEX: z.string().min(1, "PINECONE_INDEX is required"),
    HUGGING_FACE_API_KEY: z.string().min(1, "HUGGING_FACE_API_KEY is required")
});

const parsed = envSchema.safeParse(process.env);
if (!parsed.success) {
    console.error("Invalid environment variables:");
    console.error(z.treeifyError(parsed.error));
    process.exit(1);
}

export const env = parsed.data;
