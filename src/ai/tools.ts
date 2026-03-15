// import { tool } from "@langchain/core/tools";
// import { z } from "zod";
// import { retrieveFromNamespace } from "../../services/retrieve.js"

// const retrieveSchema = z.object({
//   query: z.string().describe("The user query to retrieve context for"),
// });

// export const retrieveCommunity = tool(
//   async ({ query }) => {
//     const results = await retrieveFromNamespace(query, "community", 3);
//     return results.join("\n");
//   },
//   {
//     name: "retrieveCommunity",
//     description:
//       "Retrieve information from community posts and shared experiences",
//     schema: retrieveSchema,
//   }
// );

// export const retrieveMedical = tool(
//   async ({ query }) => {
//     const results = await retrieveFromNamespace(query, "medical", 3);
//     return results.join("\n");
//   },
//   {
//     name: "retrieveMedical",
//     description:
//       "Retrieve information from curated medical guides and documents",
//     schema: retrieveSchema,
//   }
// );