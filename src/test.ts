// import { cancerSupportAgent } from "./agents/support.js";
// import { HumanMessage } from "@langchain/core/messages";

// async function run() {
//   const result = await cancerSupportAgent.invoke({
//     messages: [
//       new HumanMessage(
//         "Is fatigue common during chemotherapy for breast cancer?"
//       ),
//     ],
//   });

//   console.log("Final answer:\n");
//   console.log(result.answer);
// }

// run().catch(console.error);

// import { ingestText } from "./ingest.js";
// import { retrieveRelevant } from "./retrieve.js";


// // try {
// //     await ingestText(
// //         "Many breast cancer patients report fatigue during chemotherapy.",
// //         { source: "community" }
// //     );
// // } catch (error) {
// //     console.log(error);
// // } ;

// const res = await retrieveRelevant(
//     "Is fatigue common during chemo?"
// );

// console.log(res);



// import { redisConnection } from "./infra/redis.js";

// await redisConnection.set("test", "hello");

// const val = await redisConnection.get("test");

// console.log(val);


// import { enqueuePostIngest } from "./queues/postIngest.queue.js";

// await enqueuePostIngest("test-post-id");
