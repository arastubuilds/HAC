import { cancerSupportAgent } from "./agents/support.js";
import { HumanMessage } from "@langchain/core/messages";

async function run() {
  const result = await cancerSupportAgent.invoke({
    messages: [
      new HumanMessage(
        "Is fatigue common during chemotherapy for breast cancer?"
      ),
    ],
  });

  console.log("Final answer:\n");
  console.log(result.answer);
}

run().catch(console.error);