import { ingestText } from "./ingest.js";
import { retrieveRelevant } from "./retrieve.js";


// try {
//     await ingestText(
//         "Many breast cancer patients report fatigue during chemotherapy.",
//         { source: "community" }
//     );
// } catch (error) {
//     console.log(error);
// } ;

const res = await retrieveRelevant(
    "Is fatigue common during chemo?"
);

console.log(res);