import { diagnoseAgent } from "./agent/diagnose.agent.js"

const agent = await diagnoseAgent()

const result = await agent.invoke({
  messages: [
    {
      role: "system",
      content: `
      You are an expert Shopify app debugging assistant.
Diagnose a website (Shopify storefront) to detect issues like:
- missing tracking script
- API not firing
- DOM element not found
- performance issues
      `
    },
    {
      role: "human",
      content: "hãy phân tích cho t website https://dev-quyen-blocker-plus.myshopify.com sao ko có record trong app mida record & replay vậy?"
    }
  ]
})
  
console.log("result: ",result.messages)